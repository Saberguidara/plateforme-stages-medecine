// Erreurs signalées par les résidents sur leurs fiches, traitées par le service des stages.
const db = require('../config/db');
const logger = require('../utils/logger');
const { journaliser } = require('../utils/journal');
const { normalizeString } = require('../utils/validation');
const { envoyerMail, gabarit, echapper } = require('../services/mail');

const MOTIFS = ['hopital', 'service', 'periode', 'autre'];
const LIBELLES_MOTIFS = { hopital: "l'hôpital", service: 'le service', periode: 'la période', autre: 'autre chose' };
const LONGUEUR_MAX = 500;

// Le résident ne peut signaler qu'une fiche de son propre dossier, une fois tant que le signalement est ouvert.
exports.signaler = async (req, res) => {
    const ficheId = parseInt(String(req.body.ficheId), 10);
    const motif = String(req.body.motif || '');
    const message = normalizeString(req.body.message).slice(0, LONGUEUR_MAX) || null;
    if (!ficheId) return res.status(400).json({ message: 'Fiche manquante.' });
    if (!MOTIFS.includes(motif)) return res.status(400).json({ message: "Précisez ce qui est erroné." });
    if (motif === 'autre' && !message) return res.status(400).json({ message: "Décrivez l'erreur en quelques mots." });

    try {
        const [fiches] = await db.query(
            `SELECT f.id, f.resident_id, f.periode, f.annee, f.hopital, f.service
             FROM formulaires_stage f JOIN residents r ON r.id = f.resident_id
             WHERE f.id = ? AND r.cin = ?`,
            [ficheId, req.resident.cin]
        );
        if (fiches.length === 0) return res.status(404).json({ message: 'Fiche introuvable.' });
        const fiche = fiches[0];

        const [ouverts] = await db.query(
            'SELECT id FROM signalements WHERE fiche_id = ? AND traite_le IS NULL', [ficheId]
        );
        if (ouverts.length > 0) {
            return res.status(409).json({ message: 'Une erreur est déjà signalée sur cette fiche : le service des stages va la traiter.' });
        }

        const [resultat] = await db.query(
            'INSERT INTO signalements (fiche_id, resident_id, motif, message) VALUES (?, ?, ?, ?)',
            [ficheId, fiche.resident_id, motif, message]
        );
        await journaliser(null, req, {
            action: 'signalement', entite: 'fiche', entiteId: ficheId, residentId: fiche.resident_id,
            apres: { periode: fiche.periode, annee: fiche.annee, motif, message }
        });
        res.status(201).json({ success: true, message: 'Signalement envoyé au service des stages.', id: resultat.insertId });
    } catch (error) {
        logger.error('Signalement : ' + error);
        res.status(500).json({ message: "Le signalement n'a pas pu être envoyé." });
    }
};

// Signalements ouverts (par défaut) ou traités, les plus récents en premier.
exports.lister = async (req, res) => {
    const traites = req.query.statut === 'traites';
    try {
        const [lignes] = await db.query(
            `SELECT s.id, s.fiche_id, s.resident_id, s.motif, s.message, s.cree_le, s.traite_le, s.traite_par, s.reponse,
                    r.nom_prenom, r.email IS NOT NULL AND r.email <> '' AS a_email, f.periode, f.annee, f.hopital, f.service
             FROM signalements s
             JOIN formulaires_stage f ON f.id = s.fiche_id
             JOIN residents r ON r.id = s.resident_id
             WHERE s.traite_le IS ${traites ? 'NOT ' : ''}NULL
             ORDER BY ${traites ? 's.traite_le' : 's.cree_le'} DESC
             LIMIT 100`
        );
        res.json(lignes);
    } catch (error) {
        logger.error('Liste des signalements : ' + error);
        res.status(500).json({ message: 'Erreur lors du chargement des signalements.' });
    }
};

// Réponse facultative, visible par le résident sur sa fiche et envoyée par e-mail s'il en a un.
exports.traiter = async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (!id) return res.status(400).json({ message: 'Signalement invalide.' });
    const reponse = normalizeString(req.body && req.body.reponse).slice(0, LONGUEUR_MAX) || null;
    try {
        const [lignes] = await db.query(
            `SELECT s.id, s.fiche_id, s.resident_id, s.motif, s.message, s.traite_le, f.periode, f.annee,
                    r.nom_prenom, r.email
             FROM signalements s
             JOIN formulaires_stage f ON f.id = s.fiche_id
             JOIN residents r ON r.id = s.resident_id
             WHERE s.id = ?`,
            [id]
        );
        if (lignes.length === 0) return res.status(404).json({ message: 'Signalement introuvable.' });
        const s = lignes[0];
        if (s.traite_le) return res.json({ success: true, message: 'Ce signalement était déjà traité.' });

        await db.query(
            'UPDATE signalements SET traite_le = NOW(), traite_par = ?, reponse = ? WHERE id = ? AND traite_le IS NULL',
            [req.admin.login, reponse, id]
        );
        await journaliser(null, req, {
            action: 'traitement', entite: 'fiche', entiteId: s.fiche_id, residentId: s.resident_id,
            apres: { periode: s.periode, annee: s.annee, motif: s.motif, message: s.message, reponse }
        });

        let prevenu = false;
        if (s.email) {
            try {
                await envoyerMail({
                    to: s.email,
                    subject: `Votre signalement sur la fiche ${s.periode} ${s.annee} a été traité`,
                    html: gabarit({
                        titre: `Bonjour ${echapper(s.nom_prenom)},`,
                        paragraphes: [
                            `Le service des stages a traité votre signalement sur la fiche <strong>${echapper(s.periode)} ${s.annee}</strong> (${LIBELLES_MOTIFS[s.motif] || s.motif}).`,
                            ...(reponse ? [`Réponse du service : « ${echapper(reponse)} »`] : []),
                            'Vous pouvez télécharger votre fiche à jour depuis votre espace.'
                        ]
                    })
                });
                prevenu = true;
            } catch (err) {
                logger.error('E-mail de réponse au signalement : ' + err);
            }
        }
        res.json({
            success: true,
            message: prevenu ? 'Signalement traité : le résident a été prévenu par e-mail.' : 'Signalement marqué comme traité.'
        });
    } catch (error) {
        logger.error('Traitement du signalement : ' + error);
        res.status(500).json({ message: "Le signalement n'a pas pu être mis à jour." });
    }
};

exports.MOTIFS = MOTIFS;
