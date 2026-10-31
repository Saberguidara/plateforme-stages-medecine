// Envoi des e-mails aux résidents (nouvelle fiche, réponse à un signalement) via Brevo.
// Sans SMTP configuré, en développement, le contenu est écrit dans les logs au lieu d'être envoyé.
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

let transporteur = null;

function smtpConfigure() {
    return Boolean(process.env.BREVO_USER && !process.env.BREVO_USER.startsWith('REMPLACER'));
}

// En production, aucun envoi n'est possible sans SMTP ; en développement, on simule.
function envoiPossible() {
    return smtpConfigure() || process.env.NODE_ENV !== 'production';
}

function obtenirTransporteur() {
    if (!transporteur) {
        transporteur = nodemailer.createTransport({
            host: 'smtp-relay.brevo.com',
            port: 587,
            secure: false,
            auth: { user: process.env.BREVO_USER, pass: process.env.BREVO_PASS }
        });
    }
    return transporteur;
}

function echapper(texte) {
    return String(texte ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Adresse de la plateforme, pour le lien « ouvrir mon espace » des e-mails.
function urlPlateforme() {
    const url = process.env.APP_URL || (process.env.ALLOWED_ORIGINS || 'http://localhost:4200').split(',')[0];
    return url.trim().replace(/\/$/, '');
}

// Mise en page commune : titre, paragraphes déjà échappés, bouton vers l'espace résident.
function gabarit({ titre, paragraphes, lien = true }) {
    const bouton = lien
        ? `<p style="margin:24px 0"><a href="${urlPlateforme()}/login" style="background:#f47b45;color:#1a1a1a;padding:12px 24px;border-radius:50px;text-decoration:none;font-weight:bold">Ouvrir mon espace résident</a></p>`
        : '';
    return `<div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;max-width:560px">
        <h2 style="font-family:Georgia,serif">${titre}</h2>
        ${paragraphes.map((p) => `<p>${p}</p>`).join('\n')}
        ${bouton}
        <p style="color:#666;font-size:13px">Service des stages - Faculté de médecine de Sfax</p>
    </div>`;
}

async function envoyerMail({ to, subject, html }) {
    if (!smtpConfigure()) {
        if (process.env.NODE_ENV === 'production') throw new Error("SMTP non configuré : l'e-mail n'a pas pu partir.");
        logger.info(`[DEV] E-mail non envoyé (SMTP absent) à ${to} : ${subject}`);
        return;
    }
    await obtenirTransporteur().sendMail({
        from: `"${process.env.EMAIL_FROM_NAME || 'Plateforme Stages'}" <${process.env.EMAIL_FROM}>`,
        to,
        subject,
        html
    });
}

module.exports = { envoyerMail, envoiPossible, gabarit, echapper };
