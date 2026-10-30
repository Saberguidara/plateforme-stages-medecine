const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const importController = require('../controllers/import.controller');
const { requireAdmin } = require('../middlewares/auth.middleware');
const upload = require('../middlewares/upload.middleware');

const undoLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit 5 undo per 15 mins
    message: { message: 'Trop de requêtes d\'annulation. Veuillez patienter.' }
});

router.post('/import', requireAdmin, upload.single('fichierExcel'), importController.importExcel);
router.get('/imports', requireAdmin, importController.listerImports);
router.post('/import/undo', requireAdmin, undoLimiter, importController.undoImport);

module.exports = router;
