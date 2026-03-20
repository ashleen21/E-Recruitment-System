const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticate } = require('../middleware/auth.middleware');

// Search skills
router.get('/search', async (req, res) => {
    try {
        const { q, category, limit = 20 } = req.query;

        let query = `
            SELECT id, name, category, description
            FROM skills
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (q) {
            query += ` AND (name ILIKE $${paramIndex} OR $${paramIndex} = ANY(aliases))`;
            params.push(`%${q}%`);
            paramIndex++;
        }

        if (category) {
            query += ` AND category = $${paramIndex++}`;
            params.push(category);
        }

        query += ` ORDER BY usage_count DESC, name LIMIT $${paramIndex}`;
        params.push(limit);

        const result = await db.query(query, params);
        res.json(result.rows);

    } catch (error) {
        console.error('Search skills error:', error);
        res.status(500).json({ error: 'Failed to search skills' });
    }
});

// Get all skills by category
router.get('/', async (req, res) => {
    try {
        const { category } = req.query;

        let query = 'SELECT id, name, category, description FROM skills';
        const params = [];

        if (category) {
            query += ' WHERE category = $1';
            params.push(category);
        }

        query += ' ORDER BY category, name';

        const result = await db.query(query, params);

        // Group by category
        const grouped = result.rows.reduce((acc, skill) => {
            if (!acc[skill.category]) {
                acc[skill.category] = [];
            }
            acc[skill.category].push(skill);
            return acc;
        }, {});

        res.json(grouped);

    } catch (error) {
        console.error('Get skills error:', error);
        res.status(500).json({ error: 'Failed to fetch skills' });
    }
});

// Get popular skills
router.get('/popular', async (req, res) => {
    try {
        const { limit = 20 } = req.query;

        const result = await db.query(`
            SELECT id, name, category, usage_count
            FROM skills
            WHERE is_verified = true
            ORDER BY usage_count DESC
            LIMIT $1
        `, [limit]);

        res.json(result.rows);

    } catch (error) {
        console.error('Get popular skills error:', error);
        res.status(500).json({ error: 'Failed to fetch popular skills' });
    }
});

// Get skill categories
router.get('/categories', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT DISTINCT category, COUNT(*) as count
            FROM skills
            GROUP BY category
            ORDER BY count DESC
        `);

        res.json(result.rows);

    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});

// Suggest skills based on job title
router.get('/suggest', authenticate, async (req, res) => {
    try {
        const { job_title, department } = req.query;

        // Get skills commonly associated with similar job titles
        const result = await db.query(`
            SELECT DISTINCT s.id, s.name, s.category, COUNT(*) as frequency
            FROM skills s
            JOIN candidate_skills cs ON s.id = cs.skill_id
            JOIN candidate_profiles cp ON cs.candidate_id = cp.id
            WHERE cp.current_job_title ILIKE $1
            GROUP BY s.id, s.name, s.category
            ORDER BY frequency DESC
            LIMIT 15
        `, [`%${job_title}%`]);

        res.json(result.rows);

    } catch (error) {
        console.error('Suggest skills error:', error);
        res.status(500).json({ error: 'Failed to suggest skills' });
    }
});

module.exports = router;
