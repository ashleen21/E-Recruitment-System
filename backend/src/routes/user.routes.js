const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// Get all users (Admin/HR only)
router.get('/', authenticate, authorize('admin', 'hr_manager'), async (req, res) => {
    try {
        const { role, status, search, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;
        
        let query = `
            SELECT u.id, u.email, u.role, u.status, u.email_verified, u.last_login, u.created_at,
                   COALESCE(cp.first_name, ep.first_name) as first_name,
                   COALESCE(cp.last_name, ep.last_name) as last_name
            FROM users u
            LEFT JOIN candidate_profiles cp ON u.id = cp.user_id
            LEFT JOIN employee_profiles ep ON u.id = ep.user_id
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (role) {
            query += ` AND u.role = $${paramIndex++}`;
            params.push(role);
        }

        if (status) {
            query += ` AND u.status = $${paramIndex++}`;
            params.push(status);
        }

        if (search) {
            query += ` AND (u.email ILIKE $${paramIndex} OR cp.first_name ILIKE $${paramIndex} OR cp.last_name ILIKE $${paramIndex} OR ep.first_name ILIKE $${paramIndex} OR ep.last_name ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        // Get total count
        const countQuery = query.replace(/SELECT.*FROM/, 'SELECT COUNT(*) FROM');
        const countResult = await db.query(countQuery, params);
        const total = parseInt(countResult.rows[0].count);

        // Add pagination
        query += ` ORDER BY u.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
        params.push(limit, offset);

        const result = await db.query(query, params);

        res.json({
            users: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Get user by ID
router.get('/:id', authenticate, authorize('admin', 'hr_manager'), async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.query(`
            SELECT u.id, u.email, u.role, u.status, u.email_verified, u.last_login, u.created_at,
                   COALESCE(cp.first_name, ep.first_name) as first_name,
                   COALESCE(cp.last_name, ep.last_name) as last_name,
                   cp.phone as candidate_phone, ep.phone as employee_phone,
                   ep.department, ep.job_title, ep.employee_id
            FROM users u
            LEFT JOIN candidate_profiles cp ON u.id = cp.user_id
            LEFT JOIN employee_profiles ep ON u.id = ep.user_id
            WHERE u.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(result.rows[0]);

    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

// Update user status
router.patch('/:id/status', authenticate, authorize('admin', 'hr_manager'), async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const validStatuses = ['active', 'inactive', 'suspended', 'pending_verification'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const result = await db.query(`
            UPDATE users SET status = $1 WHERE id = $2
            RETURNING id, email, role, status
        `, [status, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Log the action
        await db.query(`
            INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values)
            VALUES ($1, 'update_status', 'user', $2, $3)
        `, [req.user.id, id, JSON.stringify({ status })]);

        res.json(result.rows[0]);

    } catch (error) {
        console.error('Update status error:', error);
        res.status(500).json({ error: 'Failed to update status' });
    }
});

// Update user role
router.patch('/:id/role', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body;

        const validRoles = ['admin', 'hr_manager', 'recruiter', 'candidate', 'employee'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }

        const result = await db.query(`
            UPDATE users SET role = $1 WHERE id = $2
            RETURNING id, email, role, status
        `, [role, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Log the action
        await db.query(`
            INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values)
            VALUES ($1, 'update_role', 'user', $2, $3)
        `, [req.user.id, id, JSON.stringify({ role })]);

        res.json(result.rows[0]);

    } catch (error) {
        console.error('Update role error:', error);
        res.status(500).json({ error: 'Failed to update role' });
    }
});

// Delete user
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { id } = req.params;

        // Prevent self-deletion
        if (id === req.user.id) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }

        const result = await db.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Log the action
        await db.query(`
            INSERT INTO audit_logs (user_id, action, entity_type, entity_id)
            VALUES ($1, 'delete', 'user', $2)
        `, [req.user.id, id]);

        res.json({ message: 'User deleted successfully' });

    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

module.exports = router;
