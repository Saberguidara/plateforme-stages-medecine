// Onglets Diffusion et Qualité : délais de récupération, rappels, contrôles et score.
jest.mock('../config/db', () => ({ query: jest.fn(), getConnection: jest.fn() }));
jest.mock('../services/comptes', () => ({ compteActif: jest.fn(), invalider: jest.fn() }));
jest.mock('../utils/logger', () => ({ error: jest.fn(), info: jest.fn() }));
jest.mock('../services/mail', () => ({
    envoyerMail: jest.fn(async () => {}),
    envoiPossible: jest.fn(() => true),
    gabarit: jest.fn(({ paragraphes }) => paragraphes.join('\n')),
    echapper: (t) => String(t)
}));

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const comptes = require('../services/comptes');
const mail = require('../services/mail');
const { calculerDiffusion, aRappeler, tranche } = require('../services/statistiques/diffusion');
const { calculerScore, doublonsProbables, cleNom } = require('../services/statistiques/qualite');

const MAINTENANT = new Date(2026, 10, 24, 12, 0, 0);
const ilYa = (jours, heures = 0) => new Date(MAINTENANT.getTime() - (jours * 24 + heures) * 3600 * 1000);

function repondre(regles) {
    db.query.mockImplementation(async (sql, params) => {
        const regle = regles.find(([motif]) => motif.test(sql));
        if (!regle) return [[]];
        return typeof regle[1] === 'function' ? regle[1](sql, params) : regle[1];
    });
}

const fiche = (id, residentId, options = {}) => ({
    id, resident_id: residentId, periode: 'S2', annee: 2026, hopital: 'CHU', service: 'Urgences',
    nom_prenom: `RÉSIDENT ${residentId}`, email: `r${residentId}@exemple.tn`, niveau: 2,
    envoye_le: null, premier_telechargement: null, dernier_rappel: null, ...options
});

describe('Diffusion des fiches', () => {
    it('range chaque délai e-mail → téléchargement dans sa tranche', () => {
        expect([-2, 0, 23.9, 24, 71, 100, 200, 400].map(tranche))
            .toEqual(['avant', 'moins-24h', 'moins-24h', '1-3j', '1-3j', '3-7j', '1-2sem', 'plus-2sem']);
    });

    it("ne propose un rappel qu'une semaine après l'e-mail, puis au plus une fois par semaine", () => {
        expect(aRappeler(fiche(1, 1, { envoye_le: ilYa(8) }), MAINTENANT)).toBe(true);
        expect(aRappeler(fiche(1, 1, { envoye_le: ilYa(3) }), MAINTENANT)).toBe(false);
        expect(aRappeler(fiche(1, 1, { envoye_le: ilYa(20), dernier_rappel: ilYa(2) }), MAINTENANT)).toBe(false);
        expect(aRappeler(fiche(1, 1, { envoye_le: ilYa(20), dernier_rappel: ilYa(9) }), MAINTENANT)).toBe(true);
        expect(aRappeler(fiche(1, 1, { envoye_le: ilYa(20), premier_telechargement: ilYa(10) }), MAINTENANT)).toBe(false);
        expect(aRappeler(fiche(1, 1), MAINTENANT)).toBe(false);
    });

    it('calcule le délai médian, les tranches, le taux par année et les rappels', async () => {
        repondre([[/FROM formulaires_stage f JOIN residents r/, [[
            fiche(1, 1, { envoye_le: ilYa(10), premier_telechargement: ilYa(9, 20) }), // 4 h
            fiche(2, 2, { envoye_le: ilYa(10), premier_telechargement: ilYa(8) }), // 48 h
            fiche(3, 3, { envoye_le: ilYa(10) }), // jamais, rappel possible
            fiche(4, 4, { envoye_le: ilYa(10), email: null }), // jamais, sans e-mail
            fiche(5, 5, { premier_telechargement: ilYa(1), niveau: 1 }) // pas annoncée
        ]]]]);
        const d = await calculerDiffusion({ semestre: 'S2', annee: 2026 }, MAINTENANT);
        expect(d.enCours).toBe(true);
        expect(d.totaux).toEqual({ fiches: 5, annoncees: 4, telechargees: 3, residentsPrevenus: 4, jamaisTelechargees: 2, jamaisSansEmail: 1 });
        expect(d.delaiMedianHeures).toBe(26);
        expect(d.partMoins24h).toBe(25);
        expect(Object.fromEntries(d.tranches.map((t) => [t.cle, t.fiches]))).toMatchObject({ 'moins-24h': 1, '1-3j': 1, jamais: 2 });
        expect(d.parNiveau).toEqual([{ niveau: 1, fiches: 1, telechargees: 1, taux: 100 }, { niveau: 2, fiches: 4, telechargees: 2, taux: 50 }]);
        expect(d.rappels).toEqual({ disponibles: true, migrationManquante: false, residents: 1, fiches: 1, sansEmail: 1 });
    });

    it('fonctionne sans la table des rappels (migration 009 pas encore appliquée)', async () => {
        db.query.mockImplementation(async (sql) => {
            if (/relances_fiches/.test(sql)) throw Object.assign(new Error('absente'), { code: 'ER_NO_SUCH_TABLE' });
            return [[fiche(1, 1, { envoye_le: ilYa(10) })]];
        });
        const d = await calculerDiffusion({ semestre: 'S2', annee: 2026 }, MAINTENANT);
        expect(d.totaux.annoncees).toBe(1);
        expect(d.rappels).toMatchObject({ disponibles: false, migrationManquante: true });
    });
});

