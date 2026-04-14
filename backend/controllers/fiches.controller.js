const db = require('../config/db');
const logger = require('../utils/logger');
const { validateFichePayload } = require('../utils/validation');

exports.createFiche = async (req, res) => {
    const validation = validateFichePayload(req.body, { requireResidentId: true });
    if (!validation.valid) {
        return res.status(400).json({ success: false, message: validation.message });
    }

    const { resident_id, periode, annee, service, hopital, url_pdf } = validation.data;

    try {
        const [residents] = await db.query('SELECT id FROM residents WHERE id = ?', [resident_id]);
        if (residents.length === 0) {
            return res.status(404).json({ success: false, message: 'Résident introuvable.' });
        }

        const [result] = await db.query(
            'INSERT INTO formulaires_stage (resident_id, periode, annee, service, hopital, url_pdf) VALUES (?, ?, ?, ?, ?, ?)',
            [resident_id, periode, annee, service, hopital, url_pdf]
        );

        res.json({ success: true, id: result.insertId, message: 'Fiche créée avec succès.' });
    } catch (error) {
        logger.error('Create fiche error: ' + error);
        res.status(500).json({ error: 'Erreur lors de la création de la fiche' });
    }
};

exports.updateFiche = async (req, res) => {
    const ficheId = parseInt(String(req.params.id), 10);
    if (Number.isNaN(ficheId) || ficheId <= 0) {
        return res.status(400).json({ success: false, message: 'Identifiant de fiche invalide.' });
    }

    const validation = validateFichePayload(req.body);
    if (!validation.valid) {
        return res.status(400).json({ success: false, message: validation.message });
    }

    const { periode, annee, service, hopital, url_pdf } = validation.data;

    try {
        const [result] = await db.query(
            'UPDATE formulaires_stage SET periode = ?, annee = ?, service = ?, hopital = ?, url_pdf = ? WHERE id = ?',
            [periode, annee, service, hopital, url_pdf, ficheId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Fiche introuvable.' });
        }

        res.json({ success: true, message: 'Fiche mise à jour avec succès.' });
    } catch (error) {
        logger.error('Update fiche error: ' + error);
        res.status(500).json({ error: 'Erreur lors de la mise à jour de la fiche' });
    }
};

exports.deleteFiche = async (req, res) => {
    const ficheId = parseInt(String(req.params.id), 10);
    if (Number.isNaN(ficheId) || ficheId <= 0) {
        return res.status(400).json({ success: false, message: 'Identifiant de fiche invalide.' });
    }

    try {
        const [result] = await db.query('DELETE FROM formulaires_stage WHERE id = ?', [ficheId]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Fiche introuvable.' });
        }
        res.json({ success: true, message: 'Fiche supprimée.' });
    } catch (error) {
        logger.error('Delete fiche error: ' + error);
        res.status(500).json({ error: 'Erreur lors de la suppression' });
    }
};
