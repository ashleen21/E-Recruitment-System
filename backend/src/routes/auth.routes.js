const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const config = require('../config');
const { authenticate } = require('../middleware/auth.middleware');
const emailService = require('../services/email.service');

// Validation Rules
const registerValidation = [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('role').isIn(['candidate', 'employee']).optional(),
    body('firstName').trim().notEmpty(),
    body('lastName').trim().notEmpty()
];

const loginValidation = [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty()
];

// Register
router.post('/register', registerValidation, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email, password, firstName, lastName, phone, role = 'candidate' } = req.body;

        // Check if user exists
        const existingUser = await db.query(
            'SELECT id FROM users WHERE email = $1',
            [email]
        );

        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 12);
        const verificationToken = uuidv4();

        // Create user
        const userResult = await db.query(`
            INSERT INTO users (email, password_hash, role, status, verification_token)
            VALUES ($1, $2, $3, 'active', $4)
            RETURNING id, email, role, status, created_at
        `, [email, passwordHash, role, verificationToken]);

        const user = userResult.rows[0];

        // Create profile based on role
        if (role === 'candidate') {
            await db.query(`
                INSERT INTO candidate_profiles (user_id, first_name, last_name, phone)
                VALUES ($1, $2, $3, $4)
            `, [user.id, firstName, lastName, phone || null]);
        } else if (role === 'employee') {
            const employeeId = `EMP${Date.now().toString().slice(-6)}`;
            await db.query(`
                INSERT INTO employee_profiles (user_id, employee_id, first_name, last_name, phone)
                VALUES ($1, $2, $3, $4, $5)
            `, [user.id, employeeId, firstName, lastName, phone || null]);
        }

        // Generate JWT
        const token = jwt.sign(
            { userId: user.id, role: user.role },
            config.jwt.secret,
            { expiresIn: config.jwt.expiresIn }
        );

        // Send verification email (async, don't wait)
        emailService.sendVerificationEmail(email, firstName, verificationToken).catch(console.error);

        res.status(201).json({
            message: 'Registration successful',
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                firstName,
                lastName
            },
            token
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Login
router.post('/login', loginValidation, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email, password } = req.body;

        // Get user
        const result = await db.query(`
            SELECT id, email, password_hash, role, status, failed_login_attempts, locked_until
            FROM users WHERE email = $1
        `, [email]);

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];

        // Check if account is locked
        if (user.locked_until && new Date(user.locked_until) > new Date()) {
            return res.status(423).json({ 
                error: 'Account is locked. Try again later.',
                lockedUntil: user.locked_until
            });
        }

        // Check if account is active
        if (user.status !== 'active') {
            return res.status(403).json({ error: 'Account is not active' });
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password_hash);

        if (!isValidPassword) {
            // Increment failed attempts
            const newAttempts = (user.failed_login_attempts || 0) + 1;
            let lockUntil = null;
            
            if (newAttempts >= 5) {
                lockUntil = new Date(Date.now() + 30 * 60 * 1000); // Lock for 30 minutes
            }

            await db.query(`
                UPDATE users SET failed_login_attempts = $1, locked_until = $2
                WHERE id = $3
            `, [newAttempts, lockUntil, user.id]);

            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Reset failed attempts and update last login
        await db.query(`
            UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login = CURRENT_TIMESTAMP
            WHERE id = $1
        `, [user.id]);

        // Get profile info
        let profile = null;
        if (user.role === 'candidate') {
            const profileResult = await db.query(
                'SELECT first_name, last_name, profile_photo_url FROM candidate_profiles WHERE user_id = $1',
                [user.id]
            );
            profile = profileResult.rows[0];
        } else if (user.role === 'employee') {
            const profileResult = await db.query(
                'SELECT first_name, last_name, department, job_title FROM employee_profiles WHERE user_id = $1',
                [user.id]
            );
            profile = profileResult.rows[0];
        } else if (user.role === 'hr_manager' || user.role === 'admin') {
            profile = { first_name: 'HR', last_name: 'Manager' };
        }

        // Generate JWT
        const token = jwt.sign(
            { userId: user.id, role: user.role },
            config.jwt.secret,
            { expiresIn: config.jwt.expiresIn }
        );

        res.json({
            message: 'Login successful',
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                firstName: profile?.first_name,
                lastName: profile?.last_name,
                department: profile?.department,
                jobTitle: profile?.job_title,
                photoUrl: profile?.profile_photo_url
            },
            token
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Get Current User
router.get('/me', authenticate, async (req, res) => {
    try {
        let profile = null;
        
        if (req.user.role === 'candidate') {
            const result = await db.query(`
                SELECT cp.*, 
                       (SELECT COUNT(*) FROM applications a WHERE a.candidate_id = cp.id) as application_count
                FROM candidate_profiles cp
                WHERE cp.user_id = $1
            `, [req.user.id]);
            profile = result.rows[0];
        } else if (req.user.role === 'employee') {
            const result = await db.query(`
                SELECT ep.*,
                       (SELECT COUNT(*) FROM applications a WHERE a.employee_id = ep.id) as internal_applications
                FROM employee_profiles ep
                WHERE ep.user_id = $1
            `, [req.user.id]);
            profile = result.rows[0];
        }

        res.json({
            user: {
                id: req.user.id,
                email: req.user.email,
                role: req.user.role,
                status: req.user.status
            },
            profile
        });

    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to get user data' });
    }
});

// Change Password
router.post('/change-password', authenticate, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!newPassword || newPassword.length < 8) {
            return res.status(400).json({ error: 'New password must be at least 8 characters' });
        }

        const result = await db.query(
            'SELECT password_hash FROM users WHERE id = $1',
            [req.user.id]
        );

        const isValid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
        if (!isValid) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        const newHash = await bcrypt.hash(newPassword, 12);
        await db.query(
            'UPDATE users SET password_hash = $1 WHERE id = $2',
            [newHash, req.user.id]
        );

        res.json({ message: 'Password changed successfully' });

    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: 'Failed to change password' });
    }
});

