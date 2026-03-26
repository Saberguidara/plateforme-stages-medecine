const db = require('../config/db');

// Recherche d'un résident et ses stages (Resident & Admin)
exports.getResidentByCin = async (req, res) => {
    const cin = req.params.cin;

    if (req.authUser.role === 'resident' && req.authUser.cin !== cin) {
        return res.status(403).json({ error: 'Accès non autorisé à ce dossier.' });
    }

    try {
        const [residents] = await db.query(
            `SELECT id, cin, nom_prenom, specialite, faculte_origine, 
                IF(promotion IS NOT NULL AND promotion > 0, 
                    LEAST(5, GREATEST(1, YEAR(CURRENT_DATE) - promotion + 1)), 
                    niveau) as niveau, promotion 
             FROM residents WHERE cin = ?`,
            [cin]
        );

        if (residents.length === 0) {
            return res.status(404).json({ message: "Résident introuvable" });
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
        console.error("Erreur lors de la recherche :", error);
        res.status(500).json({ error: "Erreur serveur lors de la recherche" });
    }
};

// Lite de tous les résidents (Admin) - AVEC PAGINATION SERVEUR
exports.getAllResidents = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const search = req.query.search || '';
        const specialite = req.query.specialite || '';
        const promo = req.query.promo || '';
        const sortCol = req.query.sortCol || 'nom_prenom';
        const sortDesc = req.query.sortDesc === 'true';

        let whereClause = 'WHERE 1=1';
        let queryParams = [];

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
            queryParams.push(parseInt(promo));
        }

        const validSortCols = ['cin', 'nom_prenom', 'specialite', 'faculte_origine', 'promotion', 'niveau', 'nb_fiches'];
        const orderBy = validSortCols.includes(sortCol) ? sortCol : 'nom_prenom';
        const orderDir = sortDesc ? 'DESC' : 'ASC';

        const countQuery = `SELECT COUNT(*) as total FROM residents r ${whereClause}`;
        const [countResult] = await db.query(countQuery, queryParams);
        const total = countResult[0].total;

        const dataQuery = `
            SELECT r.id, r.cin, r.nom_prenom, r.specialite, r.faculte_origine, r.promotion,
                   IF(r.promotion IS NOT NULL AND r.promotion > 0, 
                        LEAST(5, GREATEST(1, YEAR(CURRENT_DATE) - r.promotion + 1)), 
                        r.niveau) as niveau,
                   (SELECT COUNT(id) FROM formulaires_stage WHERE resident_id = r.id) AS nb_fiches
            FROM residents r
            ${whereClause}
            ORDER BY ${orderBy} ${orderDir}
            LIMIT ? OFFSET ?
        `;
        const [rows] = await db.query(dataQuery, [...queryParams, limit, offset]);

        res.json({
            data: rows,
            total,
            page,
            limit
        });
    } catch (err) {
        console.error('Get all residents error:', err);
        res.status(500).json({ error: "Erreur lors de la récupération des résidents" });
    }
};

// Créer un nouveau résident
exports.createResident = async (req, res) => {
    const { cin, nom_prenom, specialite, faculte_origine, niveau, promotion } = req.body;
    if (!cin || !nom_prenom) return res.status(400).json({ message: "CIN et Nom/Prénom sont obligatoires." });

    try {
        const [existing] = await db.query('SELECT id FROM residents WHERE cin = ?', [cin]);
        if (existing.length > 0) return res.status(409).json({ message: "Un résident avec ce CIN existe déjà." });

        const [result] = await db.query(
            'INSERT INTO residents (cin, nom_prenom, specialite, faculte_origine, niveau, promotion) VALUES (?, ?, ?, ?, ?, ?)',
            [cin.trim(), nom_prenom.trim(), specialite || '', faculte_origine || 'FMSfax', niveau || 1, promotion || null]
        );
        res.json({ success: true, id: result.insertId, message: "Résident créé avec succès." });
    } catch (err) {
        console.error('Create resident error:', err);
        res.status(500).json({ error: "Erreur lors de la création du résident" });
    }
};

// Modifier un résident
exports.updateResident = async (req, res) => {
    const residentId = req.params.id;
    const { cin, nom_prenom, niveau, promotion, faculte_origine } = req.body;
    if (!cin || !nom_prenom) return res.status(400).json({ message: "CIN et Nom/Prénom sont obligatoires." });

    try {
        const [existing] = await db.query('SELECT id FROM residents WHERE cin = ? AND id != ?', [cin, residentId]);
        if (existing.length > 0) return res.status(409).json({ message: "Un autre résident possède déjà ce CIN." });

        await db.query(
            'UPDATE residents SET cin = ?, nom_prenom = ?, niveau = ?, promotion = ?, faculte_origine = ? WHERE id = ?',
            [cin.trim(), nom_prenom.trim(), niveau || 1, promotion || null, faculte_origine || 'FMSfax', residentId]
        );
        res.json({ success: true, message: "Résident mis à jour avec succès." });
    } catch (err) {
        res.status(500).json({ error: "Erreur lors de la mise à jour du résident" });
    }
};

// Supprimer un résident
exports.deleteResident = async (req, res) => {
    const residentId = req.params.id;
    try {
        await db.query('DELETE FROM formulaires_stage WHERE resident_id = ?', [residentId]);
        const [result] = await db.query('DELETE FROM residents WHERE id = ?', [residentId]);
        if (result.affectedRows === 0) return res.status(404).json({ message: "Résident introuvable." });
        res.json({ success: true, message: "Résident et ses fiches supprimés." });
    } catch (err) {
        res.status(500).json({ error: "Erreur lors de la suppression" });
    }
};

// Extraction des promotions uniques pour le filtre
exports.getPromotions = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT DISTINCT promotion FROM residents WHERE promotion IS NOT NULL AND promotion > 0 ORDER BY promotion DESC');
        res.json(rows.map(r => r.promotion));
    } catch (err) {
        res.status(500).json({ error: "Erreur promotions" });
    }
};

// Extraction des spécialités uniques pour le filtre
exports.getSpecialites = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT DISTINCT specialite FROM residents WHERE specialite IS NOT NULL AND specialite != "" ORDER BY specialite');
        res.json(rows.map(r => r.specialite));
    } catch (err) {
        res.status(500).json({ error: "Erreur spécialités" });
    }
};
