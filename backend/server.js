const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const multer = require('multer');
const xlsx = require('xlsx');
const upload = multer({ storage: multer.memoryStorage() });
const app = express();
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');

// Serve uploaded files from /uploads (if you store PDFs there)
const uploadsDir = path.join(__dirname, 'uploads');
// Add simple CORS headers for static uploads responses
app.use('/uploads', (req, res, next) => {
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    next();
}, express.static(uploadsDir));

// Secure-ish file download endpoint with path sanitization
app.get('/api/files/:name', (req, res) => {
    const name = req.params.name;
    if (!name) return res.status(400).json({ error: 'Filename required' });

    // Prevent directory traversal
    const safeName = path.normalize(name).replace(/^\.+[\\/]/, '');
    const filePath = path.join(uploadsDir, safeName);

    // Ensure filePath is within uploadsDir
    if (!filePath.startsWith(uploadsDir)) {
        return res.status(400).json({ error: 'Invalid filename' });
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            return res.status(404).json({ error: 'File not found' });
        }
        // ensure CORS header present for browser requests
        const origin = req.headers.origin || '*';
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
        res.sendFile(filePath);
    });
});
// Autoriser les requêtes depuis le frontend et permettre l'envoi de cookies
// En dev, refléter l'origine pour éviter les problèmes entre localhost et 127.0.0.1
app.use(cors({ origin: (origin, cb) => cb(null, origin), credentials: true }));
app.use(express.json()); // Permet de lire les données envoyées par l'IHM admin


// Création d'un Pool de connexions (Multi-caisses)
const db = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '', // Mets ton mot de passe si tu en as un sous Wamp
    database: 'gestion_stages',
    waitForConnections: true,
    connectionLimit: 10, // Ouvre jusqu'à 10 connexions en simultané
    queueLimit: 0
});

// Le Pool se connecte tout seul, on fait juste un petit test pour vérifier
db.getConnection((err, connection) => {
    if (err) {
        console.error("Erreur de connexion à MySQL :", err);
    } else {
        console.log("✅ Connecté à MySQL avec succès (Mode Pool) !");
        connection.release(); // On libère la connexion de test
    }
});

// ==========================================
// ROUTES AUTHENTIFICATION (Admin + Résidents OTP)
// ==========================================
const authRoutes = require('./routes/auth.routes');
app.use('/api/auth', authRoutes);

