const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticate } = require('../middleware/auth.middleware');

// Get notifications for current user
router.get('/', authenticate, async (req, res) => {
    try {
        const { unread_only, limit = 50, offset = 0 } = req.query;

        let query = `
            SELECT * FROM notifications
            WHERE user_id = $1
        `;
        const params = [req.user.id];
        let paramIndex = 2;

        if (unread_only === 'true') {
            query += ` AND is_read = false`;
        }

        query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
        params.push(parseInt(limit), parseInt(offset));

        const result = await db.query(query, params);

        // Also get unread count
        const countResult = await db.query(
            'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false',
            [req.user.id]
        );

        res.json({
            notifications: result.rows,
            unreadCount: parseInt(countResult.rows[0].count)
        });

    } catch (error) {
        console.error('Get notifications error:', error);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// Mark notification as read
router.patch('/:id/read', authenticate, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.query(`
            UPDATE notifications SET is_read = true, read_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND user_id = $2
            RETURNING *
        `, [id, req.user.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Notification not found' });
        }

        res.json(result.rows[0]);

    } catch (error) {
        console.error('Mark notification read error:', error);
        res.status(500).json({ error: 'Failed to update notification' });
    }
});

// Mark all notifications as read
router.patch('/read-all', authenticate, async (req, res) => {
    try {
        await db.query(`
            UPDATE notifications SET is_read = true, read_at = CURRENT_TIMESTAMP
            WHERE user_id = $1 AND is_read = false
        `, [req.user.id]);

        res.json({ message: 'All notifications marked as read' });

    } catch (error) {
        console.error('Mark all read error:', error);
        res.status(500).json({ error: 'Failed to update notifications' });
    }
});

// Delete notification
router.delete('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;

        await db.query('DELETE FROM notifications WHERE id = $1 AND user_id = $2', [id, req.user.id]);

        res.json({ message: 'Notification deleted' });

    } catch (error) {
        console.error('Delete notification error:', error);
        res.status(500).json({ error: 'Failed to delete notification' });
    }
});

// Delete all read notifications
router.delete('/clear-read', authenticate, async (req, res) => {
    try {
        const result = await db.query(
            'DELETE FROM notifications WHERE user_id = $1 AND is_read = true RETURNING id',
            [req.user.id]
        );

        res.json({ 
            message: 'Read notifications cleared',
            deletedCount: result.rows.length
        });

    } catch (error) {
        console.error('Clear read notifications error:', error);
        res.status(500).json({ error: 'Failed to clear notifications' });
    }
});

module.exports = router;
