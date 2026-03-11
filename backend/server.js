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
const logger = require('./utils/logger');

const app = express();

const db = require('./config/db');

const tempDir = path.join(__dirname, 'temp_uploads');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
}
const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, tempDir),
        filename: (req, file, cb) => cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname))
    }),
    limits: { fileSize: 10 * 1024 * 1024 }
});

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

// ==========================================
// Génération PDF — Puppeteer
// ==========================================
let browserInstance;
async function getBrowser() {
    if (!browserInstance || !browserInstance.connected) {
        browserInstance = await puppeteer.launch({ headless: true });
    }
    return browserInstance;
}

const pdfLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Trop de requêtes PDF. Veuillez patienter une minute.' }
});

// ==========================================
// Import Excel (Admin)
// ==========================================
app.post('/api/admin/import', requireAdmin, upload.single('fichierExcel'), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "Aucun fichier reçu." });

    const anneeSelectionnee = parseInt(req.body.annee);
    if (isNaN(anneeSelectionnee) || anneeSelectionnee < 2000 || anneeSelectionnee > 2100) {
        return res.status(400).json({ message: "Année invalide (doit être entre 2000 et 2100)." });
    }

    const semestreChoisi = req.body.semestre;
    const typeSpecialite = req.body.typeSpecialite;

    try {
        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const lignesExcel = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        let lignesInserees = 0;
        let residentsCrees = 0;

        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            const validData = [];
            const cinsSet = new Set();
            for (const ligne of lignesExcel) {
                let cin, nomPrenom, specialite, faculteOrigine, hopital1, service1, hopital2, service2, niveauExcel;

                if (typeSpecialite === 'standard') {
                    cin = String(ligne['CIN']).trim();
                    nomPrenom = ligne['NOM ET PPRENOM'] || ligne['NOM ET PRENOM'];
                    specialite = ligne['SP.'];
                    faculteOrigine = ligne['FAC D\'ORIGINE'];
                    hopital1 = ligne['HOPITAL'];
                    service1 = ligne['SERVICE'];
                    hopital2 = null;
                    service2 = null;
                    niveauExcel = parseInt(ligne['ANNEE']);
                } else {
                    cin = String(ligne['CIN']).trim();
                    nomPrenom = ligne['Nom et prénom'];
                    specialite = ligne['Spécialité'];
                    faculteOrigine = ligne['Faculté d\'origine'];
                    hopital1 = ligne['Hopital 1'] || ligne['Hôpital 1'];
                    service1 = ligne['Service 1'];
                    hopital2 = ligne['Hopital 2'] || ligne['Hôpital 2'];
                    service2 = ligne['Service 2'];
                    niveauExcel = parseInt(ligne['Année']) || parseInt(ligne['Annee']);
                }

                if (!cin || cin === 'undefined' || cin === 'null') continue;
                cinsSet.add(cin);
                validData.push({ cin, nomPrenom, specialite, faculteOrigine, hopital1, service1, hopital2, service2, niveauExcel });
            }

            if (validData.length > 0) {
                const cinsArray = Array.from(cinsSet);
                const [existingResidentsRows] = await connection.query('SELECT id, cin, niveau FROM residents WHERE cin IN (?) FOR UPDATE', [cinsArray]);
                const existingMap = new Map();
                for (const r of existingResidentsRows) existingMap.set(r.cin, r);

                const newResidents = [];
                const residentsToUpdateNiveau = [];
                for (const data of validData) {
                    if (existingMap.has(data.cin)) {
                        const r = existingMap.get(data.cin);
                        if (data.niveauExcel && r.niveau !== data.niveauExcel) {
                            residentsToUpdateNiveau.push([data.niveauExcel, r.id]);
                            r.niveau = data.niveauExcel;
                        }
                    } else {
                        if (!newResidents.find(r => r[0] === data.cin)) {
                            const promotion = anneeSelectionnee - (data.niveauExcel || 1) + 1;
                            newResidents.push([data.cin, data.nomPrenom || 'Non renseigné', data.specialite || 'Non renseignée', data.faculteOrigine || 'Inconnue', promotion, data.niveauExcel || 1]);
                        }
                    }
                }

                if (residentsToUpdateNiveau.length > 0) {
                    await Promise.all(residentsToUpdateNiveau.map(u => connection.query('UPDATE residents SET niveau = ? WHERE id = ?', u)));
                }

                if (newResidents.length > 0) {
                    await connection.query('INSERT INTO residents (cin, nom_prenom, specialite, faculte_origine, promotion, niveau) VALUES ?', [newResidents]);
                    residentsCrees += newResidents.length;

                    const newCins = newResidents.map(r => r[0]);
                    const [insertedRows] = await connection.query('SELECT id, cin FROM residents WHERE cin IN (?)', [newCins]);
                    for (const r of insertedRows) existingMap.set(r.cin, { id: r.id });
                }

                const newStages = [];
                for (const data of validData) {
                    const residentId = existingMap.get(data.cin).id;
                    if (typeSpecialite === 'famille' && data.service2 && data.hopital2) {
                        let periodeA = semestreChoisi === 'S1' ? 'T1' : 'T3';
                        let periodeB = semestreChoisi === 'S1' ? 'T2' : 'T4';
                        newStages.push([residentId, periodeA, anneeSelectionnee, data.service1, data.hopital1, '']);
                        newStages.push([residentId, periodeB, anneeSelectionnee, data.service2, data.hopital2, '']);
                    } else if (data.service1 && data.hopital1) {
                        newStages.push([residentId, semestreChoisi, anneeSelectionnee, data.service1, data.hopital1, '']);
                    }
                }

                if (newStages.length > 0) {
                    await connection.query('INSERT IGNORE INTO formulaires_stage (resident_id, periode, annee, service, hopital, url_pdf) VALUES ?', [newStages]);
                    lignesInserees += newStages.length;
                }
            }

            await connection.commit();
            connection.release();

            res.json({ message: `Succès : ${residentsCrees} nouveaux résidents et ${lignesInserees} fiches générés.` });

        } catch (error) {
            if (typeof connection !== 'undefined') {
                await connection.rollback();
                connection.release();
            }
            throw error;
        }

    } catch (error) {
        console.error("Erreur lors de l'import :", error);
        res.status(500).json({ message: "Erreur serveur : Vérifiez les entêtes de votre fichier Excel." });
    } finally {
        if (req.file && req.file.path && fs.existsSync(req.file.path)) {
            fs.unlink(req.file.path, () => { });
        }
    }
});

