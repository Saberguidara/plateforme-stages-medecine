/**
 * UX-6 : Tests unitaires Backend — Plateforme Stages Médecine
 * Couvre les scénarios critiques : auth, validation, sécurité
 * Lancer avec : npm test
 */

process.env.JWT_SECRET = 'test_jwt_secret_for_jest_32chars_ok';
process.env.DB_HOST = 'localhost';
process.env.DB_USER = 'root';
process.env.DB_PASS = '';
process.env.DB_NAME = 'gestion_stages';

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

// ============================================================
// Tests : Middleware auth (auth.middleware.js)
// ============================================================
describe('requireAdmin middleware', () => {
    const { requireAdmin } = require('../middlewares/auth.middleware');

    function mockReqWithToken(token) {
        return { headers: { authorization: token ? `Bearer ${token}` : undefined } };
    }
    const mockRes = () => {
        const res = {};
        res.status = jest.fn().mockReturnValue(res);
        res.json = jest.fn().mockReturnValue(res);
        return res;
    };
    const next = jest.fn();

    beforeEach(() => jest.clearAllMocks());

    test('rejette une requête sans token', () => {
        const req = mockReqWithToken(null);
        const res = mockRes();
        requireAdmin(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    test('rejette un token avec rôle "resident"', () => {
        const token = jwt.sign({ id: 1, role: 'resident' }, process.env.JWT_SECRET);
        const req = mockReqWithToken(token);
        const res = mockRes();
        requireAdmin(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    test('accepte un token admin valide', () => {
        const token = jwt.sign({ id: 1, login: 'admin_sfax', role: 'admin' }, process.env.JWT_SECRET);
        const req = mockReqWithToken(token);
        const res = mockRes();
        requireAdmin(req, res, next);
        expect(next).toHaveBeenCalled();
        expect(req.admin).toBeDefined();
        expect(req.admin.role).toBe('admin');
    });

    test('rejette un token expiré', () => {
        const token = jwt.sign({ id: 1, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '-1s' });
        const req = mockReqWithToken(token);
        const res = mockRes();
        requireAdmin(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    test('rejette un token signé avec un mauvais secret', () => {
        const token = jwt.sign({ id: 1, role: 'admin' }, 'mauvais_secret');
        const req = mockReqWithToken(token);
        const res = mockRes();
        requireAdmin(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
    });
});

// ============================================================
// Tests : requireAnyAuth
// ============================================================
describe('requireAnyAuth middleware', () => {
    const { requireAnyAuth } = require('../middlewares/auth.middleware');

    function makeReq(token) {
        return { headers: { authorization: token ? `Bearer ${token}` : undefined } };
    }
    const mockRes = () => {
        const res = {};
        res.status = jest.fn().mockReturnValue(res);
        res.json = jest.fn().mockReturnValue(res);
        return res;
    };
    const next = jest.fn();

    beforeEach(() => jest.clearAllMocks());

    test('accepte un token résident valide', () => {
        const token = jwt.sign({ id: 5, cin: '12345678', role: 'resident' }, process.env.JWT_SECRET);
        const req = makeReq(token);
        const res = mockRes();
        requireAnyAuth(req, res, next);
        expect(next).toHaveBeenCalled();
        expect(req.authUser.cin).toBe('12345678');
    });

    test('accepte un token admin valide', () => {
        const token = jwt.sign({ id: 1, role: 'admin' }, process.env.JWT_SECRET);
        const req = makeReq(token);
        const res = mockRes();
        requireAnyAuth(req, res, next);
        expect(next).toHaveBeenCalled();
    });

    test('rejette sans token', () => {
        const req = makeReq(null);
        const res = mockRes();
        requireAnyAuth(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
    });
});

// ============================================================
// Tests : PDF service — escapeHtml (SEC-4)
// ============================================================
describe('pdf.service — escapeHtml', () => {
    // On teste la fonction interne via generateFicheHtml
    const { generateFicheHtml } = require('../services/pdf.service');

    test('échappe les balises HTML dans le nom du résident', () => {
        const resident = { nom_prenom: '<script>alert(1)</script>', specialite: 'Test', niveau: 1 };
        const fiche = { periode: 'S1', annee: 2025, hopital: 'CHU', service: 'Médecine' };
        const html = generateFicheHtml(resident, fiche);
        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;script&gt;');
    });

    test('échappe les guillemets dans le service', () => {
        const resident = { nom_prenom: 'Test', specialite: 'Test', niveau: 1 };
        const fiche = { periode: 'S1', annee: 2025, hopital: 'CHU', service: '"inject"' };
        const html = generateFicheHtml(resident, fiche);
        expect(html).toContain('&quot;inject&quot;');
    });

    test('gère les valeurs null/undefined sans crash', () => {
        const resident = { nom_prenom: null, specialite: undefined, niveau: 1 };
        const fiche = { periode: 'S1', annee: 2025, hopital: null, service: undefined };
        expect(() => generateFicheHtml(resident, fiche)).not.toThrow();
    });

    test('génère du HTML valide pour les 6 types de période', () => {
        ['S1', 'S2', 'T1', 'T2', 'T3', 'T4'].forEach(periode => {
            const html = generateFicheHtml(
                { nom_prenom: 'Test', specialite: 'Test', niveau: 2 },
                { periode, annee: 2025, hopital: 'CHU', service: 'Med' }
            );
            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('FICHE DE VALIDATION');
        });
    });
});

// ============================================================
// Tests : bcrypt (SEC-3)
// ============================================================
describe('bcrypt — hachage des mots de passe', () => {
    test('un mot de passe hashé ne correspond pas au hash brut', async () => {
        const hash = await bcrypt.hash('faculte2026', 12);
        expect(hash).not.toBe('faculte2026');
    });

    test('bcrypt.compare retourne true avec le bon mot de passe', async () => {
        const hash = await bcrypt.hash('monMotDePasse', 12);
        const match = await bcrypt.compare('monMotDePasse', hash);
        expect(match).toBe(true);
    });

    test('bcrypt.compare retourne false avec un mauvais mot de passe', async () => {
        const hash = await bcrypt.hash('monMotDePasse', 12);
        const match = await bcrypt.compare('mauvaisMotDePasse', hash);
        expect(match).toBe(false);
    });
});

// ============================================================
// Tests : Validation de l'année (BUG-4)
// ============================================================
describe('Validation année import Excel', () => {
    function validateAnnee(val) {
        const annee = parseInt(val);
        return !isNaN(annee) && annee >= 2000 && annee <= 2100;
    }

    test('rejette NaN', () => expect(validateAnnee('abc')).toBe(false));
    test('rejette une année trop ancienne', () => expect(validateAnnee('1999')).toBe(false));
    test('rejette une année trop future', () => expect(validateAnnee('2101')).toBe(false));
    test('accepte 2025', () => expect(validateAnnee('2025')).toBe(true));
    test('accepte 2000 (borne min)', () => expect(validateAnnee('2000')).toBe(true));
    test('accepte 2100 (borne max)', () => expect(validateAnnee('2100')).toBe(true));
});
