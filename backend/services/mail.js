// Envoi des e-mails (code de connexion, nouvelle fiche, réponse à un signalement) via Brevo.
// BREVO_API_KEY : API HTTP (port 443), seule voie possible sur Render gratuit qui bloque les ports SMTP.
// Sinon BREVO_USER/BREVO_PASS : SMTP classique, pratique en local.
// Sans rien de configuré, en développement, le contenu est écrit dans les logs au lieu d'être envoyé.
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

let transporteur = null;

const BREVO_API = 'https://api.brevo.com/v3/smtp/email';

function apiConfiguree() {
    return Boolean(process.env.BREVO_API_KEY && !process.env.BREVO_API_KEY.startsWith('REMPLACER'));
}

function smtpConfigure() {
    return Boolean(process.env.BREVO_USER && !process.env.BREVO_USER.startsWith('REMPLACER'));
}

function mailConfigure() {
    return apiConfiguree() || smtpConfigure();
}

// En production, aucun envoi n'est possible sans Brevo ; en développement, on simule.
function envoiPossible() {
    return mailConfigure() || process.env.NODE_ENV !== 'production';
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

async function envoyerParApi({ to, subject, html }) {
    const reponse = await fetch(BREVO_API, {
        method: 'POST',
        headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
            sender: { name: process.env.EMAIL_FROM_NAME || 'Plateforme Stages', email: process.env.EMAIL_FROM },
            to: [{ email: to }],
            subject,
            htmlContent: html
        }),
        signal: AbortSignal.timeout(15000)
    });
    if (!reponse.ok) throw new Error(`Brevo API ${reponse.status} : ${(await reponse.text()).slice(0, 300)}`);
}

async function envoyerMail({ to, subject, html }) {
    if (!mailConfigure()) {
        if (process.env.NODE_ENV === 'production') throw new Error("Brevo non configuré : l'e-mail n'a pas pu partir.");
        logger.info(`[DEV] E-mail non envoyé (Brevo absent) à ${to} : ${subject}`);
        return;
    }
    if (apiConfiguree()) return envoyerParApi({ to, subject, html });
    await obtenirTransporteur().sendMail({
        from: `"${process.env.EMAIL_FROM_NAME || 'Plateforme Stages'}" <${process.env.EMAIL_FROM}>`,
        to,
        subject,
        html
    });
}

module.exports = { envoyerMail, envoiPossible, mailConfigure, gabarit, echapper };
