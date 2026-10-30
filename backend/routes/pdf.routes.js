const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const pdfController = require('../controllers/pdf.controller');
const { requireAnyAuth, requireAdmin } = require('../middlewares/auth.middleware');

const pdfLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Trop de requêtes PDF. Veuillez patienter une minute.' }
});

router.post('/generate-pdf', requireAnyAuth, pdfLimiter, pdfController.generatePdf);
router.post('/admin/apercu-pdf', requireAdmin, pdfLimiter, pdfController.apercuPdf);

module.exports = router;
