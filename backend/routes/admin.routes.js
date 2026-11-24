// Outils de l'administration : tableau de bord, journal, référentiels, exports et comptes.
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { requireAdmin, requireGestionComptes } = require('../middlewares/auth.middleware');
const stats = require('../controllers/stats.controller');
const statistiques = require('../controllers/statistiques.controller');
const journal = require('../controllers/journal.controller');
const referentiels = require('../controllers/referentiels.controller');
const exportsController = require('../controllers/exports.controller');
const comptes = require('../controllers/comptes.controller');
const notifications = require('../controllers/notifications.controller');

// La génération d'un ZIP de fiches est coûteuse : quelques exports par minute suffisent.
const zipLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Trop d'exports simultanés. Patientez une minute." }
});

router.get('/statistiques', requireAdmin, stats.getStatistiques);
router.get('/statistiques/synthese', requireAdmin, stats.getSynthese);
router.get('/statistiques/options', requireAdmin, statistiques.getOptions);
router.get('/statistiques/affectations', requireAdmin, statistiques.getAffectations);
router.get('/statistiques/affectations/detail', requireAdmin, statistiques.getDetailAffectation);
router.get('/statistiques/affectations.xlsx', requireAdmin, statistiques.exporterAffectations);
router.get('/statistiques/parcours', requireAdmin, statistiques.getParcours);
router.get('/statistiques/diffusion', requireAdmin, statistiques.getDiffusion);
router.get('/statistiques/qualite', requireAdmin, statistiques.getQualite);
router.get('/journal', requireAdmin, journal.getJournal);
router.post('/journal/:id/annuler', requireAdmin, journal.annuler);

router.get('/referentiels/suggestions', requireAdmin, referentiels.getSuggestions);
router.get('/referentiels/:type', requireAdmin, referentiels.getReferentiel);
router.post('/referentiels/fusion', requireAdmin, referentiels.fusionner);
router.post('/referentiels/ignorer', requireAdmin, referentiels.ignorerVariantes);

router.get('/exports/residents.xlsx', requireAdmin, exportsController.exporterResidents);
router.get('/exports/fiches/compte', requireAdmin, exportsController.compterFiches);
router.get('/exports/fiches.zip', requireAdmin, zipLimiter, exportsController.exporterFichesZip);

// Envoi groupé d'e-mails : une fois par minute suffit (le bouton est déjà désactivé pendant l'envoi).
const notificationLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 2,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Un envoi vient déjà d\'être lancé. Patientez une minute.' }
});

router.get('/notifications/fiches', requireAdmin, notifications.apercu);
router.post('/notifications/fiches', requireAdmin, notifications.verifierEnvoi, notificationLimiter, notifications.envoyer);
router.post('/statistiques/diffusion/rappels', requireAdmin, notifications.verifierEnvoi, notificationLimiter, statistiques.envoyerRappels);

router.get('/moi', requireAdmin, comptes.moi);
router.get('/comptes', requireGestionComptes, comptes.lister);
router.post('/comptes', requireGestionComptes, comptes.creer);
router.put('/comptes/:id', requireGestionComptes, comptes.modifier);

module.exports = router;
