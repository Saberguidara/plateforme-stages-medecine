// Routes de l'administration ajoutées avec la refonte : statistiques, journal, recherche,
// annulation contrôlée d'un import, exports et rôle « lecture ».
jest.mock('../config/db', () => ({
    query: jest.fn(),
    getConnection: jest.fn()
}));
jest.mock('../services/comptes', () => ({ compteActif: jest.fn(), invalider: jest.fn() }));
jest.mock('../utils/logger', () => ({ error: jest.fn(), info: jest.fn() }));

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const JSZip = require('jszip');
const ExcelJS = require('exceljs');
const db = require('../config/db');
const comptes = require('../services/comptes');

const ADMIN = { id: 1, login: 'admin', role: 'admin' };
const LECTEUR = { id: 2, login: 'consultation', role: 'lecture' };

function construireApp() {
    const app = express();
    app.use(express.json());
    app.use('/api', require('../routes/residents.routes'));
    app.use('/api', require('../routes/fiches.routes'));
    app.use('/api/admin', require('../routes/import.routes'));
    app.use('/api/admin', require('../routes/admin.routes'));
    return app;
}

// Réponses de la base choisies d'après la requête SQL (l'ordre des requêtes importe peu).
function repondre(regles) {
    db.query.mockImplementation(async (sql, params) => {
        const regle = regles.find(([motif]) => motif.test(sql));
        if (!regle) return [[]];
        return typeof regle[1] === 'function' ? regle[1](sql, params) : regle[1];
    });
}

const binaire = (req) => req.buffer(true).parse((res, cb) => {
    const morceaux = [];
    res.on('data', (d) => morceaux.push(d));
    res.on('end', () => cb(null, Buffer.concat(morceaux)));
});

