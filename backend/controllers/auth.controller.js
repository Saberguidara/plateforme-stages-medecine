// SEC-1 : Credentials Brevo chargés depuis .env (plus jamais en dur)
// SEC-2 : Vrai JWT admin (plus de faux token)
// SEC-3 : Mot de passe admin comparé via bcrypt (plus de plain-text)

const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const db = require('../config/db');

// Configuration SMTP Brevo via variables d'environnement — SEC-1
const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.BREVO_USER,
        pass: process.env.BREVO_PASS
    }
});

// ==========================================
// Admin Login — SEC-2 + SEC-3
// ==========================================
exports.adminLogin = async (req, res) => {
    const { login, password } = req.body;
    if (!login || !password) {
        return res.status(400).json({ success: false, message: "Login et mot de passe requis." });
    }
    try {
        // Sélection par login uniquement (pas de comparaison en SQL) — SEC-3
        const [results] = await db.query('SELECT * FROM administrateurs WHERE login = ?', [login]);
        if (results.length === 0) {
            return res.status(401).json({ success: false, message: "Identifiants incorrects" });
        }

        const admin = results[0];

        // Comparaison bcrypt — SEC-3
        const isMatch = await bcrypt.compare(password, admin.mot_de_passe);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: "Identifiants incorrects" });
        }

        // Vrai JWT signé — SEC-2
        const token = jwt.sign(
            { id: admin.id, login: admin.login, role: 'admin' },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.json({ success: true, token });
    } catch (err) {
        console.error('Admin login error:', err);
        res.status(500).json({ error: "Erreur serveur" });
    }
};

// ==========================================
// Demande OTP résident
// ==========================================
exports.requestOTP = async (req, res) => {
    const { cin, email } = req.body;
    if (!cin || !email) {
        return res.status(400).json({ success: false, message: "CIN et Email requis" });
    }

    // Validation basique du format email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ success: false, message: "Format d'email invalide." });
    }

    try {
        const [residents] = await db.query('SELECT id, cin, nom_prenom, email, otp_expires_at FROM residents WHERE cin = ?', [cin]);
        if (residents.length === 0) {
            return res.status(404).json({ success: false, message: "Résident introuvable" });
        }

        const resident = residents[0];

        // Anti-spam : fenêtre de 2 minutes — BUG-1 fix (calcul via otp_expires_at)
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

        // Lier l'email au résident si première connexion
        if (!resident.email) {
            await db.query('UPDATE residents SET email = ? WHERE id = ?', [email, resident.id]);
        } else if (resident.email !== email) {
            return res.status(400).json({ success: false, message: "Cet email ne correspond pas à ce dossier résident." });
        }

        // Génération OTP 6 chiffres
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60000);

        await db.query('UPDATE residents SET otp_code = ?, otp_expires_at = ? WHERE id = ?', [otpCode, expiresAt, resident.id]);

        // Envoi email ou mode dev
        if (!process.env.BREVO_USER || process.env.BREVO_USER.startsWith('REMPLACER')) {
            console.log("\n==========================================");
            console.log("🔔 [MODE DEV] SMTP non configuré.");
            console.log(`🔔 Code OTP pour ${email} (CIN: ${cin}) : ${otpCode}`);
            console.log("==========================================\n");
            return res.json({ success: true, message: "Mode Dev: Regardez la console Node.js pour le code OTP." });
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
        }).then(() => console.log("Email Brevo envoyé avec succès !"))
            .catch(e => console.error("Erreur d'envoi Brevo :", e));

        return res.json({ success: true, message: "Code OTP envoyé par email." });

    } catch (err) {
        console.error("Erreur OTP :", err);
        res.status(500).json({ success: false, message: "Erreur serveur." });
    }
};

// ==========================================
// Vérification OTP résident
// ==========================================
exports.verifyOTP = async (req, res) => {
    const { cin, otpCode } = req.body;
    try {
        const [residents] = await db.query('SELECT id, otp_code, otp_expires_at FROM residents WHERE cin = ?', [cin]);
        if (residents.length === 0) {
            return res.status(404).json({ success: false, message: "Résident introuvable" });
        }

        const resident = residents[0];
        const now = new Date();
        const expirationDate = new Date(resident.otp_expires_at);

        if (!resident.otp_code || resident.otp_code !== otpCode || now > expirationDate) {
            return res.status(401).json({ success: false, message: "Code invalide ou expiré" });
        }

        // Invalider l'OTP après usage
        await db.query('UPDATE residents SET otp_code = NULL, otp_expires_at = NULL WHERE id = ?', [resident.id]);

        const token = jwt.sign(
            { id: resident.id, cin: cin, role: 'resident' },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.json({ success: true, token });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Erreur serveur lors de la vérification OTP" });
    }
};
