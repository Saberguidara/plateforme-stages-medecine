// Prévenir par e-mail les résidents dont la fiche du semestre en cours est disponible.
// Chaque fiche n'est annoncée qu'une fois (table notifications_fiches) ; l'envoi est lancé
// par un administrateur, après vérification de l'import.
const db = require('../config/db');
const logger = require('../utils/logger');
const { journaliser } = require('../utils/journal');
const { PERIODES_DU_SEMESTRE, semestreCourant } = require('../config/specialites');
const { envoyerMail, envoiPossible, gabarit, echapper } = require('../services/mail');

async function fichesEnAttente() {
    const { semestre, annee } = semestreCourant();
    const [lignes] = await db.query(
        `SELECT f.id, f.periode, f.annee, f.hopital, f.service, r.id AS resident_id, r.nom_prenom, r.email
         FROM formulaires_stage f
         JOIN residents r ON r.id = f.resident_id
         LEFT JOIN notifications_fiches n ON n.fiche_id = f.id
         WHERE n.fiche_id IS NULL AND f.periode IN (?) AND f.annee = ?
         ORDER BY r.id, FIELD(f.periode,'T1','T2','S1','T3','T4','S2','R1','R2')`,
        [PERIODES_DU_SEMESTRE[semestre], annee]
    );
    const parResident = new Map();
    for (const l of lignes) {
        if (!parResident.has(l.resident_id)) {
            parResident.set(l.resident_id, { id: l.resident_id, nom_prenom: l.nom_prenom, email: l.email, fiches: [] });
        }
        parResident.get(l.resident_id).fiches.push(l);
    }
    const residents = [...parResident.values()];
    return {
        semestre,
        annee,
        avecEmail: residents.filter((r) => r.email),
        sansEmail: residents.filter((r) => !r.email)
    };
}

function messageNouvelleFiche(resident) {
    const lignes = resident.fiches.map((f) =>
        `<strong>${echapper(f.periode)} ${f.annee}</strong> : ${echapper(f.hopital || 'hôpital non renseigné')}, ${echapper(f.service || 'service non renseigné')}`);
    return {
        to: resident.email,
        subject: resident.fiches.length > 1 ? 'Vos fiches de stage sont disponibles' : 'Votre fiche de stage est disponible',
        html: gabarit({
            titre: `Bonjour ${echapper(resident.nom_prenom)},`,
            paragraphes: [
                resident.fiches.length > 1
                    ? 'Vos fiches de validation de stage du semestre sont disponibles sur la plateforme :'
                    : 'Votre fiche de validation de stage du semestre est disponible sur la plateforme :',
                lignes.join('<br>'),
                "Connectez-vous avec votre CIN et votre e-mail pour la télécharger. Si une information est fausse, signalez-la depuis votre espace."
            ]
        })
    };
}

exports.apercu = async (req, res) => {
    try {
        const { semestre, annee, avecEmail, sansEmail } = await fichesEnAttente();
        res.json({
            semestre,
            annee,
            residents: avecEmail.length,
            fiches: avecEmail.reduce((n, r) => n + r.fiches.length, 0),
            sansEmail: sansEmail.length,
            envoiPossible: envoiPossible()
        });
    } catch (error) {
        logger.error('Notifications en attente : ' + error);
        res.status(500).json({ message: 'Erreur lors du comptage des notifications.' });
    }
};

// Vérifié avant la limite d'envois, pour qu'une demande refusée ne compte pas.
exports.verifierEnvoi = (req, res, next) => {
    if (!envoiPossible()) {
        return res.status(503).json({ message: "L'envoi d'e-mails n'est pas configuré sur le serveur (Brevo)." });
    }
    next();
};

exports.envoyer = async (req, res) => {
    try {
        const { semestre, annee, avecEmail } = await fichesEnAttente();
        let envoyes = 0;
        let fiches = 0;
        const echecs = [];
        for (const resident of avecEmail) {
            try {
                await envoyerMail(messageNouvelleFiche(resident));
                await db.query(
                    'INSERT IGNORE INTO notifications_fiches (fiche_id, resident_id) VALUES ?',
                    [resident.fiches.map((f) => [f.id, resident.id])]
                );
                envoyes++;
                fiches += resident.fiches.length;
            } catch (err) {
                logger.error(`Notification du résident ${resident.id} : ${err}`);
                echecs.push(resident.id);
            }
        }
        if (envoyes > 0) {
            await journaliser(null, req, {
                action: 'notification', entite: 'notification',
                apres: { semestre, annee, residents: envoyes, fiches, echecs: echecs.length }
            });
        }
        res.json({
            success: echecs.length === 0,
            envoyes,
            fiches,
            echecs: echecs.length,
            message: echecs.length === 0
                ? `${envoyes} résident(s) prévenu(s) par e-mail.`
                : `${envoyes} résident(s) prévenu(s) ; ${echecs.length} envoi(s) en échec, à relancer plus tard.`
        });
    } catch (error) {
        logger.error('Envoi des notifications : ' + error);
        res.status(500).json({ message: "Erreur lors de l'envoi des e-mails." });
    }
};
