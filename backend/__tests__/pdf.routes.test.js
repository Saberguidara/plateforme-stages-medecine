jest.mock('../config/db', () => ({
    query: jest.fn()
}));

jest.mock('../utils/logger', () => ({
    error: jest.fn(),
    info: jest.fn()
}));

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const pdfRoutes = require('../routes/pdf.routes');

const FICHE_EN_BASE = {
    id: 10, periode: 'S1', annee: 2026, service: 'SERVICE EXEMPLE', hopital: 'HOPITAL EXEMPLE',
    resident_id: 5, cin: '12345678', nom_prenom: 'NOM PRENOM EXEMPLE', specialite: 'Médecine de famille', niveau: 1, promotion: 2024
};

describe('Génération des fiches PDF', () => {
    let app;
    const jeton = (payload) => `Bearer ${jwt.sign(payload, process.env.JWT_SECRET)}`;

    beforeEach(() => {
        process.env.JWT_SECRET = 'test_secret';
        jest.clearAllMocks();
        app = express();
        app.use(express.json());
        app.use('/api', pdfRoutes);
    });

    it('génère la fiche du résident connecté à partir de la base', async () => {
        db.query.mockResolvedValueOnce([[FICHE_EN_BASE]]);

        const response = await request(app)
            .post('/api/generate-pdf')
            .set('Authorization', jeton({ id: 5, cin: '12345678', role: 'resident' }))
            .send({ ficheId: 10, resident: { nom_prenom: 'NOM FALSIFIE' } });

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toBe('application/pdf');
        expect(response.body.subarray(0, 5).toString()).toBe('%PDF-');
        expect(db.query).toHaveBeenCalledWith(expect.stringContaining('WHERE f.id = ?'), [10]);
    });

    it("refuse la fiche d'un autre résident", async () => {
        db.query.mockResolvedValueOnce([[FICHE_EN_BASE]]);

        const response = await request(app)
            .post('/api/generate-pdf')
            .set('Authorization', jeton({ id: 99, cin: '00000000', role: 'resident' }))
            .send({ ficheId: 10 });

        expect(response.status).toBe(403);
    });

    it('renvoie 404 pour une fiche inexistante', async () => {
        db.query.mockResolvedValueOnce([[]]);

        const response = await request(app)
            .post('/api/generate-pdf')
            .set('Authorization', jeton({ id: 1, role: 'admin' }))
            .send({ ficheId: 404 });

        expect(response.status).toBe(404);
    });

    it("réserve l'aperçu d'un stage non enregistré aux administrateurs", async () => {
        const response = await request(app)
            .post('/api/admin/apercu-pdf')
            .set('Authorization', jeton({ id: 5, cin: '12345678', role: 'resident' }))
            .send({ resident_id: 5, periode: 'S1', annee: 2026, hopital: 'X', service: 'Y' });

        expect(response.status).toBe(403);
        expect(db.query).not.toHaveBeenCalled();
    });

    it("refuse une spécialité sans modèle de fiche", async () => {
        db.query.mockResolvedValueOnce([[{ ...FICHE_EN_BASE, specialite: 'CARDIO' }]]);

        const response = await request(app)
            .post('/api/generate-pdf')
            .set('Authorization', jeton({ id: 1, role: 'admin' }))
            .send({ ficheId: 10 });

        expect(response.status).toBe(422);
    });
});
