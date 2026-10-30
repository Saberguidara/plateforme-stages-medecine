require('dotenv').config();

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.startsWith('REMPLACER')) {
    console.error('❌ FATAL: JWT_SECRET non défini ou non configuré dans .env. Serveur arrêté.');
    process.exit(1);
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const logger = require('./utils/logger');

const app = express();

// Derrière l'hébergeur (Render…), l'IP du visiteur arrive par X-Forwarded-For.
// Sans ce réglage, tous les visiteurs partagent la même IP et les mêmes limites de requêtes.
if (process.env.TRUST_PROXY) app.set('trust proxy', parseInt(process.env.TRUST_PROXY, 10) || process.env.TRUST_PROXY);
app.use(helmet());

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:4200').split(',').map((origin) => origin.trim());

app.use(cors({
    origin: (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        cb(new Error(`CORS: origine non autorisée — ${origin}`));
    },
    credentials: true
}));

app.use(express.json({ limit: '100kb' }));

const authRoutes = require('./routes/auth.routes');
const importRoutes = require('./routes/import.routes');
const residentsRoutes = require('./routes/residents.routes');
const fichesRoutes = require('./routes/fiches.routes');
const pdfRoutes = require('./routes/pdf.routes');

app.use('/api/auth', authRoutes);
app.use('/api', residentsRoutes);
app.use('/api', fichesRoutes);
app.use('/api/admin', importRoutes);
app.use('/api', pdfRoutes);

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