// Helper function and middleware are now exported in middlewares/auth.middleware.js but kept here for backward compatibility with import/pdf routes until full refactor.
const authMiddleware = require('./middlewares/auth.middleware');
const requireAdmin = authMiddleware.requireAdmin;
const requireResident = authMiddleware.requireResident;
// ==========================================
// ROUTE : Importation Excel (Double Format)
// ==========================================
// Note: import endpoint now requires token in Authorization header
app.post('/api/admin/import', requireAdmin, upload.single('fichierExcel'), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "Aucun fichier reçu." });

    const anneeSelectionnee = parseInt(req.body.annee);
    const semestreChoisi = req.body.semestre;
    const typeSpecialite = req.body.typeSpecialite; // 'standard' ou 'famille'

    try {
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const lignesExcel = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        const dbPromise = db.promise();
        let lignesInserees = 0;
        let residentsCrees = 0;

        for (const ligne of lignesExcel) {
            // Variables qui vont stocker les données, peu importe le format Excel
            let cin, nomPrenom, specialite, faculteOrigine, hopital1, service1, hopital2, service2, niveauExcel;

            // --- LECTURE SELON LE FORMAT SÉLECTIONNÉ ---
            if (typeSpecialite === 'standard') {
                // FORMAT MINISTÈRE
                cin = String(ligne['CIN']).trim();
                nomPrenom = ligne['NOM ET PPRENOM'] || ligne['NOM ET PRENOM']; // On gère la faute de frappe du Ministère !
                specialite = ligne['SP.'];
                faculteOrigine = ligne['FAC D\'ORIGINE'];
                hopital1 = ligne['HOPITAL'];
                service1 = ligne['SERVICE'];
                hopital2 = null; // Pas de 2ème stage dans le fichier standard
                service2 = null;
                niveauExcel = parseInt(ligne['ANNEE']);
            } else {
                // FORMAT FACULTÉ (Médecine de Famille)
                cin = String(ligne['CIN']).trim();
                nomPrenom = ligne['Nom et prénom'];
                specialite = ligne['Spécialité'];
                faculteOrigine = ligne['Faculté d\'origine'];
                hopital1 = ligne['Hopital 1'] || ligne['Hôpital 1']; // Tolérance sur l'accent
                service1 = ligne['Service 1'];
                hopital2 = ligne['Hopital 2'] || ligne['Hôpital 2'];
                service2 = ligne['Service 2'];
                niveauExcel = parseInt(ligne['Année']) || parseInt(ligne['Annee']);
            }

            // Si la ligne est vide ou sans CIN valide, on passe à la suivante
            if (!cin || cin === 'undefined' || cin === 'null') continue;

            let residentId;

            // 1. RECHERCHE DU RÉSIDENT
            const [residents] = await dbPromise.query('SELECT id, niveau FROM residents WHERE cin = ?', [cin]);

            if (residents.length > 0) {
                // Le résident existe
                residentId = residents[0].id;
                // Mise à jour de l'année (niveau) si nécessaire
                if (niveauExcel && residents[0].niveau !== niveauExcel) {
                    await dbPromise.query('UPDATE residents SET niveau = ? WHERE id = ?', [niveauExcel, residentId]);
                }
            } else {
                // Création du résident
                const promotion = anneeSelectionnee - (niveauExcel || 1) + 1;
                const [resultInsertRes] = await dbPromise.query(
                    'INSERT INTO residents (cin, nom_prenom, specialite, faculte_origine, promotion, niveau) VALUES (?, ?, ?, ?, ?, ?)',
                    [cin, nomPrenom || 'Non renseigné', specialite || 'Non renseignée', faculteOrigine || 'Inconnue', promotion, niveauExcel || 1]
                );
                residentId = resultInsertRes.insertId;
                residentsCrees++;
            }

            // 2. INSERTION DES STAGES
            if (typeSpecialite === 'famille' && service2 && hopital2) {
                // Format trimestriel détecté
                let periodeA = semestreChoisi === 'S1' ? 'T1' : 'T3';
                let periodeB = semestreChoisi === 'S1' ? 'T2' : 'T4';

                await dbPromise.query('INSERT INTO formulaires_stage (resident_id, periode, annee, service, hopital, url_pdf) VALUES (?, ?, ?, ?, ?, ?)', [residentId, periodeA, anneeSelectionnee, service1, hopital1, '']);
                await dbPromise.query('INSERT INTO formulaires_stage (resident_id, periode, annee, service, hopital, url_pdf) VALUES (?, ?, ?, ?, ?, ?)', [residentId, periodeB, anneeSelectionnee, service2, hopital2, '']);
                lignesInserees += 2;
            } else if (service1 && hopital1) {
                // Format semestriel standard
                await dbPromise.query('INSERT INTO formulaires_stage (resident_id, periode, annee, service, hopital, url_pdf) VALUES (?, ?, ?, ?, ?, ?)', [residentId, semestreChoisi, anneeSelectionnee, service1, hopital1, '']);
                lignesInserees += 1;
            }
        }

        res.json({ message: `Succès : ${residentsCrees} nouveaux résidents et ${lignesInserees} fiches générés.` });

    } catch (error) {
        console.error("--- ERREUR LORS DE L'IMPORT ---", error);
        res.status(500).json({ message: "Erreur serveur : Vérifiez les entêtes de votre fichier Excel." });
    }
});
// ==========================================
// ROUTE : Recherche d'un résident et ses stages
// ==========================================
app.get('/api/residents/:cin', async (req, res) => {
    const cin = req.params.cin;
    const startTime = Date.now();

    try {
        const dbPromise = db.promise();

        // 1. On cherche le résident
        const residentStart = Date.now();
        const [residents] = await dbPromise.query('SELECT id, cin, nom_prenom, specialite, faculte_origine, niveau FROM residents WHERE cin = ?', [cin]);
        console.log(`[PERF] Recherche résident: ${Date.now() - residentStart}ms`);

        if (residents.length === 0) {
            return res.status(404).json({ message: "Résident introuvable" });
        }

        const resident = residents[0];

        // 2. On cherche toutes ses fiches de stage
        const fichesStart = Date.now();
        const [fiches] = await dbPromise.query('SELECT * FROM formulaires_stage WHERE resident_id = ? ORDER BY annee DESC, periode ASC', [resident.id]);
        console.log(`[PERF] Recherche fiches: ${Date.now() - fichesStart}ms`);

        // 3. On renvoie le package complet à Angular
        console.log(`[PERF] Total recherche: ${Date.now() - startTime}ms`);
        res.json({
            id: resident.id,
            cin: resident.cin,
            nom_prenom: resident.nom_prenom,
            specialite: resident.specialite,
            faculte_origine: resident.faculte_origine,
            niveau: resident.niveau,
            fiches: fiches
        });

    } catch (error) {
        console.error("Erreur lors de la recherche :", error);
        res.status(500).json({ error: "Erreur serveur lors de la recherche" });
    }
});

