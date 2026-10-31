const db = require('../config/db');
const logger = require('../utils/logger');
const { validateResidentPayload, validateCin, normalizeString } = require('../utils/validation');
const { SPECIALITES, PERIODES_DU_SEMESTRE, semestreCourant, etatResidanat } = require('../config/specialites');
const { NIVEAU_COURANT, construireFiltres } = require('../services/filtres-residents');
const { journaliser, extraire, CHAMPS_RESIDENT } = require('../utils/journal');

// Remplace le niveau brut par l'année de résidanat en cours, ou « parcours terminé ».
const avecEtat = (r) => ({ ...r, ...etatResidanat(r.specialite, r.niveau) });

const ORDRE_FICHES = "ORDER BY annee ASC, FIELD(periode,'T1','T2','S1','T3','T4','S2','R1','R2',periode)";
const ORDRE_FICHES_F = "ORDER BY f.annee ASC, FIELD(f.periode,'T1','T2','S1','T3','T4','S2','R1','R2',f.periode)";

exports.getResidentByCin = async (req, res) => {
    const cinValidation = validateCin(req.params.cin);
    if (!cinValidation.valid) {
        return res.status(400).json({ success: false, message: cinValidation.message });
    }
    const cin = cinValidation.value;

    if (req.authUser.role === 'resident' && req.authUser.cin !== cin) {
        return res.status(403).json({ error: 'Accès non autorisé à ce dossier.' });
    }

    try {
        const [residents] = await db.query(
            `SELECT id, cin, nom_prenom, email, specialite, faculte_origine,
                IF(promotion IS NOT NULL AND promotion > 0, YEAR(CURRENT_DATE) - promotion + 1, niveau) as niveau, promotion
             FROM residents WHERE cin = ?`,
            [cin]
        );

        if (residents.length === 0) {
            return res.status(404).json({ message: 'Résident introuvable' });
        }

        const resident = avecEtat(residents[0]);
        const [fiches] = await db.query(
            `SELECT id, periode, annee, service, hopital, url_pdf FROM formulaires_stage
             WHERE resident_id = ? ${ORDRE_FICHES}`,
            [resident.id]
        );

        res.json({ ...resident, fiches });
    } catch (error) {
        logger.error('Erreur lors de la recherche : ' + error);
        res.status(500).json({ error: 'Erreur serveur lors de la recherche' });
    }
};

// Dossier complet d'un résident pour l'administration : identité, fiches avec leur année
// de résidanat et leurs téléchargements.
exports.getResidentById = async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (!id) return res.status(400).json({ message: 'Identifiant de résident invalide.' });

    try {
        const [residents] = await db.query(
            `SELECT r.id, r.cin, r.nom_prenom, r.email, r.specialite, r.faculte_origine, r.promotion, r.niveau AS niveau_saisi,
                    CAST(${NIVEAU_COURANT} AS SIGNED) AS niveau
             FROM residents r WHERE r.id = ?`,
            [id]
        );
        if (residents.length === 0) return res.status(404).json({ message: 'Résident introuvable.' });
        const resident = avecEtat(residents[0]);

        const [fiches] = await db.query(
            `SELECT f.id, f.periode, f.annee, f.service, f.hopital, f.import_id, f.modifie_le,
                    CAST(IF(? > 0, f.annee - ? + 1, ?) AS SIGNED) AS annee_residanat,
                    (SELECT COUNT(*) FROM telechargements t WHERE t.fiche_id = f.id) AS nb_telechargements,
                    (SELECT MAX(t.telecharge_le) FROM telechargements t WHERE t.fiche_id = f.id) AS dernier_telechargement
             FROM formulaires_stage f WHERE f.resident_id = ? ${ORDRE_FICHES_F}`,
            [resident.promotion || 0, resident.promotion || 0, resident.niveau_saisi, id]
        );

        const { semestre, annee } = semestreCourant();
        const periodesSemestre = PERIODES_DU_SEMESTRE[semestre];
        const fichesSemestre = fiches.filter((f) => f.annee === annee && periodesSemestre.includes(f.periode));

        res.json({
            ...resident,
            fiches,
            semestreCourant: {
                semestre,
                annee,
                fiches: fichesSemestre.length,
                recuperee: fichesSemestre.some((f) => f.nb_telechargements > 0)
            }
        });
    } catch (error) {
        logger.error('Dossier résident : ' + error);
        res.status(500).json({ error: 'Erreur lors du chargement du dossier' });
    }
};

