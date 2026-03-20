const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// Get interview configuration
router.get('/interview-config', authenticate, authorize(['admin', 'hr_manager', 'recruiter']), async (req, res) => {
    try {
        const result = await db.query(
            `SELECT * FROM system_settings WHERE setting_key = 'interview_config'`
        );
        
        if (result.rows.length === 0) {
            return res.json(null);
        }
        
        res.json(result.rows[0].setting_value);
    } catch (error) {
        console.error('Get interview config error:', error);
        res.status(500).json({ error: 'Failed to fetch interview configuration' });
    }
});

// Save interview configuration
router.post('/interview-config', authenticate, authorize(['admin', 'hr_manager']), async (req, res) => {
    try {
        const configData = req.body;
        
        // Upsert the configuration
        await db.query(`
            INSERT INTO system_settings (setting_key, setting_value, updated_by, updated_at)
            VALUES ('interview_config', $1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (setting_key) 
            DO UPDATE SET 
                setting_value = $1,
                updated_by = $2,
                updated_at = CURRENT_TIMESTAMP
        `, [JSON.stringify(configData), req.user.id]);
        
        res.json({ success: true, message: 'Configuration saved successfully' });
    } catch (error) {
        console.error('Save interview config error:', error);
        res.status(500).json({ error: 'Failed to save interview configuration' });
    }
});

// Get all system settings (admin only)
router.get('/', authenticate, authorize(['admin']), async (req, res) => {
    try {
        const result = await db.query(`SELECT * FROM system_settings ORDER BY setting_key`);
        res.json(result.rows);
    } catch (error) {
        console.error('Get settings error:', error);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

module.exports = router;
