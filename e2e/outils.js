// Outils communs : jetons de test signés avec le secret local, jamais utilisés sur le site déployé.
const fs = require('fs');
const path = require('path');

const BACKEND = path.join(__dirname, '..', 'backend');
const dotenv = require(path.join(BACKEND, 'node_modules', 'dotenv'));
const jwt = require(path.join(BACKEND, 'node_modules', 'jsonwebtoken'));
const mysql = require(path.join(BACKEND, 'node_modules', 'mysql2', 'promise'));

let cache = null;

async function donneesLocales() {
    if (cache) return cache;
    const env = dotenv.parse(fs.readFileSync(path.join(BACKEND, '.env')));
    const c = await mysql.createConnection({
        host: env.DB_HOST, port: Number(env.DB_PORT || 3306), user: env.DB_USER, password: env.DB_PASS || '', database: env.DB_NAME
    });
    const [[admin]] = await c.query("SELECT id, login, nom, role FROM administrateurs WHERE actif = 1 AND role = 'admin' LIMIT 1");
    const [[resident]] = await c.query(
        `SELECT r.id, r.cin, r.nom_prenom FROM residents r JOIN formulaires_stage f ON f.resident_id = r.id
         GROUP BY r.id, r.cin, r.nom_prenom ORDER BY COUNT(*) DESC LIMIT 1`
    );
    await c.end();
    const signer = (charge) => jwt.sign(charge, env.JWT_SECRET, { expiresIn: '15m' });
    cache = {
        resident,
        jetonAdmin: signer({ id: admin.id, login: admin.login, nom: admin.nom, role: 'admin', droits: admin.role }),
        jetonResident: signer({ id: resident.id, cin: resident.cin, nom_prenom: resident.nom_prenom, role: 'resident' })
    };
    return cache;
}

async function connecterAdmin(page) {
    const { jetonAdmin } = await donneesLocales();
    await page.addInitScript((j) => localStorage.setItem('admin_token', j), jetonAdmin);
}

async function connecterResident(page) {
    const { jetonResident, resident } = await donneesLocales();
    await page.addInitScript(([j, cin]) => {
        localStorage.setItem('resident_token', j);
        localStorage.setItem('resident_cin', cin);
    }, [jetonResident, resident.cin]);
    return resident;
}

// Simule un navigateur avec ou sans lecteur PDF intégré (Chrome Android : sans).
async function lecteurPdf(page, present) {
    await page.addInitScript((p) => {
        Object.defineProperty(Navigator.prototype, 'pdfViewerEnabled', { get: () => p, configurable: true });
    }, present);
}

module.exports = { donneesLocales, connecterAdmin, connecterResident, lecteurPdf };