// Forgot Password
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        const result = await db.query(
            'SELECT id, email FROM users WHERE email = $1',
            [email]
        );

        if (result.rows.length === 0) {
            // Don't reveal if email exists
            return res.json({ message: 'If the email exists, a reset link has been sent' });
        }

        const resetToken = uuidv4();
        const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await db.query(`
            UPDATE users SET reset_token = $1, reset_token_expires = $2
            WHERE id = $3
        `, [resetToken, resetExpires, result.rows[0].id]);

        // Send reset email
        await emailService.sendPasswordResetEmail(email, resetToken);

        res.json({ message: 'If the email exists, a reset link has been sent' });

    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ error: 'Failed to process request' });
    }
});

// Reset Password
router.post('/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        if (!newPassword || newPassword.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        const result = await db.query(`
            SELECT id FROM users 
            WHERE reset_token = $1 AND reset_token_expires > CURRENT_TIMESTAMP
        `, [token]);

        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired reset token' });
        }

        const passwordHash = await bcrypt.hash(newPassword, 12);

        await db.query(`
            UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL
            WHERE id = $2
        `, [passwordHash, result.rows[0].id]);

        res.json({ message: 'Password reset successful' });

    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

// Logout (client-side token removal, but we can track it)
router.post('/logout', authenticate, async (req, res) => {
    // In a production app, you might want to blacklist the token
    res.json({ message: 'Logged out successfully' });
});

// ============================================
// Google Calendar OAuth Routes
// ============================================
const calendarService = require('../services/calendar.service');

// Get Google OAuth URL - redirect user here to authorize
router.get('/google', (req, res) => {
    try {
        const authUrl = calendarService.getAuthUrl();
        res.json({ 
            authUrl,
            message: 'Redirect to this URL to authorize Google Calendar access'
        });
    } catch (error) {
        console.error('Google auth URL error:', error);
        res.status(500).json({ error: 'Failed to generate auth URL' });
    }
});

// Google OAuth callback - handles the redirect after user authorizes
router.get('/google/callback', async (req, res) => {
    try {
        const { code } = req.query;
        
        if (!code) {
            return res.status(400).json({ error: 'Authorization code missing' });
        }

        const tokens = await calendarService.getTokens(code);
        
        // Store refresh token in database or .env for persistence
        // For now, we'll show it so you can add it to .env
        console.log('Google Calendar connected! Refresh token:', tokens.refresh_token);
        
        res.send(`
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
                    .success { background: #d4edda; border: 1px solid #c3e6cb; padding: 20px; border-radius: 8px; }
                    code { background: #f4f4f4; padding: 10px; display: block; margin: 10px 0; word-break: break-all; }
                </style>
            </head>
            <body>
                <div class="success">
                    <h2>✅ Google Calendar Connected!</h2>
                    <p>Your recruitment system can now create calendar events for interviews.</p>
                    ${tokens.refresh_token ? `
                    <p><strong>Important:</strong> Add this refresh token to your .env file:</p>
                    <code>GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}</code>
                    ` : '<p>Calendar is now authorized for this session.</p>'}
                    <p><a href="http://localhost:3000/hr/interviews">← Back to Interviews</a></p>
                </div>
            </body>
            </html>
        `);

    } catch (error) {
        console.error('Google callback error:', error);
        res.status(500).send(`
            <html>
            <body>
                <h2>❌ Authorization Failed</h2>
                <p>${error.message}</p>
                <a href="http://localhost:3000/hr/interviews">← Back to Interviews</a>
            </body>
            </html>
        `);
    }
});

module.exports = router;
