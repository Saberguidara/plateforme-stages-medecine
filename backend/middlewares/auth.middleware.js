const jwt = require('jsonwebtoken');
const comptes = require('../services/comptes');
const logger = require('../utils/logger');

const LECTURE_SEULE = { error: 'Votre compte est en lecture seule : modification impossible.' };

// Administrateur connecté, relu en base. Le rôle « lecture » peut consulter (GET) mais rien modifier ;
// `lecture: 'tout'` autorise aussi les requêtes POST de consultation (aperçu PDF),
// `lecture: 'aucune'` réserve la route aux administrateurs complets (gestion des comptes).
function verifierAdmin({ lecture = 'consultation' } = {}) {
    return async (req, res, next) => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Autorisation manquante' });
        }
        let decoded;
        try {
            decoded = jwt.verify(authHeader.substring(7), process.env.JWT_SECRET);
        } catch (err) {
            return res.status(401).json({ error: 'Token invalide ou expiré' });
        }
        if (decoded.role !== 'admin') {
            return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
        }

        let compte;
        try {
            compte = await comptes.compteActif(decoded.id);
        } catch (err) {
            logger.error('Vérification du compte administrateur : ' + err);
            return res.status(500).json({ error: 'Erreur serveur' });
        }
        if (!compte) {
            return res.status(401).json({ error: 'Compte désactivé ou supprimé' });
        }

        if (compte.role === 'lecture') {
            const consultation = req.method === 'GET' || req.method === 'HEAD';
            if (lecture === 'aucune' || (lecture === 'consultation' && !consultation)) {
                return res.status(403).json(LECTURE_SEULE);
            }
        }

        req.admin = { id: compte.id, login: compte.login, role: 'admin', droits: compte.role };
        next();
    };
}

exports.requireAdmin = verifierAdmin();
exports.requireAdminConsultation = verifierAdmin({ lecture: 'tout' });
exports.requireGestionComptes = verifierAdmin({ lecture: 'aucune' });

exports.requireResident = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Autorisation manquante' });
    }
    const token = authHeader.substring(7);
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.role !== 'resident') {
            return res.status(403).json({ error: 'Accès réservé aux résidents' });
        }
        req.resident = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token session invalide' });
    }
};

exports.requireAnyAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Autorisation manquante' });
    }
    const token = authHeader.substring(7);
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.authUser = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token invalide ou expiré' });
    }
};
