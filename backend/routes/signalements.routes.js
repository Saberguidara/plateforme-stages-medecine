// Signalement d'erreur sur une fiche : envoyé par le résident, traité par l'administration.
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { requireAdmin, requireResident } = require('../middlewares/auth.middleware');
const signalements = require('../controllers/signalements.controller');

const signalementLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Trop de signalements envoyés. Réessayez plus tard ou contactez le service des stages.' }
});

router.post('/signalements', requireResident, signalementLimiter, signalements.signaler);
router.get('/admin/signalements', requireAdmin, signalements.lister);
router.put('/admin/signalements/:id/traite', requireAdmin, signalements.traiter);

module.exports = router;
