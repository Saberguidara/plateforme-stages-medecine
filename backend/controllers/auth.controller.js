const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const db = require('../config/db');

// Configuration pour Brevo (anciennement Sendinblue) - Option Professionnelle
// Créez un compte gratuit sur brevo.com, allez dans le menu en haut à droite > SMTP & API
const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false, // true pour le port 465, false pour 587
    auth: {
        user: 'a37ae2001@smtp-brevo.com', // Ton identifiant de connexion Brevo d'après ta capture
        pass: 'xsmtpsib-1dd84b23fd995a3b798511495630d55e2859470411f09332fb650e0bba6c9aff-98fEMLeA9T3xaZvg'  // Ta clé SMTP (Clé API secrète générée depuis l'interface Brevo)
    }
});

exports.adminLogin = async (req, res) => {
    const { login, password } = req.body;
    try {
        const [results] = await db.query('SELECT * FROM administrateurs WHERE login = ? AND mot_de_passe = ?', [login, password]);
        if (results.length > 0) {
            const token = 'jwt_' + Date.now() + '_admin'; // Fake token existant pour l'admin
            res.json({ success: true, token: token });
        } else {
            res.status(401).json({ success: false, message: "Identifiants incorrects" });
        }
    } catch (err) {
        res.status(500).json({ error: "Erreur serveur" });
    }
};

exports.requestOTP = async (req, res) => {
    console.log("=> requestOTP appelé avec le body:", req.body);
    const { cin, email } = req.body;
    if (!cin || !email) {
        console.log("Erreur: CIN ou Email manquant");
        return res.status(400).json({ success: false, message: "CIN et Email requis" });
    }

    try {
        console.log("Recherche du résident dans la base...");
        const [residents] = await db.query('SELECT id, cin, nom_prenom, email, otp_expires_at FROM residents WHERE cin = ?', [cin]);
        if (residents.length === 0) {
            console.log("Erreur: Résident introuvable");
            return res.status(404).json({ success: false, message: "Résident introuvable" });
        }

        const resident = residents[0];
        console.log("Résident trouvé:", resident.id);

        // Vérification du délai de 2 minutes pour éviter le spam
        if (resident.otp_expires_at) {
            const timeGenerated = new Date(resident.otp_expires_at).getTime() - (10 * 60000); // L'instant exact de la précédente génération
            const timeElapsedInSeconds = Math.floor((Date.now() - timeGenerated) / 1000);

            console.log(`Vérification anti-spam: timeElapsed = ${timeElapsedInSeconds} secondes`);

            if (timeElapsedInSeconds < 120) {
                const waitTime = 120 - timeElapsedInSeconds;
                console.log(`Bloqué par l'anti-spam. Attente: ${waitTime}s`);
                return res.status(429).json({
                    success: false,
                    message: `Veuillez patienter ${waitTime} secondes avant de demander un nouveau code.`,
                    waitTime: waitTime
                });
            }
        }

        console.log("Mise à jour de l'email si nécessaire...");

        // Lier l'email au résident si c'est sa première connexion
        if (!resident.email) {
            await db.query('UPDATE residents SET email = ? WHERE id = ?', [email, resident.id]);
        } else if (resident.email !== email) {
            return res.status(400).json({ success: false, message: "Cet email ne correspond pas à ce dossier résident." });
        }

        // Génération d'un code à 6 chiffres
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60000); // Valable 10 minutes

        console.log(`Génération OTP: ${otpCode}, enregistrement en base...`);
        await db.query('UPDATE residents SET otp_code = ?, otp_expires_at = ? WHERE id = ?', [otpCode, expiresAt, resident.id]);
        console.log("Enregistré en base avec succès.");

        // Envoi de l'email (ou impression dans la console en dev)
        if (!transporter.options.auth.user || transporter.options.auth.user === '') {
            console.log("\n==========================================");
            console.log("🔔 [MODE DEV] Email non configuré.");
            console.log(`🔔 Code OTP pour ${email} (CIN: ${cin}) : ${otpCode}`);
            console.log("==========================================\n");
            return res.json({ success: true, message: "Mode Dev: Regardez la console Node.js pour le code OTP." });
        } else {
            // Envoi réel (asynchrone, ne pas bloquer la réponse HTTP)
            console.log("Lancement de l'envoi d'email via Brevo...");
            transporter.sendMail({
                from: '"Plateforme Stages" <saber_guidara@medecinesfax.org>',
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

            console.log("Réponse HTTP 200 renvoyée immédiatement !");
            return res.json({ success: true, message: "Code OTP envoyé par email." });
        }
    } catch (err) {
        console.error("Erreur OTP :", err);
        res.status(500).json({ success: false, message: "Erreur serveur. Si vous testez les mails, vérifiez vos identifiants." });
    }
};

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

        // Invalidation de l'OTP après usage
        await db.query('UPDATE residents SET otp_code = NULL, otp_expires_at = NULL WHERE id = ?', [resident.id]);

        // Création du JWT pour la session du résident
        const token = jwt.sign(
            { id: resident.id, cin: cin, role: 'resident' },
            process.env.JWT_SECRET || 'super_secret_jwt_key',
            { expiresIn: '8h' }
        );

        res.json({ success: true, token });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Erreur serveur lors de la vérification OTP" });
    }
};
