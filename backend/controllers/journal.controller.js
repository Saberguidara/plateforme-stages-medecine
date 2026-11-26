const db = require('../config/db');
const logger = require('../utils/logger');
const { validatePagination, parseEntierRequete } = require('../utils/validation');
const { annulabilite, annulerAction, ErreurAnnulation } = require('../services/annulation');

const lireJson = (valeur) => {
    if (valeur === null || valeur === undefined) return null;
    if (typeof valeur === 'object') return valeur;
    try { return JSON.parse(valeur); } catch { return valeur; }
};

// Journal des actions, filtrable par dossier résident ou par type d'entité.
exports.getJournal = async (req, res) => {
    // Entiers stricts : une valeur comme « 1 OR 1=1 » est refusée (400) au lieu d'être lue comme 1.
    const pagination = validatePagination(req.query, { limitDefaut: 30, limitMax: 100 });
    if (!pagination.valid) return res.status(400).json({ error: pagination.message });
    const residentId = parseEntierRequete(req.query.resident_id);
    if (!residentId.valid) return res.status(400).json({ error: 'resident_id doit être un nombre entier.' });

    const { page, limit } = pagination;
    const conditions = ['1=1'];
    const params = [];

    if (residentId.value) { conditions.push('j.resident_id = ?'); params.push(residentId.value); }
    if (req.query.entite) { conditions.push('j.entite = ?'); params.push(String(req.query.entite)); }
    // Les connexions, nombreuses, ne s'affichent qu'avec le filtre « Connexions ».
    if (req.query.action) { conditions.push('j.action = ?'); params.push(String(req.query.action)); }
    else conditions.push("j.action <> 'connexion'");

    try {
        const where = conditions.join(' AND ');
        const [rows] = await db.query(
            `SELECT j.id, j.cree_le, j.admin_login, j.action, j.entite, j.entite_id, j.resident_id, j.avant, j.apres,
                    j.annule_le, j.annule_par, j.annulation_de, r.nom_prenom AS resident_nom
             FROM journal_actions j LEFT JOIN residents r ON r.id = j.resident_id
             WHERE ${where}
             ORDER BY j.id DESC
             LIMIT ? OFFSET ?`,
            [...params, limit, (page - 1) * limit]
        );
        const [total] = await db.query(`SELECT COUNT(*) AS n FROM journal_actions j WHERE ${where}`, params);
        res.json({
            data: rows.map((r) => ({ ...r, avant: lireJson(r.avant), apres: lireJson(r.apres), ...annulabilite(r) })),
            total: total[0].n,
            page,
            limit
        });
    } catch (error) {
        logger.error('Journal des actions : ' + error);
        res.status(500).json({ error: 'Erreur lors du chargement du journal' });
    }
};

// Annule une action du journal (POST : réservé aux comptes qui peuvent modifier).
exports.annuler = async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (!id) return res.status(400).json({ message: 'Action invalide.' });
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();
        const resultat = await annulerAction(connection, id, req);
        await connection.commit();
        res.json(resultat);
    } catch (error) {
        if (connection) await connection.rollback().catch(() => { });
        if (error instanceof ErreurAnnulation) return res.status(error.statut).json({ message: error.message });
        logger.error('Annulation depuis le journal : ' + error.stack);
        res.status(500).json({ message: "Erreur lors de l'annulation." });
    } finally {
        if (connection) connection.release();
    }
};
