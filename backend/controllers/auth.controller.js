const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const db = require('../config/db');
const logger = require('../utils/logger');
const { validateCin, validateEmail, normalizeString } = require('../utils/validation');

const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.BREVO_USER,
        pass: process.env.BREVO_PASS
    }
});

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

        const token = jwt.sign(
            { id: admin.id, login: admin.login, role: 'admin' },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.json({ success: true, token });
    } catch (error) {
        logger.error('Admin login error: ' + error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
};

exports.requestOTP = async (req, res) => {
    const cinValidation = validateCin(req.body.cin);
    const emailValidation = validateEmail(req.body.email);

    if (!cinValidation.valid) {
        return res.status(400).json({ success: false, message: 'CIN et Email requis' });
    }
    if (!emailValidation.valid) {
        return res.status(400).json({ success: false, message: emailValidation.message });
    }

    const cin = cinValidation.value;
    const email = emailValidation.value;

    try {
        const [residents] = await db.query('SELECT id, cin, nom_prenom, email, otp_expires_at FROM residents WHERE cin = ?', [cin]);
        if (residents.length === 0) {
            return res.status(404).json({ success: false, message: 'Résident introuvable' });
        }

        const resident = residents[0];

        if (resident.otp_expires_at) {
            const timeGenerated = new Date(resident.otp_expires_at).getTime() - (10 * 60000);
            const timeElapsedInSeconds = Math.floor((Date.now() - timeGenerated) / 1000);
            if (timeElapsedInSeconds < 120) {
                const waitTime = 120 - timeElapsedInSeconds;
                return res.status(429).json({
                    success: false,
                    message: `Veuillez patienter ${waitTime} secondes avant de demander un nouveau code.`,
                    waitTime
                });
            }
        }

        if (!resident.email) {
            await db.query('UPDATE residents SET email = ? WHERE id = ?', [email, resident.id]);
        } else if (resident.email !== email) {
            return res.status(400).json({ success: false, message: 'Cet email ne correspond pas à ce dossier résident.' });
        }

        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60000);

        await db.query('UPDATE residents SET otp_code = ?, otp_expires_at = ? WHERE id = ?', [otpCode, expiresAt, resident.id]);

        if (!process.env.BREVO_USER || process.env.BREVO_USER.startsWith('REMPLACER')) {
            return res.json({ success: true, message: 'Mode Dev: Check database for OTP or configure BREVO_USER properly.' });
        }

        transporter.sendMail({
            from: `"${process.env.EMAIL_FROM_NAME || 'Plateforme Stages'}" <${process.env.EMAIL_FROM}>`,
            to: email,
            subject: 'Code de connexion OTP',
            html: `
                <h3>Bonjour ${resident.nom_prenom},</h3>
                <p>Voici votre code de sécurité pour accéder à la plateforme :</p>
                <h2 style="color: blue; letter-spacing: 5px;">${otpCode}</h2>
                <p>Ce code expire dans 10 minutes. Ne le partagez avec personne.</p>
            `
        }).then(() => logger.info('Email envoyé avec succès.'))
            .catch((error) => logger.error("Erreur d'envoi email : " + error));

        return res.json({ success: true, message: 'Code OTP envoyé par email.' });
    } catch (error) {
        logger.error('Erreur OTP : ' + error);
        res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
};

exports.verifyOTP = async (req, res) => {
    const cinValidation = validateCin(req.body.cin);
    const otpCode = normalizeString(req.body.otpCode);

    if (!cinValidation.valid || !otpCode) {
        return res.status(400).json({ success: false, message: 'CIN et code OTP requis.' });
    }

    const cin = cinValidation.value;

    try {
        const [residents] = await db.query('SELECT id, nom_prenom, otp_code, otp_expires_at FROM residents WHERE cin = ?', [cin]);
        if (residents.length === 0) {
            return res.status(404).json({ success: false, message: 'Résident introuvable' });
        }

        const resident = residents[0];
        const now = new Date();
        const expirationDate = new Date(resident.otp_expires_at);

        if (!resident.otp_code || resident.otp_code !== otpCode || now > expirationDate) {
            return res.status(401).json({ success: false, message: 'Code invalide ou expiré' });
        }

        await db.query('UPDATE residents SET otp_code = NULL, otp_expires_at = NULL WHERE id = ?', [resident.id]);

        const token = jwt.sign(
            { id: resident.id, cin, nom_prenom: resident.nom_prenom, role: 'resident' },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.json({ success: true, token });
    } catch (error) {
        logger.error('Erreur serveur lors de la vérification OTP : ' + error);
        res.status(500).json({ success: false, message: 'Erreur serveur lors de la vérification OTP' });
    }
};
