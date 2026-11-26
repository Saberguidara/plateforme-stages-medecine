// Module Statistiques : filtres, carte des affectations, parcours et routes.
jest.mock('../config/db', () => ({ query: jest.fn(), getConnection: jest.fn() }));
jest.mock('../services/comptes', () => ({ compteActif: jest.fn(), invalider: jest.fn() }));
jest.mock('../utils/logger', () => ({ error: jest.fn(), info: jest.fn() }));

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const ExcelJS = require('exceljs');
const db = require('../config/db');
const comptes = require('../services/comptes');
const { lireFiltres, conditionsFiches } = require('../services/statistiques/filtres');
const { construireCarte } = require('../services/statistiques/affectations');
const { construireParcours } = require('../services/statistiques/parcours');

const NOVEMBRE_2026 = new Date(2026, 10, 24);
const S2_2026 = { semestre: 'S2', annee: 2026 };

function repondre(regles) {
    db.query.mockImplementation(async (sql, params) => {
        const regle = regles.find(([motif]) => motif.test(sql));
        if (!regle) return [[]];
        return typeof regle[1] === 'function' ? regle[1](sql, params) : regle[1];
    });
}

describe('Filtres des statistiques', () => {
    it("prend l'année en cours par défaut et valide chaque filtre", () => {
        expect(lireFiltres({}, NOVEMBRE_2026)).toEqual({
            valid: true, filtres: { annee: 2026, semestre: '', promotion: null, faculte: '', hopital: '' }
        });
        expect(lireFiltres({ annee: '2025', semestre: 'S1', promotion: '2024', faculte: ' FMSfax ' }, NOVEMBRE_2026).filtres)
            .toMatchObject({ annee: 2025, semestre: 'S1', promotion: 2024, faculte: 'FMSfax' });
        expect(lireFiltres({ annee: '26' }, NOVEMBRE_2026).valid).toBe(false);
        expect(lireFiltres({ annee: '2030' }, NOVEMBRE_2026).valid).toBe(false);
        expect(lireFiltres({ semestre: 'S3' }, NOVEMBRE_2026).valid).toBe(false);
        expect(lireFiltres({ promotion: '2024 OR 1=1' }, NOVEMBRE_2026).valid).toBe(false);
    });

    it('traduit les filtres en conditions SQL paramétrées', () => {
        const { filtres } = lireFiltres({ annee: '2026', semestre: 'S2', hopital: 'CHU' }, NOVEMBRE_2026);
        const c = conditionsFiches(filtres);
        expect(c.sql).toBe('f.annee = ? AND f.periode IN (?) AND f.hopital = ?');
        expect(c.params[0]).toBe(2026);
        expect(c.params[1]).toContain('T3A');
        expect(c.params[2]).toBe('CHU');
        expect(conditionsFiches(filtres, { sansAnnee: true, sansSemestre: true }).sql).toBe('f.hopital = ?');
    });
});

describe('Carte des affectations', () => {
    it('garde les 12 hôpitaux les plus chargés, regroupe les autres et retire les rattrapages vides', () => {
        const cellules = [];
        for (let i = 1; i <= 14; i++) cellules.push({ hopital: `H${String(i).padStart(2, '0')}`, colonne: 'T1', residents: 30 - i });
        cellules.push({ hopital: 'H01', colonne: 'S1', residents: 5 });
        const carte = construireCarte(cellules, ['T1', 'T2', 'S1', 'R1']);
        expect(carte.colonnes).toEqual(['T1', 'T2', 'S1']);
        expect(carte.lignes).toHaveLength(13);
        expect(carte.lignes[0]).toMatchObject({ hopital: 'H01', total: 34, valeurs: { T1: 29, T2: 0, S1: 5 } });
        expect(carte.lignes[12]).toMatchObject({ hopital: 'Autres (2 hôpitaux)', autres: true, valeurs: { T1: 16 + 17 } });
        expect(carte.max).toBe(33);
    });
});