// ==========================================
// Recherche d'un résident et ses stages
// ==========================================
app.get('/api/residents/:cin', requireAnyAuth, async (req, res) => {
    const cin = req.params.cin;

    if (req.authUser.role === 'resident' && req.authUser.cin !== cin) {
        return res.status(403).json({ error: 'Accès non autorisé à ce dossier.' });
    }

    try {
        const [residents] = await db.query(
            'SELECT id, cin, nom_prenom, specialite, faculte_origine, niveau FROM residents WHERE cin = ?',
            [cin]
        );

        if (residents.length === 0) {
            return res.status(404).json({ message: "Résident introuvable" });
        }

        const resident = residents[0];

        const [fiches] = await db.query(
            'SELECT id, periode, annee, service, hopital, url_pdf FROM formulaires_stage WHERE resident_id = ? ORDER BY annee DESC, periode ASC',
            [resident.id]
        );

        res.json({ ...resident, fiches });

    } catch (error) {
        console.error("Erreur lors de la recherche :", error);
        res.status(500).json({ error: "Erreur serveur lors de la recherche" });
    }
});

// ==========================================
// Modifier une fiche
// ==========================================
app.put('/api/admin/fiches/:id', requireAdmin, async (req, res) => {
    const ficheId = req.params.id;
    const { periode, annee, service, hopital, url_pdf } = req.body;
    try {
        await db.query(
            'UPDATE formulaires_stage SET periode = ?, annee = ?, service = ?, hopital = ?, url_pdf = ? WHERE id = ?',
            [periode, annee, service, hopital, url_pdf || '', ficheId]
        );
        res.json({ message: "La fiche a été mise à jour avec succès !" });
    } catch (err) {
        console.error('Update fiche error:', err);
        res.status(500).json({ error: "Erreur lors de la mise à jour" });
    }
});

// ==========================================
// Liste des spécialités distinctes
// ==========================================
app.get('/api/admin/specialites', requireAdmin, async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT DISTINCT specialite FROM residents WHERE specialite IS NOT NULL AND specialite != "" ORDER BY specialite'
        );
        res.json(rows.map(r => r.specialite));
    } catch (err) {
        console.error('Get specialites error:', err);
        res.status(500).json({ error: "Erreur lors de la récupération des spécialités" });
    }
});

// ==========================================
// Créer un nouveau résident
// ==========================================
app.post('/api/admin/residents', requireAdmin, async (req, res) => {
    const { cin, nom_prenom, specialite, faculte_origine, niveau } = req.body;

    if (!cin || !nom_prenom) {
        return res.status(400).json({ message: "CIN et Nom/Prénom sont obligatoires." });
    }

    try {
        const [existing] = await db.query('SELECT id FROM residents WHERE cin = ?', [cin]);
        if (existing.length > 0) {
            return res.status(409).json({ message: "Un résident avec ce CIN existe déjà." });
        }

        const [result] = await db.query(
            'INSERT INTO residents (cin, nom_prenom, specialite, faculte_origine, niveau) VALUES (?, ?, ?, ?, ?)',
            [cin.trim(), nom_prenom.trim(), specialite || '', faculte_origine || 'FMSfax', niveau || 1]
        );

        res.json({ success: true, id: result.insertId, message: "Résident créé avec succès." });
    } catch (err) {
        console.error('Create resident error:', err);
        res.status(500).json({ error: "Erreur lors de la création du résident" });
    }
});

