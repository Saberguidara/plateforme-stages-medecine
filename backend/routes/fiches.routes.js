const express = require('express');
const router = express.Router();
const fichesController = require('../controllers/fiches.controller');
const { requireAdmin } = require('../middlewares/auth.middleware');

router.post('/admin/fiches', requireAdmin, fichesController.createFiche);
router.put('/admin/fiches/:id', requireAdmin, fichesController.updateFiche);
router.delete('/admin/fiches/:id', requireAdmin, fichesController.deleteFiche);

module.exports = router;
