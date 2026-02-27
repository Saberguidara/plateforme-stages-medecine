const jwt = require('jsonwebtoken');

exports.requireAdmin = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Autorisation manquante' });
    }
    const token = authHeader.substring(7);
    if (token && typeof token === 'string' && token.startsWith('jwt_') && token.includes('_admin')) {
        return next();
    }
    return res.status(401).json({ error: 'Token admin invalide' });
};

exports.requireResident = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Autorisation manquante' });
    }
    const token = authHeader.substring(7);
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'super_secret_jwt_key');
        req.resident = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token session invalide' });
    }
};
