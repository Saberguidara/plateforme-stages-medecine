// Outils base de données, avec les identifiants du fichier .env :
//   npm run db:init                     crée les tables d'une base vide (db/schema.sql)
//   npm run db:migrate -- <fichier.sql> applique une migration de db/migrations/
//   npm run db:etat                     affiche la base visée et les migrations appliquées (lecture seule)
//   npm run admin:create                crée ou met à jour un administrateur
//                                       (ADMIN_LOGIN et ADMIN_PASSWORD dans l'environnement,
//                                       ADMIN_NOM facultatif) ; le compte est réactivé avec le rôle admin
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
            `INSERT INTO administrateurs (login, nom, mot_de_passe, role) VALUES (?, ?, ?, 'admin')
             ON DUPLICATE KEY UPDATE mot_de_passe = VALUES(mot_de_passe), role = 'admin', actif = 1`,
            [login, process.env.ADMIN_NOM || null, hash]
        );
        console.log(`✅ Administrateur « ${login} » enregistré.`);
    } finally {
        await conn.end();
    }
}

// Base visée par le .env (ou par les variables déjà définies dans le terminal, qui priment)
function cible() {
    return `${process.env.DB_USER || 'root'}@${process.env.DB_HOST || 'localhost'}:${parseInt(process.env.DB_PORT, 10) || 3306}/${process.env.DB_NAME || 'gestion_stages'}`
        + (process.env.DB_SSL === 'true' ? ' (TLS)' : '');
}

// Signe laissé par chaque migration dans la base : sert à savoir lesquelles restent à appliquer.
const SIGNES_MIGRATIONS = [
    ['001-innodb-otp-import.sql', "SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'residents' AND COLUMN_NAME = 'otp_hash'"],
    ['002-administration.sql', "SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'administrateurs' AND COLUMN_NAME = 'role'"],
    ['003-signalements.sql', "SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'signalements'"],
    ['004-notifications-reponses.sql', "SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'signalements' AND COLUMN_NAME = 'reponse'"],
    ['005-variantes-ignorees.sql', "SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'variantes_ignorees'"],
    ['006-stages-paralleles-45-jours.sql', "SELECT COUNT(*) AS n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'formulaires_stage' AND INDEX_NAME = 'uq_stage_par_resident_service'"],
    ['007-journal-annulation.sql', "SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'journal_actions' AND COLUMN_NAME = 'annule_le'"],
    ['008-index-statistiques.sql', "SELECT COUNT(*) AS n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'formulaires_stage' AND INDEX_NAME = 'idx_formulaires_annee_periode'"],
    ['009-relances-fiches.sql', "SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'relances_fiches'"],
    ['010-vues-enregistrees.sql', "SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vues_enregistrees'"]
];

// Lecture seule : base visée, volumes et migrations appliquées ou restantes.
async function etat() {
    const conn = await connexion();
    try {
        const [[{ version }]] = await conn.query('SELECT VERSION() AS version');
        console.log(`Base visée : ${cible()} · MySQL ${version}`);
        for (const table of ['residents', 'formulaires_stage', 'telechargements', 'signalements', 'journal_actions']) {
            try {
                const [[{ n }]] = await conn.query(`SELECT COUNT(*) AS n FROM ${table}`);
                console.log(`  ${table.padEnd(18)} ${n}`);
            } catch { console.log(`  ${table.padEnd(18)} (table absente)`); }
        }
        console.log('Migrations :');
        const fichiers = fs.readdirSync(path.join(__dirname, '..', 'db', 'migrations')).filter((f) => f.endsWith('.sql')).sort();
        for (const fichier of fichiers) {
            const signe = SIGNES_MIGRATIONS.find(([nom]) => nom === fichier);
            if (!signe) { console.log(`  ?  ${fichier} (état inconnu)`); continue; }
            const [[{ n }]] = await conn.query(signe[1]);
            console.log(`  ${Number(n) > 0 ? '✅' : '⏳'} ${fichier}${Number(n) > 0 ? '' : '  → à appliquer'}`);
        }
    } finally {
        await conn.end();
    }
}

const [commande, argument] = process.argv.slice(2);
const actions = {
    init: () => executerFichier(path.join(__dirname, '..', 'db', 'schema.sql')),
    migrate: () => {
        if (!argument) throw new Error('Préciser le fichier de migration.');
        console.log(`Base visée : ${cible()}`);
        return executerFichier(path.resolve(path.join(__dirname, '..', 'db', 'migrations'), argument));
    },
    etat,
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
