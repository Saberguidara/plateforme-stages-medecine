jest.mock('../config/db', () => ({
    query: jest.fn()
}));

jest.mock('../utils/logger', () => ({
    error: jest.fn(),
    info: jest.fn()
}));

const db = require('../config/db');
const { createFiche, updateFiche, deleteFiche } = require('../controllers/fiches.controller');

describe('Fiches Controller', () => {
    let req;
    let res;

    beforeEach(() => {
        req = { params: {}, body: {} };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        jest.clearAllMocks();
    });

    it('creates a fiche for an admin payload', async () => {
        req.body = { resident_id: 3, periode: 'S1', annee: 2026, service: 'Cardio', hopital: 'Hedi' };
        db.query
            .mockResolvedValueOnce([[{ id: 3 }]])
            .mockResolvedValueOnce([{ insertId: 12 }]);

        await createFiche(req, res);

        expect(res.json).toHaveBeenCalledWith({ success: true, id: 12, message: 'Fiche créée avec succès.' });
    });

    it('updates a fiche', async () => {
        req.params.id = '12';
        req.body = { periode: 'T1', annee: 2026, service: 'Onco', hopital: 'CHU', url_pdf: '' };
        db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

        await updateFiche(req, res);

        expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Fiche mise à jour avec succès.' });
    });

    it('deletes a fiche', async () => {
        req.params.id = '12';
        db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

        await deleteFiche(req, res);

        expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Fiche supprimée.' });
    });

    it('rejects invalid fiche payload', async () => {
        req.body = { resident_id: 3, periode: 'BAD', annee: 2026, service: '', hopital: '' };

        await createFiche(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Période invalide.' });
    });

    it('returns 404 when resident is missing on create', async () => {
        req.body = { resident_id: 99, periode: 'S1', annee: 2026, service: '', hopital: '' };
        db.query.mockResolvedValueOnce([[]]);

        await createFiche(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Résident introuvable.' });
    });

    it('returns 404 when fiche does not exist on update', async () => {
        req.params.id = '404';
        req.body = { periode: 'S1', annee: 2026, service: '', hopital: '', url_pdf: '' };
        db.query.mockResolvedValueOnce([{ affectedRows: 0 }]);

        await updateFiche(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Fiche introuvable.' });
    });
});
