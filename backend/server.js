require('dotenv').config();

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.startsWith('REMPLACER')) {
    console.error('❌ FATAL: JWT_SECRET non défini ou non configuré dans .env. Serveur arrêté.');
    process.exit(1);
}

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const logger = require('./utils/logger');

const app = express();

// Derrière l'hébergeur (Render…), l'IP du visiteur arrive par X-Forwarded-For.
// Sans ce réglage, tous les visiteurs partagent la même IP et les mêmes limites de requêtes.
if (process.env.TRUST_PROXY) app.set('trust proxy', parseInt(process.env.TRUST_PROXY, 10) || process.env.TRUST_PROXY);
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            // L'aperçu des fiches affiche un PDF généré dans le navigateur (URL blob:) dans un iframe.
            'frame-src': ["'self'", 'blob:']
        }
    }
}));

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:4200').split(',').map((origin) => origin.trim());

// Le navigateur envoie un en-tête Origin même vers sa propre adresse (POST…) : la même origine est toujours acceptée.
app.use(cors((req, cb) => {
    const origin = req.headers.origin;
    const memeOrigine = origin === `${req.protocol}://${req.get('host')}`;
    if (!origin || memeOrigine || allowedOrigins.includes(origin)) return cb(null, { origin: true, credentials: true });
    cb(new Error(`CORS: origine non autorisée — ${origin}`));
}));

app.use(express.json({ limit: '100kb' }));

const authRoutes = require('./routes/auth.routes');
const importRoutes = require('./routes/import.routes');
const residentsRoutes = require('./routes/residents.routes');
const fichesRoutes = require('./routes/fiches.routes');
const pdfRoutes = require('./routes/pdf.routes');
const adminRoutes = require('./routes/admin.routes');
const signalementsRoutes = require('./routes/signalements.routes');

app.use('/api/auth', authRoutes);
app.use('/api', residentsRoutes);
app.use('/api', fichesRoutes);
app.use('/api/admin', importRoutes);
app.use('/api', pdfRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', signalementsRoutes);

app.use('/api', (req, res) => res.status(404).json({ message: 'Route introuvable' }));

// En production, le même serveur sert l'application Angular compilée : une seule URL, pas de CORS.
const frontendDir = process.env.FRONTEND_DIST
    ? path.resolve(process.env.FRONTEND_DIST)
    : path.join(__dirname, '..', 'frontend-stages', 'dist', 'frontend-stages', 'browser');
const indexHtml = path.join(frontendDir, 'index.html');

if (fs.existsSync(indexHtml)) {
    // Les fichiers avec empreinte (main-XXXX.js…) peuvent rester en cache ; index.html jamais.
    app.use(express.static(frontendDir, {
        index: false,
        setHeaders: (res, filePath) => {
            if (/-[A-Z0-9]{8}\.(js|css)$/.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
    }));
    app.get(/^(?!\/api\/).*/, (req, res) => {
        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(indexHtml);
    });
} else {
    logger.info(`Frontend non compilé (${frontendDir} absent) : seule l'API est servie.`);
}

app.use((err, req, res, next) => {
    if (err.message && err.message.startsWith('CORS:')) {
        return res.status(403).json({ error: err.message });
    }
    if (err.name === 'MulterError' || (err.message && err.message.startsWith('Format refusé'))) {
        return res.status(400).json({ message: err.code === 'LIMIT_FILE_SIZE' ? 'Fichier trop volumineux (10 Mo maximum).' : err.message });
    }
    logger.error('Unhandled error: ' + err.stack);
    res.status(500).json({ error: 'Erreur interne du serveur' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    logger.info(`✅ Serveur Backend sur http://localhost:${PORT}`);
});
