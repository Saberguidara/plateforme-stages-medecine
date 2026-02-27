const mysql = require('mysql2');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'gestion_stages'
});

db.connect(err => {
    if (err) throw err;
    console.log("Connected to MySQL.");
    
    const queries = [
        "ALTER TABLE residents ADD COLUMN email VARCHAR(255) DEFAULT NULL;",
        "ALTER TABLE residents ADD COLUMN otp_code VARCHAR(10) DEFAULT NULL;",
        "ALTER TABLE residents ADD COLUMN otp_expires_at DATETIME DEFAULT NULL;"
    ];

    let completed = 0;
    queries.forEach(query => {
        db.query(query, (err, result) => {
            if (err) {
                if (err.code === 'ER_DUP_FIELDNAME') {
                    console.log(`Column already exists: ${query}`);
                } else {
                    console.error("Error executing query:", query, err);
                }
            } else {
                console.log("Executed:", query);
            }
            completed++;
            if (completed === queries.length) {
                db.end();
            }
        });
    });
});
