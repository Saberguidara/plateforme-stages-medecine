// Synthèse des statistiques par semestre, semestres civils et cache mémoire.
jest.mock('../config/db', () => ({ query: jest.fn(), getConnection: jest.fn() }));
jest.mock('../services/comptes', () => ({ compteActif: jest.fn(), invalider: jest.fn() }));
jest.mock('../utils/logger', () => ({ error: jest.fn(), info: jest.fn() }));

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const comptes = require('../services/comptes');
const cache = require('../services/statistiques/cache');
const { lireSemestre, derniers, bornes } = require('../services/statistiques/semestres');
const { mediane, lundi, jourLocal } = require('../services/statistiques/synthese');

function repondre(regles) {
    db.query.mockImplementation(async (sql, params) => {
        const regle = regles.find(([motif]) => motif.test(sql));
        if (!regle) return [[]];
        return typeof regle[1] === 'function' ? regle[1](sql, params) : regle[1];
    });
}

describe('Semestres civils', () => {
    const novembre2026 = new Date(2026, 10, 24);

    it('prend le semestre en cours par défaut et refuse un semestre futur ou mal écrit', () => {
        expect(lireSemestre({}, novembre2026)).toEqual({ valid: true, semestre: 'S2', annee: 2026 });
        expect(lireSemestre({ semestre: 'S1', annee: '2025' }, novembre2026)).toEqual({ valid: true, semestre: 'S1', annee: 2025 });
        expect(lireSemestre({ semestre: 'S1', annee: '2027' }, novembre2026).valid).toBe(false);
        expect(lireSemestre({ semestre: 'S3', annee: '2026' }, novembre2026).valid).toBe(false);
        expect(lireSemestre({ semestre: 'S1', annee: '2026 OR 1=1' }, novembre2026).valid).toBe(false);
    });

    it('liste les derniers semestres du plus ancien au plus récent', () => {
        expect(derniers({ semestre: 'S1', annee: 2026 }, 3)).toEqual([
            { semestre: 'S1', annee: 2025 }, { semestre: 'S2', annee: 2025 }, { semestre: 'S1', annee: 2026 }
        ]);
    });

    it('borne le 2nd semestre du 1er juillet au 1er janvier suivant', () => {
        const { debut, fin } = bornes({ semestre: 'S2', annee: 2026 });
        expect(jourLocal(debut)).toBe('2026-07-01');
        expect(jourLocal(fin)).toBe('2027-01-01');
    });

    it('calcule le lundi de la semaine et la médiane', () => {
        expect(jourLocal(lundi(new Date(2026, 8, 2)))).toBe('2026-08-31'); // mercredi 2 septembre
        expect(jourLocal(lundi(new Date(2026, 7, 31)))).toBe('2026-08-31'); // le lundi lui-même
        expect(jourLocal(lundi(new Date(2026, 8, 6)))).toBe('2026-08-31'); // dimanche
        expect(mediane([180, 60])).toBe(120);
        expect(mediane([5, 1, 3])).toBe(3);
        expect(mediane([])).toBeNull();
    });
});