describe('Qualité des données', () => {
    it('repère les doublons malgré les accents, la ponctuation et l’ordre des mots', () => {
        expect(cleNom('Ben Salah  Mohamed-Ali')).toBe(cleNom('MOHAMED ALI BEN SALAH'));
        const groupes = doublonsProbables([
            { id: 1, nom_prenom: 'Trabelsi Amira', cin: '01' },
            { id: 2, nom_prenom: 'AMIRA TRABELSI', cin: '02' },
            { id: 3, nom_prenom: 'Kammoun Sami', cin: '03' }
        ]);
        expect(groupes).toHaveLength(1);
        expect(groupes[0].map((r) => r.id)).toEqual([1, 2]);
    });

    it('retire de 100 le poids de chaque contrôle selon la part concernée', () => {
        expect(calculerScore([])).toBe(100);
        expect(calculerScore([{ cle: 'sans-email', nombre: 50, base: 100 }])).toBe(85);
        expect(calculerScore([{ cle: 'sans-email', nombre: 500, base: 100 }, { cle: 'doublons', nombre: 1, base: 0 }])).toBe(70);
        expect(calculerScore(['sans-email', 'fiches-incompletes', 'variantes', 'doublons', 'absents-registre', 'sans-promotion']
            .map((cle) => ({ cle, nombre: 1, base: 1 })))).toBe(0);
    });
});