describe('Parcours de résidanat', () => {
    const resident = { promotion: 2025, niveau: 2, specialite: 'Médecine de famille' };
    const etats = (p) => p.semestres.map((s) => `${s.niveau}${s.semestre}:${s.etat}`);

    it('reconnaît un semestre fait par un stage semestriel, deux trimestres ou deux moitiés de 45 jours', () => {
        const p = construireParcours(resident, [
            { periode: 'S1', annee: 2025 },
            { periode: 'T3', annee: 2025 }, { periode: 'T4A', annee: 2025 }, { periode: 'T4B', annee: 2025 },
            { periode: 'T1', annee: 2026 },
            { periode: 'S2', annee: 2026 }
        ], S2_2026);
        expect(etats(p)).toEqual(['1S1:fait', '1S2:fait', '2S1:partiel', '2S2:en-cours', '3S1:a-venir', '3S2:a-venir']);
        expect(p).toMatchObject({ promotion: 2025, faits: 2, total: 6, incomplets: 1, sansFicheCourant: false });
    });

    it("compte un semestre rattrapé et signale le semestre en cours sans fiche", () => {
        const p = construireParcours(resident, [
            { periode: 'T1', annee: 2025 }, { periode: 'R1', annee: 2025 },
            { periode: 'S2', annee: 2025 }, { periode: 'S1', annee: 2026 },
            { periode: 'S1', annee: 2027 }
        ], S2_2026);
        expect(etats(p)).toEqual(['1S1:rattrape', '1S2:fait', '2S1:fait', '2S2:manquant', '3S1:prevu', '3S2:a-venir']);
        expect(p).toMatchObject({ faits: 3, incomplets: 0, sansFicheCourant: true });
    });

    it("déduit la promotion de l'année de résidanat et compte les fiches hors parcours", () => {
        const p = construireParcours({ promotion: null, niveau: 3 }, [{ periode: 'S1', annee: 2023 }], S2_2026);
        expect(p.promotion).toBe(2024);
        expect(p.horsParcours).toBe(1);
        expect(construireParcours({ promotion: null, niveau: null }, [], S2_2026)).toBeNull();
    });
});

