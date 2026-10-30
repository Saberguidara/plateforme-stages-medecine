const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const db = require('../config/db');
const logger = require('../utils/logger');
const { validateCin, validateEmail, normalizeString } = require('../utils/validation');

const OTP_VALIDITE_MS = 10 * 60 * 1000;
const OTP_DELAI_RENVOI_S = 120;
const OTP_ESSAIS_MAX = 5;

// Même réponse que le dossier existe ou non, pour ne pas révéler quels CIN sont inscrits.
const MESSAGE_OTP_ENVOYE = "Si ce CIN et cet e-mail correspondent à un dossier, un code vient d'être envoyé. "
    + "Sans e-mail sous 5 minutes, contactez le service des stages pour vérifier l'adresse enregistrée.";

const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.BREVO_USER,
        pass: process.env.BREVO_PASS
    }
});

function hacherOtp(code) {
    const secret = process.env.OTP_SECRET || process.env.JWT_SECRET;
    return crypto.createHmac('sha256', secret).update(code).digest('hex');
}

function otpCorrect(code, hashAttendu) {
    if (!hashAttendu) return false;
    const a = Buffer.from(hacherOtp(code), 'hex');
    const b = Buffer.from(hashAttendu, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

exports.adminLogin = async (req, res) => {
    const login = normalizeString(req.body.login);
    const password = normalizeString(req.body.password);

    if (!login || !password) {
        return res.status(400).json({ success: false, message: 'Login et mot de passe requis.' });
    }

    try {
        const [results] = await db.query('SELECT * FROM administrateurs WHERE login = ?', [login]);
        if (results.length === 0) {
            return res.status(401).json({ success: false, message: 'Identifiants incorrects' });
        }

        const admin = results[0];
        const isMatch = await bcrypt.compare(password, admin.mot_de_passe);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Identifiants incorrects' });
        }
        if (admin.actif === 0) {
            return res.status(403).json({ success: false, message: 'Ce compte a été désactivé. Contactez un administrateur.' });
        }

        await db.query('UPDATE administrateurs SET derniere_connexion = NOW() WHERE id = ?', [admin.id]);
        // `droits` sert à l'affichage ; le serveur relit le rôle en base à chaque requête.
        const token = jwt.sign(
            { id: admin.id, login: admin.login, nom: admin.nom || null, role: 'admin', droits: admin.role || 'admin' },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.json({ success: true, token });
    } catch (error) {
        logger.error('Admin login error: ' + error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};

// L'e-mail d'un résident est renseigné par l'administration (import ou fiche résident).
// Un code n'est envoyé que si l'adresse saisie est exactement celle enregistrée.
exports.requestOTP = async (req, res) => {
    const cinValidation = validateCin(req.body.cin);
    const emailValidation = validateEmail(req.body.email);

    if (!cinValidation.valid) {
        return res.status(400).json({ success: false, message: 'CIN et Email requis' });
    }
    if (!emailValidation.valid) {
        return res.status(400).json({ success: false, message: emailValidation.message });
    }

    const cin = cinValidation.value.toUpperCase();
    const email = emailValidation.value.toLowerCase();

    try {
        const [residents] = await db.query('SELECT id, nom_prenom, email, otp_sent_at FROM residents WHERE cin = ?', [cin]);
        const resident = residents[0];

        if (!resident || !resident.email || resident.email.toLowerCase() !== email) {
            return res.json({ success: true, message: MESSAGE_OTP_ENVOYE });
        }

        if (resident.otp_sent_at) {
            const ecoule = Math.floor((Date.now() - new Date(resident.otp_sent_at).getTime()) / 1000);
            if (ecoule < OTP_DELAI_RENVOI_S) {
                const waitTime = OTP_DELAI_RENVOI_S - ecoule;
                return res.status(429).json({
                    success: false,
                    message: `Veuillez patienter ${waitTime} secondes avant de demander un nouveau code.`,
                    waitTime
                });
            }
        }

        const otpCode = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
        await db.query(
            'UPDATE residents SET otp_hash = ?, otp_expires_at = ?, otp_sent_at = NOW(), otp_attempts = 0 WHERE id = ?',
            [hacherOtp(otpCode), new Date(Date.now() + OTP_VALIDITE_MS), resident.id]
        );

        if (!process.env.BREVO_USER || process.env.BREVO_USER.startsWith('REMPLACER')) {
            // Le code n'est stocké que haché : en développement sans SMTP, on l'affiche dans les logs.
            if (process.env.NODE_ENV !== 'production') logger.info(`[DEV] Code OTP pour ${cin} : ${otpCode}`);
            else logger.error('BREVO_USER non configuré : aucun e-mail OTP ne peut partir.');
            return res.json({ success: true, message: MESSAGE_OTP_ENVOYE });
        }

        transporter.sendMail({
            from: `"${process.env.EMAIL_FROM_NAME || 'Plateforme Stages'}" <${process.env.EMAIL_FROM}>`,
            to: resident.email,
            subject: 'Code de connexion OTP',
            html: `
                <h3>Bonjour ${escapeHtml(resident.nom_prenom)},</h3>
                <p>Voici votre code de sécurité pour accéder à la plateforme :</p>
                <h2 style="color: blue; letter-spacing: 5px;">${otpCode}</h2>
                <p>Ce code expire dans 10 minutes. Ne le partagez avec personne.</p>
            `
        }).then(() => logger.info('Email envoyé avec succès.'))
            .catch((error) => logger.error("Erreur d'envoi email : " + error));

        return res.json({ success: true, message: MESSAGE_OTP_ENVOYE });
    } catch (error) {
        logger.error('Erreur OTP : ' + error);
        res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
};

exports.verifyOTP = async (req, res) => {
    const cinValidation = validateCin(req.body.cin);
    const otpCode = normalizeString(req.body.otpCode);

    if (!cinValidation.valid || !/^\d{6}$/.test(otpCode)) {
        return res.status(400).json({ success: false, message: 'CIN et code à 6 chiffres requis.' });
    }

    const cin = cinValidation.value.toUpperCase();
    const refus = () => res.status(401).json({ success: false, message: 'Code invalide ou expiré' });

    try {
        const [residents] = await db.query(
            'SELECT id, cin, nom_prenom, otp_hash, otp_expires_at, otp_attempts FROM residents WHERE cin = ?',
            [cin]
        );
        const resident = residents[0];
        if (!resident || !resident.otp_hash || new Date() > new Date(resident.otp_expires_at)) return refus();

        if (resident.otp_attempts >= OTP_ESSAIS_MAX) {
            return res.status(429).json({ success: false, message: 'Trop d\'essais. Demandez un nouveau code.' });
        }

        if (!otpCorrect(otpCode, resident.otp_hash)) {
            await db.query('UPDATE residents SET otp_attempts = otp_attempts + 1 WHERE id = ?', [resident.id]);
            return refus();
        }

        await db.query('UPDATE residents SET otp_hash = NULL, otp_expires_at = NULL, otp_attempts = 0 WHERE id = ?', [resident.id]);

        const token = jwt.sign(
            { id: resident.id, cin: resident.cin, nom_prenom: resident.nom_prenom, role: 'resident' },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.json({ success: true, token, cin: resident.cin });
    } catch (error) {
        logger.error('Erreur serveur lors de la vérification OTP : ' + error);
        res.status(500).json({ success: false, message: 'Erreur serveur lors de la vérification OTP' });
    }
};