// ==========================================
// Modifier un résident
// ==========================================
app.put('/api/admin/residents/:id', requireAdmin, async (req, res) => {
    const residentId = req.params.id;
    const { cin, nom_prenom, niveau, faculte_origine } = req.body;

    if (!cin || !nom_prenom) {
        return res.status(400).json({ message: "CIN et Nom/Prénom sont obligatoires." });
    }

    try {
        const [existing] = await db.query('SELECT id FROM residents WHERE cin = ? AND id != ?', [cin, residentId]);
        if (existing.length > 0) {
            return res.status(409).json({ message: "Un autre résident possède déjà ce CIN." });
        }

        await db.query(
            'UPDATE residents SET cin = ?, nom_prenom = ?, niveau = ?, faculte_origine = ? WHERE id = ?',
            [cin.trim(), nom_prenom.trim(), niveau || 1, faculte_origine || 'FMSfax', residentId]
        );

        res.json({ success: true, message: "Résident mis à jour avec succès." });
    } catch (err) {
        console.error('Update resident error:', err);
        res.status(500).json({ error: "Erreur lors de la mise à jour du résident" });
    }
});

// ==========================================
// Ajouter une fiche pour un résident
// ==========================================
app.post('/api/admin/fiches', requireAdmin, async (req, res) => {
    const { resident_id, periode, annee, service, hopital } = req.body;

    if (!resident_id || !periode || !annee) {
        return res.status(400).json({ message: "Résident, période et année sont obligatoires." });
    }

    try {
        const [result] = await db.query(
            'INSERT INTO formulaires_stage (resident_id, periode, annee, service, hopital, url_pdf) VALUES (?, ?, ?, ?, ?, ?)',
            [resident_id, periode, annee, service || '', hopital || '', '']
        );

        res.json({ success: true, id: result.insertId, message: "Stage ajouté avec succès." });
    } catch (err) {
        console.error('Create fiche error:', err);
        res.status(500).json({ error: "Erreur lors de l'ajout du stage" });
    }
});

// ==========================================
// Liste de tous les résidents
// ==========================================
app.get('/api/admin/residents', requireAdmin, async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT r.id, r.cin, r.nom_prenom, r.specialite, r.faculte_origine, r.niveau,
                   COUNT(f.id) AS nb_fiches
            FROM residents r
            LEFT JOIN formulaires_stage f ON f.resident_id = r.id
            GROUP BY r.id
            ORDER BY r.nom_prenom ASC
        `);
        res.json(rows);
    } catch (err) {
        console.error('Get all residents error:', err);
        res.status(500).json({ error: "Erreur lors de la récupération des résidents" });
    }
});

// ==========================================
// Supprimer un résident et ses fiches
// ==========================================
app.delete('/api/admin/residents/:id', requireAdmin, async (req, res) => {
    const residentId = req.params.id;
    try {
        await db.query('DELETE FROM formulaires_stage WHERE resident_id = ?', [residentId]);
        const [result] = await db.query('DELETE FROM residents WHERE id = ?', [residentId]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Résident introuvable." });
        }
        res.json({ success: true, message: "Résident et ses fiches supprimés." });
    } catch (err) {
        console.error('Delete resident error:', err);
        res.status(500).json({ error: "Erreur lors de la suppression" });
    }
});

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
// Génération PDF
// ==========================================
const { generateFicheHtml } = require('./services/pdf.service');

const DOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const window = new JSDOM('').window;
const purify = DOMPurify(window);

class Semaphore {
    constructor(max) {
        this.max = max;
        this.count = 0;
        this.queue = [];
    }

    async acquire() {
        if (this.count < this.max) {
            this.count++;
            return;
        }
        return new Promise(resolve => this.queue.push(resolve));
    }

    release() {
        if (this.queue.length > 0) {
            const resolve = this.queue.shift();
            resolve();
        } else {
            this.count--;
        }
    }
}
const pdfSemaphore = new Semaphore(3); // Limit to 3 concurrent pdf generations

function sanitizeObj(obj) {
    if (typeof obj === 'string') return purify.sanitize(obj);
    if (typeof obj === 'object' && obj !== null) {
        let newObj = Array.isArray(obj) ? [] : {};
        for (let key in obj) {
            newObj[key] = sanitizeObj(obj[key]);
        }
        return newObj;
    }
    return obj;
}

app.post('/api/generate-pdf', requireAnyAuth, pdfLimiter, async (req, res) => {
    let { resident, fiche } = req.body;
    resident = sanitizeObj(resident);
    fiche = sanitizeObj(fiche);
    let page;

    await pdfSemaphore.acquire();
    try {
        const browser = await getBrowser();
        page = await browser.newPage();

        const htmlContent = generateFicheHtml(resident, fiche);
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' }
        });

        await page.close();

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Length': pdfBuffer.length
        });
        res.send(pdfBuffer);

    } catch (error) {
        if (page) await page.close().catch(() => { });
        console.error("Erreur Puppeteer :", error);
        res.status(500).json({ message: "Erreur lors de la génération du PDF" });
    } finally {
        pdfSemaphore.release();
    }
});

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