describe('Routes du module Statistiques', () => {
    let app;
    const jeton = `Bearer ${jwt.sign({ id: 2, role: 'admin' }, 'test_secret')}`;

    beforeAll(() => {
        process.env.JWT_SECRET = 'test_secret';
        app = express();
        app.use('/api/admin', require('../routes/admin.routes'));
    });

    beforeEach(() => {
        db.query.mockReset();
        comptes.compteActif.mockResolvedValue({ id: 2, login: 'consultation', role: 'lecture' });
    });

    const AFFECTATIONS = [
        [/AS fiches, COUNT\(DISTINCT f\.resident_id\) AS residents,\s+COUNT\(DISTINCT/, [[{ fiches: 5, residents: 4, hopitaux: 2, services: 3 }]]],
        [/AS trimestres/, [[
            { hopital: 'CHU A', fiches: '3', residents: 3, trimestres: 2, semestres: 1, rattrapages: 0 },
            { hopital: 'CHU B', fiches: 2, residents: 1, trimestres: 0, semestres: 1, rattrapages: 1 }
        ]]],
        [/GROUP BY service/, [[{ service: 'Urgences', fiches: 3, hopitaux: 2 }]]],
        [/AS niveau/, [[{ niveau: 1, fiches: 3, residents: 2 }, { niveau: null, fiches: 1, residents: 1 }]]],
        [/AS faculte/, [[{ faculte: 'FMSfax', residents: 4, fiches: 5 }]]],
        [/AS colonne/, [[{ hopital: 'CHU A', colonne: 'T3', residents: 2 }, { hopital: 'CHU B', colonne: 'R2', residents: 1 }]]],
        [/GROUP BY f\.annee, semestre/, [[{ annee: 2026, semestre: 'S2', fiches: 5, residents: 4 }]]]
    ];

    it('renvoie les affectations filtrées, accessibles en lecture seule', async () => {
        repondre(AFFECTATIONS);
        const res = await request(app).get('/api/admin/statistiques/affectations?annee=2026&semestre=S2').set('Authorization', jeton);
        expect(res.status).toBe(200);
        expect(res.body.totaux).toEqual({ fiches: 5, residents: 4, hopitaux: 2, services: 3 });
        expect(res.body.types).toEqual({ trimestre: 2, semestre: 2, rattrapage: 1 });
        expect(res.body.parHopital[0].fiches).toBe(3);
        expect(res.body.parNiveau).toEqual([{ niveau: 1, fiches: 3, residents: 2 }]);
        expect(res.body.carte.colonnes).toEqual(['T3', 'T4', 'S2', 'R2']);
        expect(res.body.evolution).toHaveLength(8);
        expect(res.body.evolution.at(-1)).toMatchObject({ libelle: 'S2 2026', fiches: 5 });
    });

    it('refuse des filtres invalides', async () => {
        const res = await request(app).get('/api/admin/statistiques/affectations?semestre=S9').set('Authorization', jeton);
        expect(res.status).toBe(400);
        const detail = await request(app).get('/api/admin/statistiques/affectations/detail?hopital=CHU&colonne=X1').set('Authorization', jeton);
        expect(detail.status).toBe(400);
        const parcours = await request(app).get('/api/admin/statistiques/parcours?promotion=abc').set('Authorization', jeton);
        expect(parcours.status).toBe(400);
    });

    it("détaille une case de la carte par service", async () => {
        repondre([[/ORDER BY service, r\.nom_prenom/, [[
            { id: 1, nom_prenom: 'A', promotion: 2025, annee: 2026, periode: 'T3', service: 'Urgences' },
            { id: 2, nom_prenom: 'B', promotion: 2026, annee: 2026, periode: 'T3A', service: 'Urgences' },
            { id: 3, nom_prenom: 'C', promotion: 2024, annee: 2026, periode: 'T3', service: 'Pédiatrie' }
        ]]]]);
        const res = await request(app).get('/api/admin/statistiques/affectations/detail?annee=2026&hopital=CHU%20A&colonne=T3')
            .set('Authorization', jeton);
        expect(res.status).toBe(200);
        expect(res.body.residents).toBe(3);
        expect(res.body.services).toEqual([{ service: 'Urgences', residents: 2 }, { service: 'Pédiatrie', residents: 1 }]);
        expect(res.body.liste[0]).toMatchObject({ id: 1, niveau: 2 });
        const [, params] = db.query.mock.calls[0];
        expect(params).toContainEqual(['T3', 'T3A', 'T3B']);
    });

    it('filtre les parcours incomplets et résume chaque promotion', async () => {
        repondre([
            [/FROM residents r WHERE/, [[
                { id: 1, nom_prenom: 'ALPHA', promotion: 2025, niveau: 2, specialite: 'Médecine de famille' },
                { id: 2, nom_prenom: 'BETA', promotion: 2025, niveau: 2, specialite: 'Médecine de famille' }
            ]]],
            [/FROM formulaires_stage WHERE resident_id IN/, [[
                { resident_id: 1, periode: 'S1', annee: 2025 }, { resident_id: 1, periode: 'S2', annee: 2025 },
                { resident_id: 1, periode: 'S1', annee: 2026 }, { resident_id: 1, periode: 'S2', annee: 2026 },
                { resident_id: 2, periode: 'S1', annee: 2025 }
            ]]]
        ]);
        const res = await request(app).get('/api/admin/statistiques/parcours?promotion=2025&etat=incomplets').set('Authorization', jeton);
        expect(res.status).toBe(200);
        expect(res.body.promotions).toEqual([{ promotion: 2025, niveau: 2, residents: 2, aJour: 1, incomplets: 1, sansFicheCourant: 1 }]);
        expect(res.body.residents.map((r) => r.nom_prenom)).toEqual(['BETA']);
    });

    it('exporte les affectations en Excel, une feuille par tableau', async () => {
        repondre(AFFECTATIONS);
        const res = await request(app).get('/api/admin/statistiques/affectations.xlsx?annee=2026').set('Authorization', jeton)
            .buffer(true).parse((r, cb) => { const m = []; r.on('data', (d) => m.push(d)); r.on('end', () => cb(null, Buffer.concat(m))); });
        expect(res.status).toBe(200);
        expect(res.headers['content-disposition']).toContain('statistiques-affectations-2026.xlsx');
        const classeur = new ExcelJS.Workbook();
        await classeur.xlsx.load(res.body);
        expect(classeur.worksheets.map((f) => f.name)).toEqual(['Par hôpital', 'Par service', 'Carte', 'Évolution']);
        expect(classeur.getWorksheet('Par hôpital').getRow(3).values.slice(1, 3)).toEqual(['CHU A', 3]);
    });
});
