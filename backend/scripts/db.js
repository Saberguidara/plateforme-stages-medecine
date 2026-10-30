// Outils base de données, avec les identifiants du fichier .env :
//   npm run db:init                     crée les tables d'une base vide (db/schema.sql)
//   npm run db:migrate -- <fichier.sql> applique une migration de db/migrations/
//   npm run admin:create                crée ou met à jour un administrateur
//                                       (ADMIN_LOGIN et ADMIN_PASSWORD dans l'environnement)
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

async function connexion() {
    return mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT, 10) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASS || '',
        database: process.env.DB_NAME || 'gestion_stages',
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
        multipleStatements: true
    });
}

async function executerFichier(fichier) {
    const sql = fs.readFileSync(fichier, 'utf8');
    const conn = await connexion();
    try {
        await conn.query(sql);
        console.log(`✅ ${path.basename(fichier)} appliqué.`);
    } finally {
        await conn.end();
    }
}

async function creerAdmin() {
    const login = process.env.ADMIN_LOGIN;
    const motDePasse = process.env.ADMIN_PASSWORD;
    if (!login || !motDePasse || motDePasse.length < 12) {
        throw new Error('Définir ADMIN_LOGIN et ADMIN_PASSWORD (12 caractères minimum).');
    }
    const conn = await connexion();
    try {
        const hash = await bcrypt.hash(motDePasse, 12);
        await conn.query(
            'INSERT INTO administrateurs (login, mot_de_passe) VALUES (?, ?) ON DUPLICATE KEY UPDATE mot_de_passe = VALUES(mot_de_passe)',
            [login, hash]
        );
        console.log(`✅ Administrateur « ${login} » enregistré.`);
    } finally {
        await conn.end();
    }
}

const [commande, argument] = process.argv.slice(2);
const actions = {
    init: () => executerFichier(path.join(__dirname, '..', 'db', 'schema.sql')),
    migrate: () => {
        if (!argument) throw new Error('Préciser le fichier de migration.');
        return executerFichier(path.resolve(path.join(__dirname, '..', 'db', 'migrations'), argument));
    },
    'admin:create': creerAdmin
};

if (!actions[commande]) {
    console.error(`Commande inconnue : ${commande}. Disponibles : ${Object.keys(actions).join(', ')}`);
    process.exit(1);
}
actions[commande]().catch((err) => {
    console.error('❌', err.message);
    process.exit(1);
});
