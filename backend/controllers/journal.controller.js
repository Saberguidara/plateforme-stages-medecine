const db = require('../config/db');
const logger = require('../utils/logger');

const lireJson = (valeur) => {
    if (valeur === null || valeur === undefined) return null;
    if (typeof valeur === 'object') return valeur;
    try { return JSON.parse(valeur); } catch { return valeur; }
};

// Journal des actions, filtrable par dossier résident ou par type d'entité.
exports.getJournal = async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));
    const conditions = ['1=1'];
    const params = [];

    const residentId = parseInt(req.query.resident_id, 10);
    if (residentId) { conditions.push('j.resident_id = ?'); params.push(residentId); }
    if (req.query.entite) { conditions.push('j.entite = ?'); params.push(String(req.query.entite)); }

    try {
        const where = conditions.join(' AND ');
        const [rows] = await db.query(
            `SELECT j.id, j.cree_le, j.admin_login, j.action, j.entite, j.entite_id, j.resident_id, j.avant, j.apres,
                    r.nom_prenom AS resident_nom
             FROM journal_actions j LEFT JOIN residents r ON r.id = j.resident_id
             WHERE ${where}
             ORDER BY j.id DESC
             LIMIT ? OFFSET ?`,
            [...params, limit, (page - 1) * limit]
        );
        const [total] = await db.query(`SELECT COUNT(*) AS n FROM journal_actions j WHERE ${where}`, params);
        res.json({
            data: rows.map((r) => ({ ...r, avant: lireJson(r.avant), apres: lireJson(r.apres) })),
            total: total[0].n,
            page,
            limit
        });
    } catch (error) {
        logger.error('Journal des actions : ' + error);
        res.status(500).json({ error: 'Erreur lors du chargement du journal' });
    }
};
