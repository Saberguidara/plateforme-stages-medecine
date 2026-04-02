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
const fichesRoutes = require('../routes/fiches.routes');

describe('Fiches Routes Auth', () => {
    let app;

    beforeEach(() => {
        process.env.JWT_SECRET = 'test_secret';
        app = express();
        app.use(express.json());
        app.use('/api', fichesRoutes);
    });

    it('rejects create fiche without token', async () => {
        const response = await request(app)
            .post('/api/admin/fiches')
            .send({ resident_id: 1, periode: 'S1', annee: 2026, service: 'X', hopital: 'Y' });

        expect(response.status).toBe(401);
    });

    it('rejects with resident token (not admin)', async () => {
        const token = jwt.sign({ role: 'resident', cin: '00000000' }, process.env.JWT_SECRET);

        const response = await request(app)
            .post('/api/admin/fiches')
            .set('Authorization', `Bearer ${token}`)
            .send({ resident_id: 1, periode: 'S1', annee: 2026, service: 'X', hopital: 'Y' });

        expect(response.status).toBe(403);
    });
});
