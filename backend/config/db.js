// ARCH-3 : Credentials DB via variables d'environnement (plus de valeurs en dur)
// Note : dotenv est chargé en premier dans server.js avant ce module
const mysql = require('mysql2');

if (process.env.NODE_ENV === 'production' && (!process.env.DB_PASS || process.env.DB_PASS.trim() === '')) {
    console.error('❌ FATAL: DB_PASS non défini pour la base de données de production. Serveur arrêté.');
    process.exit(1);
}

const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'gestion_stages',
    waitForConnections: true,
    // Les offres MySQL gratuites acceptent peu de connexions simultanées
    connectionLimit: parseInt(process.env.DB_POOL_SIZE, 10) || 10,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
    queueLimit: 0
});

module.exports = db.promise();
