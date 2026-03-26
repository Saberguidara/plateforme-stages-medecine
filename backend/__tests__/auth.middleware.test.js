const jwt = require('jsonwebtoken');
const { requireAdmin, requireAnyAuth } = require('../middlewares/auth.middleware');

describe('Auth Middleware', () => {
    let mockReq;
    let mockRes;
    let mockNext;

    beforeEach(() => {
        mockReq = {
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
        it('should return 401 if no Authorization header is present', () => {
            requireAdmin(mockReq, mockRes, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Autorisation manquante' });
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should return 401 if token is invalid or expired', () => {
            mockReq.headers.authorization = 'Bearer invalid_token';
            requireAdmin(mockReq, mockRes, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Token invalide ou expiré' });
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should return 403 if user is not an admin', () => {
            const token = jwt.sign({ role: 'resident', cin: '12345678' }, process.env.JWT_SECRET);
            mockReq.headers.authorization = `Bearer ${token}`;
            requireAdmin(mockReq, mockRes, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(403);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Accès réservé aux administrateurs' });
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should call next() and set req.admin if user is admin', () => {
            const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET);
            mockReq.headers.authorization = `Bearer ${token}`;
            requireAdmin(mockReq, mockRes, mockNext);
            expect(mockReq.admin.role).toBe('admin');
            expect(mockNext).toHaveBeenCalled();
            expect(mockRes.status).not.toHaveBeenCalled();
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
