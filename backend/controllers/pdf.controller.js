const db = require('../config/db');
const logger = require('../utils/logger');
const { genererFiche } = require('../services/pdf.service');
const { specialiteDe, libellePeriode } = require('../config/specialites');
const { validateFichePayload } = require('../utils/validation');

// Niveau (année de résidanat) au moment du stage, déduit de la promotion.
function niveauPourAnnee(resident, annee) {
    const promotion = parseInt(resident.promotion, 10);
    if (promotion > 0 && annee) {
        const niveau = parseInt(annee, 10) - promotion + 1;
        if (niveau > 0) return niveau;
    }
    return resident.niveau;
}

async function envoyerFiche(res, resident, fiche) {
    const specialite = specialiteDe(resident.specialite);
    if (!specialite) {
        return res.status(422).json({ message: `Aucun modèle de fiche pour la spécialité « ${resident.specialite} ».` });
    }

    const pdf = await genererFiche(specialite.modele, {
        nomPrenom: resident.nom_prenom,
        niveau: niveauPourAnnee(resident, fiche.annee),
        periode: libellePeriode(specialite, fiche.periode, fiche.annee),
        hopital: fiche.hopital,
        service: fiche.service
    });

    const nomFichier = `Fiche_${resident.cin}_${fiche.periode}_${fiche.annee}.pdf`.replace(/[^\w.-]/g, '_');
    res.set({
        'Content-Type': 'application/pdf',
        'Content-Length': pdf.length,
        'Content-Disposition': `inline; filename="${nomFichier}"`
    });
    res.send(Buffer.from(pdf));
}

// Fiche enregistrée : toutes les données viennent de la base.
// Un résident ne peut obtenir que ses propres fiches.
exports.generatePdf = async (req, res) => {
    const ficheId = parseInt(String(req.body.ficheId), 10);
    if (Number.isNaN(ficheId) || ficheId <= 0) {
        return res.status(400).json({ message: 'Identifiant de fiche invalide.' });
    }

    try {
        const [rows] = await db.query(
            `SELECT f.id, f.periode, f.annee, f.service, f.hopital,
                    r.id AS resident_id, r.cin, r.nom_prenom, r.specialite, r.niveau, r.promotion
             FROM formulaires_stage f JOIN residents r ON r.id = f.resident_id
             WHERE f.id = ?`,
            [ficheId]
        );
        if (rows.length === 0) return res.status(404).json({ message: 'Fiche introuvable.' });

        const ligne = rows[0];
        const user = req.authUser;
        if (user.role !== 'admin' && !(user.role === 'resident' && user.id === ligne.resident_id)) {
            return res.status(403).json({ message: 'Accès non autorisé à cette fiche.' });
        }

        await envoyerFiche(res, ligne, ligne);
    } catch (error) {
        logger.error('Erreur génération PDF : ' + error.stack);
        res.status(500).json({ message: 'Erreur lors de la génération du PDF' });
    }
};

// Aperçu admin d'un stage pas encore enregistré : le résident vient de la base,
// seules les informations du stage viennent du formulaire.
exports.apercuPdf = async (req, res) => {
    const validation = validateFichePayload(req.body, { requireResidentId: true });
    if (!validation.valid) return res.status(400).json({ message: validation.message });

    try {
        const [residents] = await db.query(
            'SELECT id, cin, nom_prenom, specialite, niveau, promotion FROM residents WHERE id = ?',
            [validation.data.resident_id]
        );
        if (residents.length === 0) return res.status(404).json({ message: 'Résident introuvable.' });

        await envoyerFiche(res, residents[0], validation.data);
    } catch (error) {
        logger.error('Erreur aperçu PDF : ' + error.stack);
        res.status(500).json({ message: "Erreur lors de la génération de l'aperçu" });
    }
};
