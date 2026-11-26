// Vues enregistrées et rapport semestriel en PDF.
jest.mock('../config/db', () => ({ query: jest.fn(), getConnection: jest.fn() }));
jest.mock('../services/comptes', () => ({ compteActif: jest.fn(), invalider: jest.fn() }));
jest.mock('../utils/logger', () => ({ error: jest.fn(), info: jest.fn() }));
jest.mock('../services/statistiques/synthese', () => ({ ...jest.requireActual('../services/statistiques/synthese'), calculerSynthese: jest.fn() }));
jest.mock('../services/statistiques/affectations', () => ({ ...jest.requireActual('../services/statistiques/affectations'), calculerAffectations: jest.fn() }));
jest.mock('../services/statistiques/parcours', () => ({ ...jest.requireActual('../services/statistiques/parcours'), calculerParcours: jest.fn() }));
jest.mock('../services/statistiques/diffusion', () => ({ ...jest.requireActual('../services/statistiques/diffusion'), calculerDiffusion: jest.fn() }));
jest.mock('../services/statistiques/qualite', () => ({ ...jest.requireActual('../services/statistiques/qualite'), calculerQualite: jest.fn() }));

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { PDFDocument } = require('pdf-lib');
const db = require('../config/db');
const comptes = require('../services/comptes');
const { lireParametres } = require('../controllers/vues.controller');
const { winAnsi, faitsMarquants } = require('../services/statistiques/rapport');
const synthese = require('../services/statistiques/synthese');
const affectations = require('../services/statistiques/affectations');
const parcours = require('../services/statistiques/parcours');
const diffusion = require('../services/statistiques/diffusion');
const qualite = require('../services/statistiques/qualite');

const COMPTES = {
    1: { id: 1, login: 'admin', role: 'admin' },
    2: { id: 2, login: 'consultation', role: 'lecture' },
    3: { id: 3, login: 'collegue', role: 'admin' }
};

let app;
const jeton = (id) => `Bearer ${jwt.sign({ id, role: 'admin' }, 'test_secret')}`;

beforeAll(() => {
    process.env.JWT_SECRET = 'test_secret';
    app = express();
    app.use(express.json());
    app.use('/api/admin', require('../routes/admin.routes'));
});

beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockReset();
    comptes.compteActif.mockImplementation(async (id) => COMPTES[id]);
});

describe('Vues enregistrées', () => {
    it("n'accepte que des paramètres d'adresse simples", () => {
        expect(lireParametres({ promo: 2025, alerte: 'sans-email', vide: '' })).toEqual({ promo: '2025', alerte: 'sans-email' });
        expect(lireParametres({ 'cle invalide': 'x' })).toBeNull();
        expect(lireParametres({ objet: { a: 1 } })).toBeNull();
        expect(lireParametres(['a'])).toBeNull();
    });

    it('liste les vues, ou indique que la table manque encore', async () => {
        db.query.mockResolvedValueOnce([[{ id: 1, nom: '3e année sans fiche', ecran: 'residents', parametres: '{"promo":"2024"}', cree_par: 'admin' }]]);
        const res = await request(app).get('/api/admin/vues').set('Authorization', jeton(2));
        expect(res.body).toEqual({ disponible: true, vues: [expect.objectContaining({ nom: '3e année sans fiche', parametres: { promo: '2024' } })] });

        db.query.mockRejectedValueOnce(Object.assign(new Error('absente'), { code: 'ER_NO_SUCH_TABLE' }));
        const sansTable = await request(app).get('/api/admin/vues').set('Authorization', jeton(1));
        expect(sansTable.body).toEqual({ disponible: false, vues: [] });
    });

    it('enregistre une vue avec son auteur et refuse un écran inconnu', async () => {
        db.query.mockResolvedValueOnce([{ insertId: 9 }]);
        const res = await request(app).post('/api/admin/vues').set('Authorization', jeton(1))
            .send({ nom: '  Promo   2025 ', ecran: 'statistiques', parametres: { promotion: 2025, onglet: 'affectations' } });
        expect(res.status).toBe(201);
        expect(db.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO vues_enregistrees'),
            ['Promo 2025', 'statistiques', '{"promotion":"2025","onglet":"affectations"}', 'admin']);

        const refus = await request(app).post('/api/admin/vues').set('Authorization', jeton(1)).send({ nom: 'X', ecran: 'comptes' });
        expect(refus.status).toBe(400);
        const lecture = await request(app).post('/api/admin/vues').set('Authorization', jeton(2)).send({ nom: 'X', ecran: 'residents' });
        expect(lecture.status).toBe(403);
    });

    it("laisse supprimer une vue à son auteur ou à un administrateur", async () => {
        repondreVue('admin');
        expect((await request(app).delete('/api/admin/vues/5').set('Authorization', jeton(1))).status).toBe(200);
        repondreVue('admin');
        expect((await request(app).delete('/api/admin/vues/5').set('Authorization', jeton(3))).status).toBe(200);
    });

    function repondreVue(auteur) {
        db.query.mockReset();
        db.query.mockImplementation(async (sql) => (/SELECT id, nom, cree_par/.test(sql)
            ? [[{ id: 5, nom: 'Vue', cree_par: auteur }]] : [{ affectedRows: 1 }]));
    }
});

