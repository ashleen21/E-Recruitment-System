const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../config/database');

// Verify JWT Token
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Access denied. No token provided.' });
        }
        
        const token = authHeader.split(' ')[1];
        
        try {
            const decoded = jwt.verify(token, config.jwt.secret);
            
            // Get user from database
            const result = await db.query(
                'SELECT id, email, role, status FROM users WHERE id = $1',
                [decoded.userId]
            );
            
            if (result.rows.length === 0) {
                return res.status(401).json({ error: 'User not found.' });
            }
            
            const user = result.rows[0];
            
            if (user.status !== 'active') {
                return res.status(403).json({ error: 'Account is not active.' });
            }
            
            req.user = user;
            next();
        } catch (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({ error: 'Token has expired.' });
            }
            return res.status(401).json({ error: 'Invalid token.' });
        }
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(500).json({ error: 'Authentication failed.' });
    }
};

// Role-based Access Control
const authorize = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required.' });
        }
        
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ 
                error: 'Access denied. Insufficient permissions.' 
            });
        }
        
        next();
    };
};

// Optional Authentication (for public routes that can have auth)
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return next();
        }
        
        const token = authHeader.split(' ')[1];
        
        try {
            const decoded = jwt.verify(token, config.jwt.secret);
            const result = await db.query(
                'SELECT id, email, role, status FROM users WHERE id = $1',
                [decoded.userId]
            );
            
            if (result.rows.length > 0 && result.rows[0].status === 'active') {
                req.user = result.rows[0];
            }
        } catch (err) {
            // Token invalid, but continue as unauthenticated
        }
        
        next();
    } catch (error) {
        next();
    }
};

module.exports = {
    authenticate,
    authorize,
    optionalAuth
};
