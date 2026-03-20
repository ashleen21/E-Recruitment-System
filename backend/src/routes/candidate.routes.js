const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { uploadResume, uploadPhoto, handleUploadError } = require('../middleware/upload.middleware');

// Get candidate profile
router.get('/profile', authenticate, authorize('candidate'), async (req, res) => {
    try {
        const result = await db.query(`
            SELECT cp.*,
                   u.email,
                   (SELECT json_agg(json_build_object('id', cs.id, 'skill_id', cs.skill_id, 'name', s.name, 'category', s.category, 'proficiency', cs.proficiency_level, 'years', cs.years_of_experience))
                    FROM candidate_skills cs JOIN skills s ON cs.skill_id = s.id WHERE cs.candidate_id = cp.id) as skills,
                   (SELECT json_agg(json_build_object('id', e.id, 'institution', e.institution_name, 'degree', e.degree_type, 'field', e.field_of_study, 'start', e.start_date, 'end', e.end_date))
                    FROM education_records e WHERE e.candidate_id = cp.id) as education,
                   (SELECT json_agg(exp_data ORDER BY exp_data->>'start' DESC) FROM (
                        SELECT json_build_object('id', w.id, 'company', w.company_name, 'title', w.job_title, 'start', w.start_date, 'end', w.end_date, 'current', w.is_current, 'description', w.description) as exp_data
                        FROM work_experience w WHERE w.candidate_id = cp.id
                    ) sub) as experience,
                   (SELECT json_agg(json_build_object('id', c.id, 'name', c.name, 'issuer', c.issuing_organization, 'date', c.issue_date, 'expiry', c.expiry_date))
                    FROM certifications c WHERE c.candidate_id = cp.id) as certifications
            FROM candidate_profiles cp
            JOIN users u ON cp.user_id = u.id
            WHERE cp.user_id = $1
        `, [req.user.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Profile not found' });
        }

        res.json(result.rows[0]);

    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

// Update candidate profile
router.put('/profile', authenticate, authorize('candidate'), async (req, res) => {
    try {
        const {
            first_name, last_name, phone, location, linkedin_url, portfolio_url,
            summary, years_of_experience, current_job_title, current_company,
            expected_salary_min, expected_salary_max, willing_to_relocate,
            preferred_locations, availability_date, notice_period_days
        } = req.body;

        const result = await db.query(`
            UPDATE candidate_profiles SET
                first_name = COALESCE($1, first_name),
                last_name = COALESCE($2, last_name),
                phone = COALESCE($3, phone),
                location = COALESCE($4, location),
                linkedin_url = COALESCE($5, linkedin_url),
                portfolio_url = COALESCE($6, portfolio_url),
                summary = COALESCE($7, summary),
                years_of_experience = COALESCE($8, years_of_experience),
                current_job_title = COALESCE($9, current_job_title),
                current_company = COALESCE($10, current_company),
                expected_salary_min = COALESCE($11, expected_salary_min),
                expected_salary_max = COALESCE($12, expected_salary_max),
                willing_to_relocate = COALESCE($13, willing_to_relocate),
                preferred_locations = COALESCE($14, preferred_locations),
                availability_date = $15,
                notice_period_days = COALESCE($16, notice_period_days),
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $17
            RETURNING *
        `, [
            first_name, last_name, phone, location, linkedin_url, portfolio_url,
            summary, years_of_experience, current_job_title, current_company,
            expected_salary_min, expected_salary_max, willing_to_relocate,
            preferred_locations, availability_date, notice_period_days,
            req.user.id
        ]);

        // Calculate and update profile completeness
        const profile = result.rows[0];
        const completeness = calculateProfileCompleteness(profile);
        await db.query('UPDATE candidate_profiles SET profile_completeness = $1 WHERE id = $2', [completeness, profile.id]);

        res.json({ ...profile, profile_completeness: completeness });

    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// Upload profile photo
router.post('/profile/photo', authenticate, authorize('candidate'), uploadPhoto, handleUploadError, async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No photo uploaded' });
        }

        const photoUrl = `/uploads/photos/${req.file.filename}`;

        await db.query(
            'UPDATE candidate_profiles SET profile_photo_url = $1 WHERE user_id = $2',
            [photoUrl, req.user.id]
        );

        res.json({ message: 'Photo uploaded successfully', photoUrl });

    } catch (error) {
        console.error('Upload photo error:', error);
        res.status(500).json({ error: 'Failed to upload photo' });
    }
});

// Add skill
router.post('/skills', authenticate, authorize('candidate'), async (req, res) => {
    try {
        const { skill_name, proficiency_level, years_of_experience, is_primary } = req.body;

        // Get candidate ID
        const candidateResult = await db.query('SELECT id FROM candidate_profiles WHERE user_id = $1', [req.user.id]);
        if (candidateResult.rows.length === 0) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        const candidateId = candidateResult.rows[0].id;

        // Find or create skill
        let skillResult = await db.query(
            'SELECT id FROM skills WHERE normalized_name = $1',
            [skill_name.toLowerCase().replace(/[^a-z0-9]/g, '_')]
        );

        let skillId;
        if (skillResult.rows.length === 0) {
            const newSkill = await db.query(`
                INSERT INTO skills (name, normalized_name, category)
                VALUES ($1, $2, 'technical')
                RETURNING id
            `, [skill_name, skill_name.toLowerCase().replace(/[^a-z0-9]/g, '_')]);
            skillId = newSkill.rows[0].id;
        } else {
            skillId = skillResult.rows[0].id;
        }

        // Add skill to candidate
        const result = await db.query(`
            INSERT INTO candidate_skills (candidate_id, skill_id, proficiency_level, years_of_experience, is_primary)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (candidate_id, skill_id) DO UPDATE SET
                proficiency_level = $3, years_of_experience = $4, is_primary = $5
            RETURNING *
        `, [candidateId, skillId, proficiency_level, years_of_experience, is_primary || false]);

        res.json(result.rows[0]);

    } catch (error) {
        console.error('Add skill error:', error);
        res.status(500).json({ error: 'Failed to add skill' });
    }
});

// Remove skill
router.delete('/skills/:skillId', authenticate, authorize('candidate'), async (req, res) => {
    try {
        const { skillId } = req.params;

        const result = await db.query(`
            DELETE FROM candidate_skills
            WHERE skill_id = $1 AND candidate_id = (SELECT id FROM candidate_profiles WHERE user_id = $2)
            RETURNING id
        `, [skillId, req.user.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Skill not found' });
        }

        res.json({ message: 'Skill removed successfully' });

    } catch (error) {
        console.error('Remove skill error:', error);
        res.status(500).json({ error: 'Failed to remove skill' });
    }
});

// Add education
router.post('/education', authenticate, authorize('candidate'), async (req, res) => {
    try {
        const { institution_name, degree_type, field_of_study, start_date, end_date, is_current, gpa, achievements } = req.body;

        const candidateResult = await db.query('SELECT id FROM candidate_profiles WHERE user_id = $1', [req.user.id]);
        const candidateId = candidateResult.rows[0].id;

        const result = await db.query(`
            INSERT INTO education_records (candidate_id, institution_name, degree_type, field_of_study, start_date, end_date, is_current, gpa, achievements)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `, [candidateId, institution_name, degree_type, field_of_study, start_date, end_date, is_current, gpa, achievements]);

        res.json(result.rows[0]);

    } catch (error) {
        console.error('Add education error:', error);
        res.status(500).json({ error: 'Failed to add education' });
    }
});

// Update education
router.put('/education/:id', authenticate, authorize('candidate'), async (req, res) => {
    try {
        const { id } = req.params;
        const { institution_name, degree_type, field_of_study, start_date, end_date, is_current, gpa, achievements } = req.body;

        const result = await db.query(`
            UPDATE education_records SET
                institution_name = COALESCE($1, institution_name),
                degree_type = COALESCE($2, degree_type),
                field_of_study = COALESCE($3, field_of_study),
                start_date = COALESCE($4, start_date),
                end_date = $5,
                is_current = COALESCE($6, is_current),
                gpa = COALESCE($7, gpa),
                achievements = COALESCE($8, achievements)
            WHERE id = $9 AND candidate_id = (SELECT id FROM candidate_profiles WHERE user_id = $10)
            RETURNING *
        `, [institution_name, degree_type, field_of_study, start_date, end_date, is_current, gpa, achievements, id, req.user.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Education record not found' });
        }

        res.json(result.rows[0]);

    } catch (error) {
        console.error('Update education error:', error);
        res.status(500).json({ error: 'Failed to update education' });
    }
});

// Delete education
router.delete('/education/:id', authenticate, authorize('candidate'), async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.query(`
            DELETE FROM education_records
            WHERE id = $1 AND candidate_id = (SELECT id FROM candidate_profiles WHERE user_id = $2)
            RETURNING id
        `, [id, req.user.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Education record not found' });
        }

        res.json({ message: 'Education deleted successfully' });

    } catch (error) {
        console.error('Delete education error:', error);
        res.status(500).json({ error: 'Failed to delete education' });
    }
});

// Add work experience
router.post('/experience', authenticate, authorize('candidate'), async (req, res) => {
    try {
        const { company_name, job_title, location, start_date, end_date, is_current, description, achievements } = req.body;

        const candidateResult = await db.query('SELECT id FROM candidate_profiles WHERE user_id = $1', [req.user.id]);
        const candidateId = candidateResult.rows[0].id;

        const result = await db.query(`
            INSERT INTO work_experience (candidate_id, company_name, job_title, location, start_date, end_date, is_current, description, achievements)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `, [candidateId, company_name, job_title, location, start_date, end_date, is_current, description, achievements]);

        res.json(result.rows[0]);

    } catch (error) {
        console.error('Add experience error:', error);
        res.status(500).json({ error: 'Failed to add experience' });
    }
});

// Update work experience
router.put('/experience/:id', authenticate, authorize('candidate'), async (req, res) => {
    try {
        const { id } = req.params;
        const { company_name, job_title, location, start_date, end_date, is_current, description, achievements } = req.body;

        const result = await db.query(`
            UPDATE work_experience SET
                company_name = COALESCE($1, company_name),
                job_title = COALESCE($2, job_title),
                location = COALESCE($3, location),
                start_date = COALESCE($4, start_date),
                end_date = $5,
                is_current = COALESCE($6, is_current),
                description = COALESCE($7, description),
                achievements = COALESCE($8, achievements)
            WHERE id = $9 AND candidate_id = (SELECT id FROM candidate_profiles WHERE user_id = $10)
            RETURNING *
        `, [company_name, job_title, location, start_date, end_date, is_current, description, achievements, id, req.user.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Experience record not found' });
        }

        res.json(result.rows[0]);

    } catch (error) {
        console.error('Update experience error:', error);
        res.status(500).json({ error: 'Failed to update experience' });
    }
});

// Delete work experience
router.delete('/experience/:id', authenticate, authorize('candidate'), async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.query(`
            DELETE FROM work_experience
            WHERE id = $1 AND candidate_id = (SELECT id FROM candidate_profiles WHERE user_id = $2)
            RETURNING id
        `, [id, req.user.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Experience record not found' });
        }

        res.json({ message: 'Experience deleted successfully' });

    } catch (error) {
        console.error('Delete experience error:', error);
        res.status(500).json({ error: 'Failed to delete experience' });
    }
});

// Add certification
router.post('/certifications', authenticate, authorize('candidate'), async (req, res) => {
    try {
        const { name, issuing_organization, issue_date, expiry_date, credential_id, credential_url } = req.body;

        const candidateResult = await db.query('SELECT id FROM candidate_profiles WHERE user_id = $1', [req.user.id]);
        const candidateId = candidateResult.rows[0].id;

        const result = await db.query(`
            INSERT INTO certifications (candidate_id, name, issuing_organization, issue_date, expiry_date, credential_id, credential_url)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [candidateId, name, issuing_organization, issue_date, expiry_date, credential_id, credential_url]);

        res.json(result.rows[0]);

    } catch (error) {
        console.error('Add certification error:', error);
        res.status(500).json({ error: 'Failed to add certification' });
    }
});

// Delete certification
router.delete('/certifications/:id', authenticate, authorize('candidate'), async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.query(`
            DELETE FROM certifications
            WHERE id = $1 AND candidate_id = (SELECT id FROM candidate_profiles WHERE user_id = $2)
            RETURNING id
        `, [id, req.user.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Certification not found' });
        }

        res.json({ message: 'Certification deleted successfully' });

    } catch (error) {
        console.error('Delete certification error:', error);
        res.status(500).json({ error: 'Failed to delete certification' });
    }
});

// Get candidate by ID (HR view)
router.get('/:id', authenticate, authorize('admin', 'hr_manager', 'recruiter'), async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.query(`
            SELECT cp.*,
                   u.email, u.status as account_status, u.last_login,
                   (SELECT json_agg(json_build_object('id', cs.id, 'name', s.name, 'category', s.category, 'proficiency', cs.proficiency_level, 'years', cs.years_of_experience))
                    FROM candidate_skills cs JOIN skills s ON cs.skill_id = s.id WHERE cs.candidate_id = cp.id) as skills,
                   (SELECT json_agg(json_build_object('id', e.id, 'institution', e.institution_name, 'degree', e.degree_type, 'field', e.field_of_study, 'start', e.start_date, 'end', e.end_date))
                    FROM education_records e WHERE e.candidate_id = cp.id) as education,
                   (SELECT json_agg(json_build_object('id', w.id, 'company', w.company_name, 'title', w.job_title, 'start', w.start_date, 'end', w.end_date, 'current', w.is_current, 'description', w.description) ORDER BY w.start_date DESC)
                    FROM work_experience w WHERE w.candidate_id = cp.id) as experience,
                   (SELECT json_agg(json_build_object('id', c.id, 'name', c.name, 'issuer', c.issuing_organization, 'date', c.issue_date, 'expiry', c.expiry_date))
                    FROM certifications c WHERE c.candidate_id = cp.id) as certifications,
                   (SELECT COUNT(*) FROM applications a WHERE a.candidate_id = cp.id) as total_applications
            FROM candidate_profiles cp
            JOIN users u ON cp.user_id = u.id
            WHERE cp.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Candidate not found' });
        }

        res.json(result.rows[0]);

    } catch (error) {
        console.error('Get candidate error:', error);
        res.status(500).json({ error: 'Failed to fetch candidate' });
    }
});

// Helper function
function calculateProfileCompleteness(profile) {
    let score = 0;
    let total = 10;

    if (profile.first_name && profile.last_name) score++;
    if (profile.phone) score++;
    if (profile.location) score++;
    if (profile.summary && profile.summary.length > 50) score++;
    if (profile.years_of_experience) score++;
    if (profile.current_job_title) score++;
    if (profile.linkedin_url) score++;
    if (profile.expected_salary_min) score++;
    if (profile.availability_date) score++;
    if (profile.profile_photo_url) score++;

    return Math.round((score / total) * 100);
}

module.exports = router;