const COLONNES_TRI = ['cin', 'nom_prenom', 'specialite', 'faculte_origine', 'promotion', 'niveau', 'nb_fiches'];

// Liste paginée ; les mêmes filtres servent à l'export Excel.
async function listerResidents(query, { pagination = true } = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(query.limit, 10) || 20));
    const orderBy = COLONNES_TRI.includes(query.sortCol) ? query.sortCol : 'nom_prenom';
    const orderDir = query.sortDesc === 'true' ? 'DESC' : 'ASC';
    const { where, params } = await construireFiltres(query);

    const { semestre, annee } = semestreCourant();
    const periodes = PERIODES_DU_SEMESTRE[semestre];

    const [rows] = await db.query(
        `SELECT r.id, r.cin, r.nom_prenom, r.email, r.specialite, r.faculte_origine, r.promotion,
                ${NIVEAU_COURANT} AS niveau,
                (SELECT COUNT(id) FROM formulaires_stage WHERE resident_id = r.id) AS nb_fiches,
                (SELECT COUNT(id) FROM formulaires_stage WHERE resident_id = r.id AND periode IN (?) AND annee = ?) AS fiches_semestre,
                (SELECT COUNT(*) FROM telechargements t JOIN formulaires_stage f ON f.id = t.fiche_id
                 WHERE t.resident_id = r.id AND f.periode IN (?) AND f.annee = ?) AS telechargements_semestre
         FROM residents r
         ${where}
         ORDER BY ${orderBy} ${orderDir}, r.id ASC
         ${pagination ? 'LIMIT ? OFFSET ?' : ''}`,
        [periodes, annee, periodes, annee, ...params, ...(pagination ? [limit, (page - 1) * limit] : [])]
    );

    const [countResult] = await db.query(`SELECT COUNT(*) as total FROM residents r ${where}`, params);
    return { rows: rows.map(avecEtat), total: countResult[0].total, page, limit };
}
exports.listerResidents = listerResidents;

exports.getAllResidents = async (req, res) => {
    try {
        const { rows, total, page, limit } = await listerResidents(req.query);
        // Résidents qui ne peuvent pas se connecter, sur toute la base (indépendant des filtres)
        const [sansEmailResult] = await db.query("SELECT COUNT(*) AS n FROM residents WHERE email IS NULL OR email = ''");
        res.json({ data: rows, total, page, limit, sansEmail: sansEmailResult[0].n });
    } catch (error) {
        logger.error('Get all residents error: ' + error);
        res.status(500).json({ error: 'Erreur lors de la récupération des résidents' });
    }
};

// Recherche globale de la barre d'administration : CIN ou nom, 8 suggestions au plus.
exports.rechercheRapide = async (req, res) => {
    const q = normalizeString(req.query.q).slice(0, 60);
    if (q.length < 2) return res.json([]);
    try {
        const [rows] = await db.query(
            `SELECT r.id, r.cin, r.nom_prenom, r.promotion, r.specialite, ${NIVEAU_COURANT} AS niveau
             FROM residents r
             WHERE r.cin LIKE ? OR r.nom_prenom LIKE ?
             ORDER BY (r.cin = ?) DESC, (r.cin LIKE ?) DESC, r.nom_prenom ASC
             LIMIT 8`,
            [`${q}%`, `%${q}%`, q, `${q}%`]
        );
        res.json(rows.map(avecEtat));
    } catch (error) {
        logger.error('Recherche rapide : ' + error);
        res.status(500).json({ error: 'Erreur lors de la recherche' });
    }
};

// Contrôle immédiat à la saisie : ce CIN appartient-il déjà à un autre résident ?
exports.verifierCin = async (req, res) => {
    const cin = normalizeString(req.query.cin).replace(/\s/g, '').toUpperCase();
    const exclure = parseInt(req.query.exclure, 10) || 0;
    if (!cin) return res.json({ existe: false });
    try {
        const [rows] = await db.query('SELECT id, nom_prenom FROM residents WHERE cin = ? AND id <> ?', [cin, exclure]);
        res.json(rows.length ? { existe: true, resident: rows[0] } : { existe: false });
    } catch (error) {
        logger.error('Vérification CIN : ' + error);
        res.status(500).json({ error: 'Erreur lors de la vérification' });
    }
};

