const mysql = require('mysql2');

const db = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'gestion_stages',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = db.promise();
