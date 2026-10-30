jest.mock('../services/comptes', () => ({ compteActif: jest.fn(), invalider: jest.fn() }));
jest.mock('../utils/logger', () => ({ error: jest.fn(), info: jest.fn() }));

const jwt = require('jsonwebtoken');
const comptes = require('../services/comptes');
const { requireAdmin, requireAdminConsultation, requireGestionComptes, requireAnyAuth } = require('../middlewares/auth.middleware');

describe('Auth Middleware', () => {
    let mockReq;
    let mockRes;
    let mockNext;

    beforeEach(() => {
        mockReq = {
            method: 'GET',
            headers: {}
        };
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        mockNext = jest.fn();
        process.env.JWT_SECRET = 'test_secret';
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('requireAdmin', () => {
        it('should return 401 if no Authorization header is present', async () => {
            await requireAdmin(mockReq, mockRes, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Autorisation manquante' });
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should return 401 if token is invalid or expired', async () => {
            mockReq.headers.authorization = 'Bearer invalid_token';
            await requireAdmin(mockReq, mockRes, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Token invalide ou expiré' });
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should return 403 if user is not an admin', async () => {
            const token = jwt.sign({ role: 'resident', cin: '12345678' }, process.env.JWT_SECRET);
            mockReq.headers.authorization = `Bearer ${token}`;
            await requireAdmin(mockReq, mockRes, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(403);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Accès réservé aux administrateurs' });
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should call next() and set req.admin if user is admin', async () => {
            comptes.compteActif.mockResolvedValueOnce({ id: 1, login: 'admin', role: 'admin' });
            const token = jwt.sign({ id: 1, role: 'admin' }, process.env.JWT_SECRET);
            mockReq.headers.authorization = `Bearer ${token}`;
            await requireAdmin(mockReq, mockRes, mockNext);
            expect(mockReq.admin).toEqual({ id: 1, login: 'admin', role: 'admin', droits: 'admin' });
            expect(mockNext).toHaveBeenCalled();
            expect(mockRes.status).not.toHaveBeenCalled();
        });

        it('refuse un compte désactivé même avec un jeton encore valide', async () => {
            comptes.compteActif.mockResolvedValueOnce(null);
            mockReq.headers.authorization = `Bearer ${jwt.sign({ id: 4, role: 'admin' }, process.env.JWT_SECRET)}`;
            await requireAdmin(mockReq, mockRes, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockNext).not.toHaveBeenCalled();
        });
    });

    describe('rôle lecture', () => {
        const jetonLecture = () => `Bearer ${jwt.sign({ id: 2, role: 'admin', droits: 'admin' }, process.env.JWT_SECRET)}`;

        beforeEach(() => {
            // Le rôle vient de la base, pas du jeton : un jeton « admin » ancien ne suffit pas.
            comptes.compteActif.mockResolvedValue({ id: 2, login: 'consultation', role: 'lecture' });
            mockReq.headers.authorization = jetonLecture();
        });

        it('autorise la consultation (GET)', async () => {
            await requireAdmin(mockReq, mockRes, mockNext);
            expect(mockNext).toHaveBeenCalled();
            expect(mockReq.admin.droits).toBe('lecture');
        });

        it.each(['POST', 'PUT', 'DELETE'])('refuse toute modification (%s)', async (method) => {
            mockReq.method = method;
            await requireAdmin(mockReq, mockRes, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(403);
            expect(mockNext).not.toHaveBeenCalled();
        });

        it("autorise l'aperçu PDF (POST de consultation)", async () => {
            mockReq.method = 'POST';
            await requireAdminConsultation(mockReq, mockRes, mockNext);
            expect(mockNext).toHaveBeenCalled();
        });

        it('refuse la gestion des comptes, même en lecture', async () => {
            await requireGestionComptes(mockReq, mockRes, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(403);
        });
    });

    describe('requireAnyAuth', () => {
        it('should call next() if valid token is provided (admin)', () => {
            const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET);
            mockReq.headers.authorization = `Bearer ${token}`;
            requireAnyAuth(mockReq, mockRes, mockNext);
            expect(mockReq.authUser.role).toBe('admin');
            expect(mockNext).toHaveBeenCalled();
        });

        it('should call next() if valid token is provided (resident)', () => {
            const token = jwt.sign({ role: 'resident', cin: '00000000' }, process.env.JWT_SECRET);
            mockReq.headers.authorization = `Bearer ${token}`;
            requireAnyAuth(mockReq, mockRes, mockNext);
            expect(mockReq.authUser.role).toBe('resident');
            expect(mockReq.authUser.cin).toBe('00000000');
            expect(mockNext).toHaveBeenCalled();
        });

        it('should return 401 if no valid token is provided', () => {
            requireAnyAuth(mockReq, mockRes, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockNext).not.toHaveBeenCalled();
        });
    });
});