exports.createResident = async (req, res) => {
    const validation = validateResidentPayload(req.body);
    if (!validation.valid) {
        return res.status(400).json({ success: false, message: validation.message });
    }

    const { cin, nom_prenom, email, specialite, faculte_origine, niveau, promotion } = validation.data;

    try {
        const [existing] = await db.query('SELECT id FROM residents WHERE cin = ?', [cin]);
        if (existing.length > 0) {
            return res.status(409).json({ success: false, message: 'Un résident avec ce CIN existe déjà.', id: existing[0].id });
        }

        const [result] = await db.query(
            'INSERT INTO residents (cin, nom_prenom, email, specialite, faculte_origine, niveau, promotion) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [cin, nom_prenom, email, specialite, faculte_origine, niveau, promotion]
        );
        await journaliser(db, req, {
            action: 'creation', entite: 'resident', entiteId: result.insertId, residentId: result.insertId,
            apres: validation.data
        });

        res.json({ success: true, id: result.insertId, message: 'Résident créé avec succès.' });
    } catch (error) {
        logger.error('Create resident error: ' + error);
        res.status(500).json({ error: 'Erreur lors de la création du résident' });
    }
};

exports.updateResident = async (req, res) => {
    const residentId = parseInt(String(req.params.id), 10);
    const validation = validateResidentPayload(req.body);
    if (!validation.valid) {
        return res.status(400).json({ success: false, message: validation.message });
    }

    const { cin, nom_prenom, email, specialite, niveau, promotion, faculte_origine } = validation.data;

    try {
        const [existing] = await db.query('SELECT id FROM residents WHERE cin = ? AND id != ?', [cin, residentId]);
        if (existing.length > 0) {
            return res.status(409).json({ success: false, message: 'Un autre résident possède déjà ce CIN.' });
        }

        const [avant] = await db.query('SELECT * FROM residents WHERE id = ?', [residentId]);
        if (avant.length === 0) return res.status(404).json({ success: false, message: 'Résident introuvable.' });

        // Le niveau saisi n'est remplacé que s'il est fourni (anciens dossiers sans promotion).
        await db.query(
            'UPDATE residents SET cin = ?, nom_prenom = ?, email = ?, specialite = ?, niveau = COALESCE(?, niveau), promotion = ?, faculte_origine = ? WHERE id = ?',
            [cin, nom_prenom, email, specialite, niveau, promotion, faculte_origine, residentId]
        );
        await journaliser(db, req, {
            action: 'modification', entite: 'resident', entiteId: residentId, residentId,
            avant: extraire(avant[0], CHAMPS_RESIDENT),
            apres: { ...validation.data, niveau: niveau ?? avant[0].niveau }
        });

        res.json({ success: true, message: 'Résident mis à jour avec succès.' });
    } catch (error) {
        logger.error('Update resident error: ' + error);
        res.status(500).json({ error: 'Erreur lors de la mise à jour du résident' });
    }
};

exports.deleteResident = async (req, res) => {
    const residentId = parseInt(String(req.params.id), 10);
    try {
        const [avant] = await db.query('SELECT * FROM residents WHERE id = ?', [residentId]);
        if (avant.length === 0) return res.status(404).json({ message: 'Résident introuvable.' });
        const [fiches] = await db.query('SELECT periode, annee, service, hopital FROM formulaires_stage WHERE resident_id = ?', [residentId]);

        // Les fiches et leurs téléchargements suivent par clé étrangère (ON DELETE CASCADE).
        await db.query('DELETE FROM residents WHERE id = ?', [residentId]);
        await journaliser(db, req, {
            action: 'suppression', entite: 'resident', entiteId: residentId, residentId,
            avant: { ...extraire(avant[0], CHAMPS_RESIDENT), fiches }
        });
        res.json({ success: true, message: 'Résident et ses fiches supprimés.' });
    } catch (error) {
        logger.error('Delete resident error: ' + error);
        res.status(500).json({ error: 'Erreur lors de la suppression' });
    }
};

exports.getPromotions = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT DISTINCT promotion FROM residents WHERE promotion IS NOT NULL AND promotion > 0 ORDER BY promotion DESC');
        res.json(rows.map((row) => row.promotion));
    } catch (error) {
        logger.error('Promotions error: ' + error);
        res.status(500).json({ error: 'Erreur promotions' });
    }
};

// Spécialités ouvertes sur la plateforme (config/specialites.js), pas celles présentes en base.
exports.getSpecialites = (req, res) => {
    res.json(Object.values(SPECIALITES).map((s) => s.libelle));
};

// Spécialités avec leurs périodes et leur durée, pour les formulaires de l'administration.
exports.getConfigSpecialites = (req, res) => {
    res.json(Object.values(SPECIALITES).map((s) => ({ libelle: s.libelle, periodes: s.periodes, duree: s.duree })));
};