describe('Routes Diffusion, Qualité et rappels', () => {
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
        comptes.compteActif.mockImplementation(async (id) => (id === 2
            ? { id: 2, login: 'consultation', role: 'lecture' }
            : { id: 1, login: 'admin', role: 'admin' }));
    });

    it('calcule la qualité, accessible en lecture seule', async () => {
        repondre([
            [/SELECT COUNT\(\*\) AS n FROM residents r WHERE/, [[{ n: 10 }]]],
            [/r\.email IS NULL/, [[{ id: 1, nom_prenom: 'SANS EMAIL' }]]],
            [/r\.promotion IS NULL/, [[]]],
            [/SELECT COUNT\(\*\) AS n FROM formulaires_stage$/, [[{ n: 40 }]]],
            [/TRIM\(f\.hopital\) = ''/, [[]]],
            [/SELECT id, nom_prenom, cin, promotion FROM residents/, [[]]],
            [/SELECT hopital AS valeur/, [[{ valeur: 'CHU Hedi Chaker', nb_fiches: 3 }, { valeur: 'CHU Hédi Chaker', nb_fiches: 30 }]]],
            [/variantes_ignorees/, [[]]],
            [/SELECT motif, COUNT/, [[{ motif: 'hopital', n: 3 }]]],
            [/WHERE traite_le IS NULL/, [[{ n: 1 }]]]
        ]);
        const res = await request(app).get('/api/admin/statistiques/qualite').set('Authorization', jeton(2));
        expect(res.status).toBe(200);
        const parCle = Object.fromEntries(res.body.controles.map((c) => [c.cle, c]));
        expect(parCle['sans-email']).toMatchObject({ nombre: 1, base: 10 });
        expect(parCle.variantes.nombre).toBe(1);
        expect(parCle.variantes.exemples[0].precision).toBe('CHU Hédi Chaker / CHU Hedi Chaker');
        expect(res.body.score).toBe(90); // 100 × (1 − 0,3 × 1/10 − 0,15 × 1/2) = 89,5
        expect(res.body.signalements).toMatchObject({ ouverts: 1, recus12Mois: 3 });
        expect(res.body.signalements.parMois).toHaveLength(6);
    });

    it('envoie un rappel par résident et le note pour ne pas relancer la semaine suivante', async () => {
        const inserts = [];
        repondre([
            [/FROM formulaires_stage f JOIN residents r/, [[
                fiche(1, 1, { envoye_le: new Date(Date.now() - 9 * 86400000), periode: 'T3' }),
                fiche(2, 1, { envoye_le: new Date(Date.now() - 9 * 86400000), periode: 'T4' }),
                fiche(3, 2, { envoye_le: new Date(Date.now() - 2 * 86400000) })
            ]]],
            [/INSERT INTO relances_fiches/, (sql, params) => { inserts.push(params[0]); return [{}]; }],
            [/INSERT INTO journal_actions/, [{ insertId: 1 }]]
        ]);
        const res = await request(app).post('/api/admin/statistiques/diffusion/rappels').set('Authorization', jeton(1));
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ envoyes: 1, fiches: 2, echecs: 0 });
        expect(mail.envoyerMail).toHaveBeenCalledTimes(1);
        expect(mail.envoyerMail.mock.calls[0][0].subject).toBe('Rappel : vos fiches de stage vous attendent');
        expect(inserts).toEqual([[[1, 1], [2, 1]]]);
    });

    it('refuse les rappels à un compte en lecture seule', async () => {
        const res = await request(app).post('/api/admin/statistiques/diffusion/rappels').set('Authorization', jeton(2));
        expect(res.status).toBe(403);
        expect(mail.envoyerMail).not.toHaveBeenCalled();
    });
});

describe('Résumé des notifications (cloche)', () => {
    let app;
    beforeAll(() => {
        app = express();
        app.use('/api/admin', require('../routes/admin.routes'));
    });

    it('compte les signalements ouverts, les fiches à annoncer et les rappels possibles', async () => {
        db.query.mockReset();
        comptes.compteActif.mockResolvedValue({ id: 2, login: 'consultation', role: 'lecture' });
        repondre([
            [/WHERE traite_le IS NULL/, [[{ n: 2, plus_ancien: '2026-11-20 10:00:00' }]]],
            [/LEFT JOIN notifications_fiches n ON n\.fiche_id = f\.id\s+WHERE n\.fiche_id IS NULL/, [[
                { id: 1, resident_id: 1, email: 'a@exemple.tn', periode: 'S2', annee: 2026 },
                { id: 2, resident_id: 1, email: 'a@exemple.tn', periode: 'T3', annee: 2026 },
                { id: 3, resident_id: 2, email: null, periode: 'S2', annee: 2026 }
            ]]],
            [/FROM formulaires_stage f JOIN residents r/, [[fiche(4, 3, { envoye_le: new Date(Date.now() - 9 * 86400000) })]]]
        ]);
        const res = await request(app).get('/api/admin/notifications/resume')
            .set('Authorization', `Bearer ${jwt.sign({ id: 2, role: 'admin' }, 'test_secret')}`);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            signalements: { ouverts: 2, plusAncien: '2026-11-20 10:00:00' },
            fichesNonAnnoncees: { residents: 1, fiches: 2 },
            rappels: { disponibles: true, residents: 1 },
            envoiPossible: true
        });
    });
});
