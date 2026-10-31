const express = require('express');
const router = express.Router();
const residentsController = require('../controllers/residents.controller');
const { requireAdmin, requireAnyAuth } = require('../middlewares/auth.middleware');
const { contact } = require('../config/contact');

// Public / Shared
router.get('/contact', (req, res) => res.json(contact()));
router.get('/residents/:cin', requireAnyAuth, residentsController.getResidentByCin);

// Admin (le rôle « lecture » n'a accès qu'aux GET : voir auth.middleware.js)
router.get('/admin/residents', requireAdmin, residentsController.getAllResidents);
router.get('/admin/residents/verifier-cin', requireAdmin, residentsController.verifierCin);
router.get('/admin/residents/:id', requireAdmin, residentsController.getResidentById);
router.post('/admin/residents', requireAdmin, residentsController.createResident);
router.put('/admin/residents/:id', requireAdmin, residentsController.updateResident);
router.delete('/admin/residents/:id', requireAdmin, residentsController.deleteResident);

router.get('/admin/recherche', requireAdmin, residentsController.rechercheRapide);
router.get('/admin/promotions', requireAdmin, residentsController.getPromotions);
router.get('/admin/specialites', requireAdmin, residentsController.getSpecialites);
router.get('/admin/specialites/config', requireAdmin, residentsController.getConfigSpecialites);

module.exports = router;