describe('GET /api/admin/statistiques/synthese', () => {
    let app;
    const jeton = (id) => `Bearer ${jwt.sign({ id, role: 'admin' }, process.env.JWT_SECRET)}`;

    beforeAll(() => {
        process.env.JWT_SECRET = 'test_secret';
        app = express();
        app.use(express.json());
        app.use('/api/admin', require('../routes/admin.routes'));
    });

    beforeEach(() => {
        db.query.mockReset();
        comptes.compteActif.mockImplementation(async (id) => (id === 2
            ? { id: 2, login: 'consultation', role: 'lecture' }
            : { id: 1, login: 'admin', role: 'admin' }));
    });

    const REGLES = [
        [/GROUP BY f\.annee, semestre/, [[
            { annee: 2026, semestre: 'S2', fiches: 10, residents: 8, annoncees: 9, telechargees: '7' },
            { annee: 2025, semestre: 'S2', fiches: 8, residents: 6, annoncees: 8, telechargees: 4 },
            { annee: 2026, semestre: 'S1', fiches: 9, residents: 7, annoncees: 0, telechargees: 0 }
        ]]],
        [/FROM telechargements x/, [[{ jour: '2026-09-02', n: 3 }, { jour: '2026-09-04', n: 2 }]]],
        [/FROM notifications_fiches x/, [[{ jour: '2026-09-01', n: 9 }]]],
        [/WHERE traite_le IS NULL/, [[{ n: 2, plus_ancien: '2026-11-20 10:00:00' }]]],
        [/TIMESTAMPDIFF/, [[{ minutes: 60 }, { minutes: 180 }, { minutes: null }]]]
    ];

    it('compare le semestre au même semestre de l\'année précédente', async () => {
        repondre(REGLES);
        const res = await request(app).get('/api/admin/statistiques/synthese?semestre=S2&annee=2026')
            .set('Authorization', jeton(2));

        expect(res.status).toBe(200);
        expect(res.body.semestre.libelle).toBe('S2 2026');
        expect(res.body.comparaison.libelle).toBe('S2 2025');
        expect(res.body.indicateurs.fiches).toEqual({ valeur: 10, precedent: 8 });
        expect(res.body.indicateurs.residents).toEqual({ valeur: 8, precedent: 6 });
        expect(res.body.indicateurs.tauxRecuperation).toEqual({ valeur: 70, precedent: 50 });
        expect(res.body.diffusion).toEqual({ creees: 10, annoncees: 9, telechargees: 7 });
        expect(res.body.indicateurs.signalements).toMatchObject({ ouverts: 2, recus: 3, traites: 2, delaiMedianHeures: 2 });

        // Six semestres, du S1 2024 au S2 2026 ; un semestre sans fiche vaut zéro
        expect(res.body.semestres.map((s) => s.libelle)).toEqual(['S1 2024', 'S2 2024', 'S1 2025', 'S2 2025', 'S1 2026', 'S2 2026']);
        expect(res.body.semestres[0]).toMatchObject({ fiches: 0, tauxRecuperation: null });

        // Téléchargements et e-mails regroupés sur la semaine du lundi 31 août
        expect(res.body.semaines[0].debut).toBe('2026-06-01');
        expect(res.body.semaines.find((s) => s.debut === '2026-08-31')).toEqual({ debut: '2026-08-31', telechargements: 5, envois: 9 });
    });

    it('refuse un semestre invalide ou futur', async () => {
        repondre(REGLES);
        const invalide = await request(app).get('/api/admin/statistiques/synthese?semestre=S3&annee=2026').set('Authorization', jeton(1));
        const futur = await request(app).get('/api/admin/statistiques/synthese?semestre=S1&annee=2099').set('Authorization', jeton(1));
        expect(invalide.status).toBe(400);
        expect(futur.status).toBe(400);
        expect(db.query).not.toHaveBeenCalledWith(expect.stringMatching(/formulaires_stage/), expect.anything());
    });

    it('exige une connexion administrateur', async () => {
        const res = await request(app).get('/api/admin/statistiques/synthese');
        expect(res.status).toBe(401);
    });
});

describe('Cache des statistiques', () => {
    beforeEach(() => { cache.configurer({ actif: true }); cache.vider(); });
    afterAll(() => cache.configurer({ actif: false }));

    it('réutilise un calcul récent et recalcule après avoir été vidé', async () => {
        const calcul = jest.fn(async () => ({ n: 1 }));
        await cache.memoriser('cle', calcul);
        await cache.memoriser('cle', calcul);
        expect(calcul).toHaveBeenCalledTimes(1);
        cache.vider();
        await cache.memoriser('cle', calcul);
        expect(calcul).toHaveBeenCalledTimes(2);
    });

    it('ne garde pas un calcul en échec', async () => {
        const calcul = jest.fn().mockRejectedValueOnce(new Error('base indisponible')).mockResolvedValue({ n: 2 });
        await expect(cache.memoriser('cle', calcul)).rejects.toThrow('base indisponible');
        await expect(cache.memoriser('cle', calcul)).resolves.toEqual({ n: 2 });
    });

    it('se vide après une écriture réussie, pas après une lecture ni un refus', async () => {
        const app = express();
        app.use(cache.viderApresEcriture);
        app.get('/lire', (req, res) => res.json({}));
        app.post('/ecrire', (req, res) => res.json({}));
        app.post('/refuser', (req, res) => res.status(403).json({}));
        const calcul = jest.fn(async () => 1);

        await cache.memoriser('cle', calcul);
        await request(app).get('/lire');
        await request(app).post('/refuser');
        await cache.memoriser('cle', calcul);
        expect(calcul).toHaveBeenCalledTimes(1);

        await request(app).post('/ecrire');
        await cache.memoriser('cle', calcul);
        expect(calcul).toHaveBeenCalledTimes(2);
    });
});