// ==========================================
// 3. ROUTE ADMIN : Modification d'une fiche
// ==========================================
app.put('/api/admin/fiches/:id', requireAdmin, (req, res) => {
    const ficheId = req.params.id;
    const { periode, service, hopital, url_pdf } = req.body;

    const sql = `UPDATE formulaires_stage SET periode = ?, service = ?, hopital = ?, url_pdf = ? WHERE id = ?`;

    db.query(sql, [periode, service, hopital, url_pdf, ficheId], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "La fiche a été mise à jour avec succès !" });
    });
});

// ==========================================
// ROUTE : Génération de PDF via Puppeteer (HTML vers PDF)
// ==========================================
const { generateFicheHtml } = require('./services/pdf.service');

app.post('/api/generate-pdf', async (req, res) => {
    const { resident, fiche } = req.body;

    try {
        // 1. Démarrage du navigateur invisible
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();

        // 2. Création du modèle HTML généré par le service dédié
        const htmlContent = generateFicheHtml(resident, fiche);

        // 3. Injection du HTML dans la page
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

        // 4. Génération du PDF
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' }
        });

        await browser.close();

        // 5. Envoi du PDF au Frontend
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Length': pdfBuffer.length
        });
        res.send(pdfBuffer);

    } catch (error) {
        console.error("Erreur Puppeteer :", error);
        res.status(500).json({ message: "Erreur lors de la génération du PDF" });
    }
});

// 4. Démarrage du serveur
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Le serveur Backend tourne sur http://localhost:${PORT}`);
});

// Endpoint to upload a PDF and attach it to a fiche (protected)
app.post('/api/admin/upload/:ficheId', requireAdmin, upload.single('file'), async (req, res) => {
    const ficheId = req.params.ficheId;
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    try {
        const filename = `${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
        const outPath = path.join(uploadsDir, filename);
        // Save buffer to disk
        fs.writeFileSync(outPath, req.file.buffer);

        // Update DB
        const dbPromise = db.promise();
        await dbPromise.query('UPDATE formulaires_stage SET url_pdf = ? WHERE id = ?', [filename, ficheId]);

        res.json({ message: 'File uploaded', filename });
    } catch (err) {
        console.error('Upload error:', err);
        res.status(500).json({ message: 'Server error during upload' });
    }
});