// Outils de l'administration : tableau de bord, journal, référentiels, exports et comptes.
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { requireAdmin, requireGestionComptes } = require('../middlewares/auth.middleware');
const stats = require('../controllers/stats.controller');
const journal = require('../controllers/journal.controller');
const referentiels = require('../controllers/referentiels.controller');
const exportsController = require('../controllers/exports.controller');
const comptes = require('../controllers/comptes.controller');

// La génération d'un ZIP de fiches est coûteuse : quelques exports par minute suffisent.
const zipLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Trop d'exports simultanés. Patientez une minute." }
});

router.get('/statistiques', requireAdmin, stats.getStatistiques);
router.get('/journal', requireAdmin, journal.getJournal);

router.get('/referentiels/suggestions', requireAdmin, referentiels.getSuggestions);
router.get('/referentiels/:type', requireAdmin, referentiels.getReferentiel);
router.post('/referentiels/fusion', requireAdmin, referentiels.fusionner);

router.get('/exports/residents.xlsx', requireAdmin, exportsController.exporterResidents);
router.get('/exports/fiches/compte', requireAdmin, exportsController.compterFiches);
router.get('/exports/fiches.zip', requireAdmin, zipLimiter, exportsController.exporterFichesZip);

router.get('/moi', requireAdmin, comptes.moi);
router.get('/comptes', requireGestionComptes, comptes.lister);
router.post('/comptes', requireGestionComptes, comptes.creer);
router.put('/comptes/:id', requireGestionComptes, comptes.modifier);

module.exports = router;