describe('Rapport semestriel', () => {
    const SYNTHESE = {
        semestre: { semestre: 'S2', annee: 2026, libelle: 'S2 2026' },
        comparaison: { semestre: 'S2', annee: 2025, libelle: 'S2 2025' },
        indicateurs: {
            residents: { valeur: 190, precedent: 120 }, fiches: { valeur: 262, precedent: 163 },
            tauxRecuperation: { valeur: 71, precedent: 65 },
            signalements: { ouverts: 0, recus: 4, traites: 4, delaiMedianHeures: 30 }
        }
    };
    const AFFECTATIONS = {
        totaux: { fiches: 262 },
        parHopital: [{ hopital: 'Hôpital Hédi Chaker de Sfax', fiches: 64, trimestres: 62, semestres: 0, rattrapages: 2 }]
    };

    beforeEach(() => {
        synthese.calculerSynthese.mockResolvedValue(SYNTHESE);
        affectations.calculerAffectations.mockResolvedValue(AFFECTATIONS);
        parcours.calculerParcours.mockResolvedValue({ promotions: [{ promotion: 2025, niveau: 2, residents: 64, aJour: 57, incomplets: 7, sansFicheCourant: 5 }] });
        diffusion.calculerDiffusion.mockResolvedValue({
            totaux: { fiches: 262, annoncees: 240, telechargees: 186, jamaisTelechargees: 76, jamaisSansEmail: 5 }, delaiMedianHeures: 38
        });
        qualite.calculerQualite.mockResolvedValue({ score: 98, anomalies: 19, controles: [{ titre: 'Résidents en cours sans e-mail', nombre: 11 }] });
    });

    it('rédige les faits marquants à partir des écarts', () => {
        const faits = faitsMarquants({
            synthese: SYNTHESE, affectations: AFFECTATIONS, parcours: { promotions: [{ incomplets: 7 }, { incomplets: 13 }] },
            diffusion: { totaux: { annoncees: 240 }, delaiMedianHeures: 38 }, qualite: { score: 98 }
        });
        expect(faits).toEqual([
            'Hausse de 60,7 % des fiches par rapport à S2 2025 (163 -> 262).',
            'Hôpital Hédi Chaker de Sfax accueille 24,4 % des fiches du semestre (64).',
            "71 % des fiches ont été récupérées, en 38 h en médiane après l'e-mail.",
            '20 résident(s) en cours ont au moins un semestre passé sans stage complet.',
            '4 signalement(s) reçu(s), traités en 30 h en médiane.',
            'Score de qualité des données : 98/100.'
        ]);
    });

    it('remplace les caractères que les polices standard ne savent pas écrire', () => {
        expect(winAnsi('Hédi « Chaker » — 45 jours → ≥ ق')).toBe('Hédi « Chaker » — 45 jours -> >= ?');
    });

    it('renvoie un PDF d’une page, accessible en lecture seule', async () => {
        const res = await request(app).get('/api/admin/statistiques/rapport.pdf?semestre=S2&annee=2026').set('Authorization', jeton(2))
            .buffer(true).parse((r, cb) => { const m = []; r.on('data', (d) => m.push(d)); r.on('end', () => cb(null, Buffer.concat(m))); });
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('application/pdf');
        expect(res.headers['content-disposition']).toContain('rapport-stages-S2-2026.pdf');
        const pdf = await PDFDocument.load(res.body);
        expect(pdf.getPageCount()).toBe(1);
        expect(pdf.getTitle()).toBe('Rapport des stages S2 2026');
    });

    it('refuse un semestre futur', async () => {
        const res = await request(app).get('/api/admin/statistiques/rapport.pdf?semestre=S1&annee=2099').set('Authorization', jeton(1));
        expect(res.status).toBe(400);
    });
});