describe("Routes de l'administration", () => {
    let app;
    const jeton = (compte) => `Bearer ${jwt.sign({ id: compte.id, role: 'admin' }, process.env.JWT_SECRET)}`;

    beforeAll(() => {
        process.env.JWT_SECRET = 'test_secret';
        app = construireApp();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        db.query.mockReset();
        comptes.compteActif.mockImplementation(async (id) => (id === 2 ? LECTEUR : ADMIN));
    });

    describe('GET /api/admin/statistiques', () => {
        it('renvoie les effectifs par année de résidanat, le semestre en cours et les alertes', async () => {
            repondre([
                [/GROUP BY niveau/, [[{ niveau: 1, total: 10 }, { niveau: 3, total: 4 }]]],
                [/COUNT\(DISTINCT f\.resident_id\)/, [[{ n: 25, residents: 12 }]]],
                [/FROM historique_imports\s+WHERE undone = 0/, [[{
                    id: 7, filename: 'registre.xlsx', semestre: 'S2', annee: 2026,
                    undo_data: JSON.stringify({ residentIdsVus: [1, 2], niveaux: [2, 3] })
                }]]],
                [/FROM historique_imports ORDER BY id DESC LIMIT 5/, [[{ id: 7, filename: 'registre.xlsx', undone: 0 }]]],
                [/SELECT COUNT\(\*\) AS n FROM residents r/, [[{ n: 3 }]]]
            ]);

            const res = await request(app).get('/api/admin/statistiques').set('Authorization', jeton(ADMIN));

            expect(res.status).toBe(200);
            const annee = new Date().getFullYear();
            expect(res.body.promotions).toEqual([
                { niveau: 1, promotion: annee, total: 10 },
                { niveau: 2, promotion: annee - 1, total: 0 },
                { niveau: 3, promotion: annee - 2, total: 4 }
            ]);
            expect(res.body.actifs).toBe(14);
            expect(res.body.fichesSemestre).toBe(25);
            expect(res.body).toMatchObject({ sansFicheSemestre: 3, sansEmail: 3, sansStage: 3, aRelancer: 3 });
            expect(res.body.absentsRegistre).toEqual({ total: 3, import: { id: 7, filename: 'registre.xlsx', semestre: 'S2', annee: 2026 } });
            expect(res.body.derniersImports[0].undone).toBe(false);
        });

        it('exige une connexion administrateur', async () => {
            const res = await request(app).get('/api/admin/statistiques');
            expect(res.status).toBe(401);
        });
    });

    describe('GET /api/admin/residents (alertes)', () => {
        it('filtre les résidents absents du dernier registre', async () => {
            repondre([
                [/FROM historique_imports/, [[{ id: 7, annee: 2026, undo_data: JSON.stringify({ residentIdsVus: [5, 6], niveaux: [2] }) }]]],
                [/SELECT COUNT\(\*\) as total/, [[{ total: 1 }]]],
                [/SELECT COUNT\(\*\) AS n FROM residents WHERE email/, [[{ n: 0 }]]],
                [/FROM residents r/, [[{ id: 9, cin: '00000009' }]]]
            ]);

            const res = await request(app).get('/api/admin/residents?alerte=absents-registre').set('Authorization', jeton(ADMIN));

            expect(res.status).toBe(200);
            expect(res.body.total).toBe(1);
            const [sql, params] = db.query.mock.calls.find(([s]) => /SELECT COUNT\(\*\) as total/.test(s));
            expect(sql).toContain('r.id NOT IN (?)');
            expect(params).toEqual(expect.arrayContaining([[5, 6], [2]]));
        });
    });

    describe('GET /api/admin/recherche', () => {
        it('cherche par CIN ou par nom et limite à 8 suggestions', async () => {
            db.query.mockResolvedValueOnce([[{ id: 1, cin: '12345678', nom_prenom: 'NOM EXEMPLE' }]]);

            const res = await request(app).get('/api/admin/recherche?q=1234').set('Authorization', jeton(ADMIN));

            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(1);
            const [sql, params] = db.query.mock.calls[0];
            expect(sql).toContain('LIMIT 8');
            expect(params[0]).toBe('1234%');
            expect(params[1]).toBe('%1234%');
        });

        it("ne lance pas de requête pour moins de deux caractères", async () => {
            const res = await request(app).get('/api/admin/recherche?q=1').set('Authorization', jeton(ADMIN));
            expect(res.body).toEqual([]);
            expect(db.query).not.toHaveBeenCalled();
        });
    });

    describe('GET /api/admin/residents/verifier-cin', () => {
        it('signale un CIN déjà attribué à un autre résident', async () => {
            db.query.mockResolvedValueOnce([[{ id: 4, nom_prenom: 'NOM EXEMPLE' }]]);
            const res = await request(app).get('/api/admin/residents/verifier-cin?cin=12345678&exclure=9').set('Authorization', jeton(ADMIN));
            expect(res.body).toEqual({ existe: true, resident: { id: 4, nom_prenom: 'NOM EXEMPLE' } });
            expect(db.query.mock.calls[0][1]).toEqual(['12345678', 9]);
        });
    });

    describe('GET /api/admin/journal', () => {
        it('renvoie les actions d\'un dossier avec les valeurs avant / après décodées', async () => {
            repondre([
                [/FROM journal_actions j LEFT JOIN/, [[{
                    id: 3, action: 'modification', entite: 'fiche', admin_login: 'admin',
                    avant: '{"service":"A"}', apres: { service: 'B' }
                }]]],
                [/COUNT\(\*\) AS n FROM journal_actions/, [[{ n: 1 }]]]
            ]);

            const res = await request(app).get('/api/admin/journal?resident_id=5').set('Authorization', jeton(ADMIN));

            expect(res.status).toBe(200);
            expect(res.body.data[0].avant).toEqual({ service: 'A' });
            expect(res.body.data[0].apres).toEqual({ service: 'B' });
            expect(db.query.mock.calls[0][1]).toEqual([5, 30, 0]);
        });
    });

    describe('POST /api/admin/import/undo', () => {
        let connexion;

        beforeEach(() => {
            connexion = {
                beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn().mockResolvedValue(), release: jest.fn(),
                query: jest.fn()
            };
            db.getConnection.mockResolvedValue(connexion);
        });

        it("refuse l'annulation quand une fiche de l'import a été modifiée depuis", async () => {
            connexion.query
                .mockResolvedValueOnce([[{ filename: 'x.xlsx', undo_data: '{}', undone: 0 }]])
                .mockResolvedValueOnce([[{ n: 2 }]]);

            const res = await request(app).post('/api/admin/import/undo').set('Authorization', jeton(ADMIN)).send({ importId: 3 });

            expect(res.status).toBe(409);
            expect(res.body.fichesModifiees).toBe(2);
            expect(connexion.rollback).toHaveBeenCalled();
            expect(connexion.query).not.toHaveBeenCalledWith(expect.stringContaining('DELETE'), expect.anything());
        });

        it('annule un import intact et le journalise', async () => {
            connexion.query
                .mockResolvedValueOnce([[{ filename: 'x.xlsx', undo_data: '{"residentIds":[4]}', undone: 0 }]])
                .mockResolvedValueOnce([[{ n: 0 }]])
                .mockResolvedValueOnce([{ affectedRows: 5 }])
                .mockResolvedValueOnce([{ affectedRows: 1 }])
                .mockResolvedValue([{}]);

            const res = await request(app).post('/api/admin/import/undo').set('Authorization', jeton(ADMIN)).send({ importId: 3 });

            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Import annulé : 5 fiches et 1 résidents supprimés.');
            expect(connexion.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO journal_actions'), expect.arrayContaining(['annulation', 'import', 3]));
            expect(connexion.commit).toHaveBeenCalled();
        });
    });

    describe('Rôle lecture', () => {
        it('peut consulter la liste des résidents', async () => {
            repondre([[/COUNT/, [[{ total: 0, n: 0 }]]]]);
            const res = await request(app).get('/api/admin/residents').set('Authorization', jeton(LECTEUR));
            expect(res.status).toBe(200);
        });

        it.each([
            ['post', '/api/admin/residents'],
            ['put', '/api/admin/residents/1'],
            ['delete', '/api/admin/fiches/1'],
            ['post', '/api/admin/import/undo'],
            ['post', '/api/admin/referentiels/fusion']
        ])('ne peut pas modifier (%s %s)', async (methode, url) => {
            const res = await request(app)[methode](url).set('Authorization', jeton(LECTEUR)).send({});
            expect(res.status).toBe(403);
            expect(db.query).not.toHaveBeenCalled();
        });

        it("n'a pas accès à la gestion des comptes", async () => {
            const res = await request(app).get('/api/admin/comptes').set('Authorization', jeton(LECTEUR));
            expect(res.status).toBe(403);
        });
    });

    describe('Exports', () => {
        it('exporte la liste filtrée des résidents en Excel', async () => {
            repondre([
                [/SELECT COUNT\(\*\) as total/, [[{ total: 1 }]]],
                [/FROM residents r/, [[{
                    id: 1, cin: '12345678', nom_prenom: 'NOM EXEMPLE', email: null, specialite: 'Médecine de famille',
                    faculte_origine: 'FMSfax', promotion: 2025, niveau: 2, nb_fiches: 3, fiches_semestre: 1, telechargements_semestre: 0
                }]]]
            ]);

            const res = await binaire(request(app).get('/api/admin/exports/residents.xlsx?email=sans').set('Authorization', jeton(ADMIN)));

            expect(res.status).toBe(200);
            expect(res.headers['content-disposition']).toMatch(/attachment; filename="residents-/);
            const classeur = new ExcelJS.Workbook();
            await classeur.xlsx.load(res.body);
            const feuille = classeur.getWorksheet('Résidents');
            expect(feuille.getRow(2).getCell(1).value).toBe('12345678');
            expect(feuille.getRow(2).getCell(7).value).toBe('2A');
            expect(feuille.getRow(2).getCell(10).value).toBe('Non');
            const [sql] = db.query.mock.calls.find(([s]) => /SELECT COUNT\(\*\) as total/.test(s));
            expect(sql).toContain("r.email IS NULL OR r.email = ''");
        });

        it('exporte seulement les résidents sélectionnés', async () => {
            repondre([[/SELECT COUNT\(\*\) as total/, [[{ total: 2 }]]]]);

            const res = await binaire(request(app).get('/api/admin/exports/residents.xlsx?ids=4,9,abc').set('Authorization', jeton(ADMIN)));

            expect(res.status).toBe(200);
            const [sql, params] = db.query.mock.calls.find(([s]) => /SELECT COUNT\(\*\) as total/.test(s));
            expect(sql).toContain('r.id IN (?)');
            expect(params).toContainEqual([4, 9]);
        });

        it("génère un ZIP des fiches d'un semestre filtré par promotion", async () => {
            db.query.mockResolvedValueOnce([[{
                id: 1, periode: 'T3', annee: 2026, service: 'SERVICE', hopital: 'HOPITAL',
                cin: '12345678', nom_prenom: 'NOM EXEMPLE', specialite: 'Médecine de famille', niveau: null, promotion: 2025
            }]]);

            const res = await binaire(request(app).get('/api/admin/exports/fiches.zip?semestre=S2&annee=2026&promo=2025').set('Authorization', jeton(ADMIN)));

            expect(res.status).toBe(200);
            expect(res.headers['content-type']).toBe('application/zip');
            const zip = await JSZip.loadAsync(res.body);
            expect(Object.keys(zip.files)).toEqual(['2A/Fiche_12345678_T3_2026.pdf']);
            const pdf = await zip.file('2A/Fiche_12345678_T3_2026.pdf').async('nodebuffer');
            expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
            expect(db.query.mock.calls[0][1]).toEqual([['S2', 'T3', 'T4', 'R2'], 2026, 2025]);
        });

        it('répond 404 quand aucune fiche ne correspond', async () => {
            db.query.mockResolvedValueOnce([[]]);
            const res = await request(app).get('/api/admin/exports/fiches.zip?semestre=S1&annee=2026').set('Authorization', jeton(ADMIN));
            expect(res.status).toBe(404);
        });
    });

    describe('Référentiels', () => {
        it('regroupe les variantes d\'écriture probables', () => {
            const { variantesProbables } = require('../controllers/referentiels.controller');
            const groupes = variantesProbables([
                { valeur: 'HOP REG KERKENNAH', nb_fiches: 8 },
                { valeur: 'HOP REG KERKERNNAH', nb_fiches: 4 },
                { valeur: 'HOP REG MAHRES', nb_fiches: 10 }
            ]);
            expect(groupes).toEqual([{
                cible: 'HOP REG KERKENNAH',
                variantes: [{ valeur: 'HOP REG KERKENNAH', nb_fiches: 8 }, { valeur: 'HOP REG KERKERNNAH', nb_fiches: 4 }]
            }]);
        });
    });
});
