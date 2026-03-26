require('dotenv').config();

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.startsWith('REMPLACER')) {
    console.error('❌ FATAL: JWT_SECRET non défini ou non configuré dans .env. Serveur arrêté.');
    process.exit(1);
}

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const logger = require('./utils/logger');

const app = express();
app.use(helmet({ crossOriginResourcePolicy: false })); // false allows serving uploads if needed
const db = require('./config/db');

// File upload is handled by middlewares/upload.middleware.js

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:4200').split(',').map(o => o.trim());

app.use(cors({
    origin: (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        cb(new Error(`CORS: origine non autorisée — ${origin}`));
    },
    credentials: true
}));

app.use(express.json());

const uploadsDir = path.join(__dirname, 'uploads');
app.use('/uploads', (req, res, next) => {
    const origin = req.headers.origin;
    if (!origin || allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin || allowedOrigins[0]);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
    next();
}, express.static(uploadsDir));

app.get('/api/files/:name', (req, res) => {
    const name = req.params.name;
    if (!name) return res.status(400).json({ error: 'Filename required' });

    const safeName = path.normalize(name).replace(/^\.+[\\/]/, '');
    const filePath = path.join(uploadsDir, safeName);

    if (path.dirname(filePath) !== uploadsDir) {
        return res.status(400).json({ error: 'Invalid filename' });
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) return res.status(404).json({ error: 'File not found' });
        res.sendFile(filePath);
    });
});

// ==========================================
// Authentification
// ==========================================
const authRoutes = require('./routes/auth.routes');
app.use('/api/auth', authRoutes);

const authMiddleware = require('./middlewares/auth.middleware');
const requireAdmin = authMiddleware.requireAdmin;
const requireResident = authMiddleware.requireResident;
const requireAnyAuth = authMiddleware.requireAnyAuth;

// PDF logic moved to controllers/pdf.controller.js and routes/pdf.routes.js

// ==========================================
// Routes
// ==========================================
const importRoutes = require('./routes/import.routes');
const residentsRoutes = require('./routes/residents.routes');

app.use('/api', residentsRoutes);
app.use('/api/admin', importRoutes);
// Resident operations moved to controllers/residents.controller.js

// ==========================================
// Supprimer une fiche
// ==========================================
app.delete('/api/admin/fiches/:id', requireAdmin, async (req, res) => {
    const ficheId = req.params.id;
    try {
        const [result] = await db.query('DELETE FROM formulaires_stage WHERE id = ?', [ficheId]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Fiche introuvable." });
        }
        res.json({ success: true, message: "Fiche supprimée." });
    } catch (err) {
        console.error('Delete fiche error:', err);
        res.status(500).json({ error: "Erreur lors de la suppression" });
    }
});

// ==========================================
// Génération PDF (Router)
// ==========================================
const pdfRoutes = require('./routes/pdf.routes');
app.use('/api', pdfRoutes);

// ==========================================
// Gestionnaire d'erreurs global
// ==========================================
app.use((err, req, res, next) => {
    if (err.message && err.message.startsWith('CORS:')) {
        return res.status(403).json({ error: err.message });
    }
    logger.error('Unhandled error: ' + err.stack);
    res.status(500).json({ error: 'Erreur interne du serveur' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    logger.info(`✅ Serveur Backend sur http://localhost:${PORT}`);
});