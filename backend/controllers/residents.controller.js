const db = require('../config/db');
const logger = require('../utils/logger');
const { validateResidentPayload, validateCin } = require('../utils/validation');
const { SPECIALITES } = require('../config/specialites');

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
                IF(promotion IS NOT NULL AND promotion > 0,
                    LEAST(5, GREATEST(1, YEAR(CURRENT_DATE) - promotion + 1)),
                    niveau) as niveau, promotion
             FROM residents WHERE cin = ?`,
            [cin]
        );

        if (residents.length === 0) {
            return res.status(404).json({ message: 'Résident introuvable' });
        }

        const resident = residents[0];
        const [fiches] = await db.query(
            `SELECT id, periode, annee, service, hopital, url_pdf FROM formulaires_stage
             WHERE resident_id = ?
             ORDER BY annee ASC, FIELD(periode,'T1','T2','S1','T3','T4','S2','R1','R2',periode)`,
            [resident.id]
        );

        res.json({ ...resident, fiches });
    } catch (error) {
        logger.error('Erreur lors de la recherche : ' + error);
        res.status(500).json({ error: 'Erreur serveur lors de la recherche' });
    }
};

exports.getAllResidents = async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 20;
        const offset = (page - 1) * limit;

        const search = req.query.search || '';
        const specialite = req.query.specialite || '';
        const promo = req.query.promo || '';
        const sansEmail = req.query.email === 'sans';
        const sortCol = req.query.sortCol || 'nom_prenom';
        const sortDesc = req.query.sortDesc === 'true';

        let whereClause = 'WHERE 1=1';
        const queryParams = [];

        if (search) {
            whereClause += ' AND (r.cin LIKE ? OR r.nom_prenom LIKE ?)';
            queryParams.push(`%${search}%`, `%${search}%`);
        }
        if (specialite) {
            whereClause += ' AND r.specialite = ?';
            queryParams.push(specialite);
        }
        if (promo) {
            whereClause += ' AND r.promotion = ?';
            queryParams.push(parseInt(promo, 10));
        }
        if (sansEmail) {
            whereClause += " AND (r.email IS NULL OR r.email = '')";
        }

        const validSortCols = ['cin', 'nom_prenom', 'specialite', 'faculte_origine', 'promotion', 'niveau', 'nb_fiches'];
        const orderBy = validSortCols.includes(sortCol) ? sortCol : 'nom_prenom';
        const orderDir = sortDesc ? 'DESC' : 'ASC';

        const [countResult] = await db.query(`SELECT COUNT(*) as total FROM residents r ${whereClause}`, queryParams);
        const total = countResult[0].total;
        // Résidents qui ne peuvent pas se connecter, sur toute la base (indépendant des filtres)
        const [sansEmailResult] = await db.query("SELECT COUNT(*) AS n FROM residents WHERE email IS NULL OR email = ''");

        const [rows] = await db.query(
            `SELECT r.id, r.cin, r.nom_prenom, r.email, r.specialite, r.faculte_origine, r.promotion,
                    IF(r.promotion IS NOT NULL AND r.promotion > 0,
                        LEAST(5, GREATEST(1, YEAR(CURRENT_DATE) - r.promotion + 1)),
                        r.niveau) as niveau,
                    (SELECT COUNT(id) FROM formulaires_stage WHERE resident_id = r.id) AS nb_fiches
             FROM residents r
             ${whereClause}
             ORDER BY ${orderBy} ${orderDir}
             LIMIT ? OFFSET ?`,
            [...queryParams, limit, offset]
        );

        res.json({ data: rows, total, page, limit, sansEmail: sansEmailResult[0].n });
    } catch (error) {
        logger.error('Get all residents error: ' + error);
        res.status(500).json({ error: 'Erreur lors de la récupération des résidents' });
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
            return res.status(409).json({ success: false, message: 'Un résident avec ce CIN existe déjà.' });
        }

        const [result] = await db.query(
            'INSERT INTO residents (cin, nom_prenom, email, specialite, faculte_origine, niveau, promotion) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [cin, nom_prenom, email, specialite, faculte_origine, niveau, promotion]
        );

        res.json({ success: true, id: result.insertId, message: 'Résident créé avec succès.' });
    } catch (error) {
        logger.error('Create resident error: ' + error);
        res.status(500).json({ error: 'Erreur lors de la création du résident' });
    }
};

exports.updateResident = async (req, res) => {
    const residentId = req.params.id;
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

        await db.query(
            'UPDATE residents SET cin = ?, nom_prenom = ?, email = ?, specialite = ?, niveau = ?, promotion = ?, faculte_origine = ? WHERE id = ?',
            [cin, nom_prenom, email, specialite, niveau, promotion, faculte_origine, residentId]
        );

        res.json({ success: true, message: 'Résident mis à jour avec succès.' });
    } catch (error) {
        logger.error('Update resident error: ' + error);
        res.status(500).json({ error: 'Erreur lors de la mise à jour du résident' });
    }
};

exports.deleteResident = async (req, res) => {
    const residentId = req.params.id;
    try {
        await db.query('DELETE FROM formulaires_stage WHERE resident_id = ?', [residentId]);
        const [result] = await db.query('DELETE FROM residents WHERE id = ?', [residentId]);
        if (result.affectedRows === 0) return res.status(404).json({ message: 'Résident introuvable.' });
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
