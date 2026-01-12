const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// Simple in-memory session store (for demo purposes)
const sessions = new Map();

// Admin credentials (in production, use hashed passwords and database)
const ADMIN_USERS = {
    'admin': 'admin123'
};

// Generate a random session token
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// POST /api/auth/login - Login and get session token
router.post('/login', (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        // Check credentials
        if (ADMIN_USERS[username] && ADMIN_USERS[username] === password) {
            const token = generateToken();
            const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours

            sessions.set(token, {
                username,
                expiresAt
            });

            console.log(`✅ Admin login: ${username}`);

            return res.json({
                success: true,
                token,
                username,
                expiresAt
            });
        }

        console.log(`❌ Failed login attempt: ${username}`);
        return res.status(401).json({ error: 'Invalid username or password' });
    } catch (error) {
        console.error('Error in POST /auth/login:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/auth/verify - Verify session token
router.get('/verify', (req, res) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ valid: false, error: 'No token provided' });
        }

        const token = authHeader.substring(7);
        const session = sessions.get(token);

        if (!session) {
            return res.status(401).json({ valid: false, error: 'Invalid token' });
        }

        if (Date.now() > session.expiresAt) {
            sessions.delete(token);
            return res.status(401).json({ valid: false, error: 'Token expired' });
        }

        return res.json({
            valid: true,
            username: session.username
        });
    } catch (error) {
        console.error('Error in GET /auth/verify:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/auth/logout - Logout and invalidate session
router.post('/logout', (req, res) => {
    try {
        const authHeader = req.headers.authorization;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            sessions.delete(token);
            console.log('✅ Admin logged out');
        }

        return res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        console.error('Error in POST /auth/logout:', error);
        res.status(500).json({ error: error.message });
    }
});

// Middleware to check authentication
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.substring(7);
    const session = sessions.get(token);

    if (!session) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }

    if (Date.now() > session.expiresAt) {
        sessions.delete(token);
        return res.status(401).json({ error: 'Token expired' });
    }

    req.user = { username: session.username };
    next();
}

module.exports = router;
module.exports.requireAuth = requireAuth;
