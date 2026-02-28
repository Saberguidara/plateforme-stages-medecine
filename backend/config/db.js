// ARCH-3 : Credentials DB via variables d'environnement (plus de valeurs en dur)
// Note : dotenv est chargé en premier dans server.js avant ce module
const mysql = require('mysql2');

const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'gestion_stages',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = db.promise();
