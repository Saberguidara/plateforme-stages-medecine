const express = require('express');
const router = express.Router();
const residentsController = require('../controllers/residents.controller');
const { requireAdmin, requireAnyAuth } = require('../middlewares/auth.middleware');

// Public / Shared
router.get('/residents/:cin', requireAnyAuth, residentsController.getResidentByCin);

// Admin
router.get('/admin/residents', requireAdmin, residentsController.getAllResidents);
router.post('/admin/residents', requireAdmin, residentsController.createResident);
router.put('/admin/residents/:id', requireAdmin, residentsController.updateResident);
router.delete('/admin/residents/:id', requireAdmin, residentsController.deleteResident);

router.get('/admin/promotions', requireAdmin, residentsController.getPromotions);
router.get('/admin/specialites', requireAdmin, residentsController.getSpecialites);

module.exports = router;
