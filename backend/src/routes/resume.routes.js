const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { uploadResume, handleUploadError } = require('../middleware/upload.middleware');
const resumeParserService = require('../services/resumeParser.service');

// Upload and parse resume
router.post('/upload', authenticate, uploadResume, handleUploadError, async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        let ownerId = null;
        let ownerType = null;

        if (req.user.role === 'candidate') {
            const profile = await db.query('SELECT id FROM candidate_profiles WHERE user_id = $1', [req.user.id]);
            if (profile.rows.length === 0) {
                return res.status(400).json({ error: 'Profile not found' });
            }
            ownerId = profile.rows[0].id;
            ownerType = 'candidate';
        } else if (req.user.role === 'employee') {
            const profile = await db.query('SELECT id FROM employee_profiles WHERE user_id = $1', [req.user.id]);
            if (profile.rows.length === 0) {
                return res.status(400).json({ error: 'Profile not found' });
            }
            ownerId = profile.rows[0].id;
            ownerType = 'employee';
        }

        // Create resume record
        const resumeResult = await db.query(`
            INSERT INTO resumes (
                ${ownerType === 'candidate' ? 'candidate_id' : 'employee_id'},
                file_name, file_path, file_type, file_size, status
            )
            VALUES ($1, $2, $3, $4, $5, 'processing')
            RETURNING *
        `, [ownerId, req.file.originalname, `/uploads/resumes/${req.file.filename}`, req.file.mimetype, req.file.size]);

        const resume = resumeResult.rows[0];

        // Parse resume asynchronously
        resumeParserService.parseResume(req.file.path, req.file.mimetype)
            .then(async (parsedData) => {
                // Update resume with parsed data
                await db.query(`
                    UPDATE resumes SET
                        status = 'parsed',
                        raw_text = $1,
                        parsed_data = $2,
                        extracted_contact = $3,
                        extracted_summary = $4,
                        extracted_skills = $5,
                        extracted_experience = $6,
                        extracted_education = $7,
                        extracted_certifications = $8,
                        extracted_references = $9,
                        extracted_personal_info = $10,
                        extraction_confidence = $11,
                        ai_analysis = $12,
                        ai_improvement_suggestions = $13,
                        parsed_at = CURRENT_TIMESTAMP
                    WHERE id = $14
                `, [
                    parsedData.rawText,
                    JSON.stringify(parsedData),
                    JSON.stringify(parsedData.contact),
                    parsedData.summary,
                    JSON.stringify(parsedData.skills),
                    JSON.stringify(parsedData.experience),
                    JSON.stringify(parsedData.education),
                    JSON.stringify(parsedData.certifications),
                    JSON.stringify(parsedData.references),
                    JSON.stringify(parsedData.personalInfo),
                    parsedData.confidence,
                    JSON.stringify(parsedData.aiAnalysis),
                    parsedData.improvementSuggestions,
                    resume.id
                ]);

                // Auto-populate profile if requested
                if (req.body.auto_populate === 'true') {
                    await populateProfileFromResume(ownerId, ownerType, parsedData);
                }
            })
            .catch(async (error) => {
                console.error('Resume parsing error:', error);
                await db.query(`
                    UPDATE resumes SET status = 'failed', parsing_error = $1 WHERE id = $2
                `, [error.message, resume.id]);
            });

        res.status(201).json({
            message: 'Resume uploaded and processing started',
            resume: {
                id: resume.id,
                fileName: resume.file_name,
                status: 'processing'
            }
        });

    } catch (error) {
        console.error('Upload resume error:', error);
        res.status(500).json({ error: 'Failed to upload resume' });
    }
});

// Get resume parsing status
router.get('/:id/status', authenticate, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.query(`
            SELECT id, file_name, status, extraction_confidence, parsing_error, parsed_at
            FROM resumes WHERE id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Resume not found' });
        }

        res.json(result.rows[0]);

    } catch (error) {
        console.error('Get status error:', error);
        res.status(500).json({ error: 'Failed to get status' });
    }
});

// Reparse an existing resume
router.post('/:id/reparse', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const path = require('path');

        // Get the resume
        const result = await db.query(`
            SELECT * FROM resumes WHERE id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Resume not found' });
        }

        const resume = result.rows[0];

        // Verify ownership
        if (req.user.role === 'candidate') {
            const profile = await db.query('SELECT id FROM candidate_profiles WHERE user_id = $1', [req.user.id]);
            if (profile.rows[0]?.id !== resume.candidate_id) {
                return res.status(403).json({ error: 'Access denied' });
            }
        }

        // Update status to processing
        await db.query(`UPDATE resumes SET status = 'processing' WHERE id = $1`, [id]);

        // Get full file path - file_path is relative like /uploads/resumes/file.pdf
        const filePath = path.join(__dirname, '../..', resume.file_path);

        // Reparse the resume
        resumeParserService.parseResume(filePath, resume.file_type)
            .then(async (parsedData) => {
                await db.query(`
                    UPDATE resumes SET
                        status = 'parsed',
                        raw_text = $1,
                        parsed_data = $2,
                        extracted_contact = $3,
                        extracted_summary = $4,
                        extracted_skills = $5,
                        extracted_experience = $6,
                        extracted_education = $7,
                        extracted_certifications = $8,
                        extracted_references = $9,
                        extracted_personal_info = $10,
                        extraction_confidence = $11,
                        parsed_at = CURRENT_TIMESTAMP
                    WHERE id = $12
                `, [
                    parsedData.rawText,
                    JSON.stringify(parsedData),
                    JSON.stringify(parsedData.contact),
                    parsedData.summary,
                    JSON.stringify(parsedData.skills),
                    JSON.stringify(parsedData.experience),
                    JSON.stringify(parsedData.education),
                    JSON.stringify(parsedData.certifications),
                    JSON.stringify(parsedData.references),
                    JSON.stringify(parsedData.personalInfo),
                    parsedData.confidence,
                    id
                ]);
            })
            .catch(async (error) => {
                console.error('Reparse error:', error);
                await db.query(`
                    UPDATE resumes SET status = 'failed', parsing_error = $1 WHERE id = $2
                `, [error.message, id]);
            });

        res.json({ message: 'Reparsing started', resumeId: id });

    } catch (error) {
        console.error('Reparse resume error:', error);
        res.status(500).json({ error: 'Failed to reparse resume' });
    }
});

// Get parsed resume data
router.get('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.query(`
            SELECT * FROM resumes WHERE id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Resume not found' });
        }

        const resume = result.rows[0];

        // Verify ownership
        if (req.user.role === 'candidate') {
            const profile = await db.query('SELECT id FROM candidate_profiles WHERE user_id = $1', [req.user.id]);
            if (profile.rows[0].id !== resume.candidate_id) {
                return res.status(403).json({ error: 'Access denied' });
            }
        } else if (req.user.role === 'employee') {
            const profile = await db.query('SELECT id FROM employee_profiles WHERE user_id = $1', [req.user.id]);
            if (profile.rows[0].id !== resume.employee_id) {
                return res.status(403).json({ error: 'Access denied' });
            }
        }

        res.json(resume);

    } catch (error) {
        console.error('Get resume error:', error);
        res.status(500).json({ error: 'Failed to get resume' });
    }
});

// Get my resumes
router.get('/', authenticate, async (req, res) => {
    try {
        let ownerId = null;
        let ownerType = null;

        if (req.user.role === 'candidate') {
            const profile = await db.query('SELECT id FROM candidate_profiles WHERE user_id = $1', [req.user.id]);
            ownerId = profile.rows[0]?.id;
            ownerType = 'candidate';
        } else if (req.user.role === 'employee') {
            const profile = await db.query('SELECT id FROM employee_profiles WHERE user_id = $1', [req.user.id]);
            ownerId = profile.rows[0]?.id;
            ownerType = 'employee';
        }

        if (!ownerId) {
            return res.json([]);
        }

        const result = await db.query(`
            SELECT id, file_name, file_path, file_type, file_size, status, is_primary, 
                   extraction_confidence, parsing_error, raw_text,
                   extracted_contact, extracted_summary, extracted_skills, 
                   extracted_experience, extracted_education, extracted_certifications,
                   extracted_references, extracted_personal_info,
                   created_at, parsed_at
            FROM resumes
            WHERE ${ownerType === 'candidate' ? 'candidate_id' : 'employee_id'} = $1
            ORDER BY created_at DESC
        `, [ownerId]);

        res.json(result.rows);

    } catch (error) {
        console.error('Get resumes error:', error);
        res.status(500).json({ error: 'Failed to get resumes' });
    }
});

// Set primary resume
router.post('/:id/set-primary', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        let ownerField, ownerId;

        if (req.user.role === 'candidate') {
            const profile = await db.query('SELECT id FROM candidate_profiles WHERE user_id = $1', [req.user.id]);
            ownerField = 'candidate_id';
            ownerId = profile.rows[0].id;
        } else if (req.user.role === 'employee') {
            const profile = await db.query('SELECT id FROM employee_profiles WHERE user_id = $1', [req.user.id]);
            ownerField = 'employee_id';
            ownerId = profile.rows[0].id;
        }

        // Reset all to non-primary
        await db.query(`UPDATE resumes SET is_primary = false WHERE ${ownerField} = $1`, [ownerId]);

        // Set selected as primary
        const result = await db.query(`
            UPDATE resumes SET is_primary = true
            WHERE id = $1 AND ${ownerField} = $2
            RETURNING *
        `, [id, ownerId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Resume not found' });
        }

        res.json({ message: 'Primary resume updated', resume: result.rows[0] });

    } catch (error) {
        console.error('Set primary error:', error);
        res.status(500).json({ error: 'Failed to set primary resume' });
    }
});

// Delete resume
router.delete('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        let ownerField, ownerId;

        if (req.user.role === 'candidate') {
            const profile = await db.query('SELECT id FROM candidate_profiles WHERE user_id = $1', [req.user.id]);
            ownerField = 'candidate_id';
            ownerId = profile.rows[0].id;
        } else if (req.user.role === 'employee') {
            const profile = await db.query('SELECT id FROM employee_profiles WHERE user_id = $1', [req.user.id]);
            ownerField = 'employee_id';
            ownerId = profile.rows[0].id;
        }

        const result = await db.query(`
            DELETE FROM resumes WHERE id = $1 AND ${ownerField} = $2 RETURNING id
        `, [id, ownerId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Resume not found' });
        }

        res.json({ message: 'Resume deleted successfully' });

    } catch (error) {
        console.error('Delete resume error:', error);
        res.status(500).json({ error: 'Failed to delete resume' });
    }
});

// Update parsed/extracted data (editable by owner)
router.put('/:id/parsed-data', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            extracted_contact,
            extracted_personal_info,
            extracted_summary,
            extracted_skills,
            extracted_experience,
            extracted_education,
            extracted_certifications,
            extracted_references
        } = req.body;

        // Verify ownership
        let ownerField, ownerId;
        if (req.user.role === 'candidate') {
            const profile = await db.query('SELECT id FROM candidate_profiles WHERE user_id = $1', [req.user.id]);
            if (profile.rows.length === 0) return res.status(403).json({ error: 'Access denied' });
            ownerField = 'candidate_id';
            ownerId = profile.rows[0].id;
        } else if (req.user.role === 'employee') {
            const profile = await db.query('SELECT id FROM employee_profiles WHERE user_id = $1', [req.user.id]);
            if (profile.rows.length === 0) return res.status(403).json({ error: 'Access denied' });
            ownerField = 'employee_id';
            ownerId = profile.rows[0].id;
        } else {
            return res.status(403).json({ error: 'Access denied' });
        }

        const result = await db.query(`
            UPDATE resumes SET
                extracted_contact = COALESCE($1, extracted_contact),
                extracted_personal_info = COALESCE($2, extracted_personal_info),
                extracted_summary = COALESCE($3, extracted_summary),
                extracted_skills = COALESCE($4, extracted_skills),
                extracted_experience = COALESCE($5, extracted_experience),
                extracted_education = COALESCE($6, extracted_education),
                extracted_certifications = COALESCE($7, extracted_certifications),
                extracted_references = COALESCE($8, extracted_references),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $9 AND ${ownerField} = $10
            RETURNING id
        `, [
            extracted_contact ? JSON.stringify(extracted_contact) : null,
            extracted_personal_info ? JSON.stringify(extracted_personal_info) : null,
            extracted_summary ? JSON.stringify(extracted_summary) : null,
            extracted_skills ? JSON.stringify(extracted_skills) : null,
            extracted_experience ? JSON.stringify(extracted_experience) : null,
            extracted_education ? JSON.stringify(extracted_education) : null,
            extracted_certifications ? JSON.stringify(extracted_certifications) : null,
            extracted_references ? JSON.stringify(extracted_references) : null,
            id,
            ownerId
        ]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Resume not found' });
        }

        res.json({ message: 'Parsed data updated successfully' });
    } catch (error) {
        console.error('Update parsed data error:', error);
        res.status(500).json({ error: 'Failed to update parsed data' });
    }
});

// Apply parsed data to profile
router.post('/:id/apply-to-profile', authenticate, async (req, res) => {
    try {
        const { id } = req.params;

        const resumeResult = await db.query('SELECT * FROM resumes WHERE id = $1', [id]);
        if (resumeResult.rows.length === 0) {
            return res.status(404).json({ error: 'Resume not found' });
        }

        const resume = resumeResult.rows[0];
        if (resume.status !== 'parsed') {
            return res.status(400).json({ error: 'Resume has not been parsed yet' });
        }

        const parsedData = resume.parsed_data;
        let ownerId, ownerType;

        if (req.user.role === 'candidate' && resume.candidate_id) {
            const profile = await db.query('SELECT id FROM candidate_profiles WHERE user_id = $1', [req.user.id]);
            if (profile.rows[0].id !== resume.candidate_id) {
                return res.status(403).json({ error: 'Access denied' });
            }
            ownerId = resume.candidate_id;
            ownerType = 'candidate';
        } else if (req.user.role === 'employee' && resume.employee_id) {
            const profile = await db.query('SELECT id FROM employee_profiles WHERE user_id = $1', [req.user.id]);
            if (profile.rows[0].id !== resume.employee_id) {
                return res.status(403).json({ error: 'Access denied' });
            }
            ownerId = resume.employee_id;
            ownerType = 'employee';
        } else {
            return res.status(403).json({ error: 'Access denied' });
        }

        await populateProfileFromResume(ownerId, ownerType, parsedData);

        res.json({ message: 'Profile updated from resume data' });

    } catch (error) {
        console.error('Apply to profile error:', error);
        res.status(500).json({ error: 'Failed to apply resume data' });
    }
});

// Helper function to populate profile from parsed resume
async function populateProfileFromResume(ownerId, ownerType, parsedData) {
    const client = await db.getClient();
    
    try {
        await client.query('BEGIN');

        // Update profile with contact info and summary
        if (ownerType === 'candidate') {
            await client.query(`
                UPDATE candidate_profiles SET
                    phone = COALESCE($1, phone),
                    location = COALESCE($2, location),
                    linkedin_url = COALESCE($3, linkedin_url),
                    summary = COALESCE($4, summary),
                    years_of_experience = COALESCE($5, years_of_experience),
                    ai_profile_summary = $6,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $7
            `, [
                parsedData.contact?.phone,
                parsedData.contact?.location,
                parsedData.contact?.linkedin,
                parsedData.summary,
                parsedData.totalExperience,
                parsedData.aiAnalysis?.profileSummary,
                ownerId
            ]);

            // Add skills - handle both string array and object array formats
            if (parsedData.skills && Array.isArray(parsedData.skills)) {
                for (const rawSkill of parsedData.skills) {
                    // Handle both string format and object format
                    const skillName = typeof rawSkill === 'string' ? rawSkill : rawSkill.name;
                    if (!skillName) continue;
                    
                    let skillResult = await client.query(
                        'SELECT id FROM skills WHERE normalized_name = $1',
                        [skillName.toLowerCase().replace(/[^a-z0-9]/g, '_')]
                    );

                    let skillId;
                    if (skillResult.rows.length === 0) {
                        const newSkill = await client.query(`
                            INSERT INTO skills (name, normalized_name, category)
                            VALUES ($1, $2, $3)
                            RETURNING id
                        `, [skillName, skillName.toLowerCase().replace(/[^a-z0-9]/g, '_'), rawSkill.category || 'technical']);
                        skillId = newSkill.rows[0].id;
                    } else {
                        skillId = skillResult.rows[0].id;
                    }

                    const proficiency = typeof rawSkill === 'object' ? rawSkill.proficiency : 'intermediate';
                    const years = typeof rawSkill === 'object' ? rawSkill.years : null;
                    const aiLevel = typeof rawSkill === 'object' ? rawSkill.aiLevel : null;
                    const confidence = typeof rawSkill === 'object' ? rawSkill.confidence : null;

                    await client.query(`
                        INSERT INTO candidate_skills (candidate_id, skill_id, proficiency_level, years_of_experience, ai_assessed_level, ai_confidence_score)
                        VALUES ($1, $2, $3, $4, $5, $6)
                        ON CONFLICT (candidate_id, skill_id) DO UPDATE SET
                            ai_assessed_level = COALESCE($5, candidate_skills.ai_assessed_level), 
                            ai_confidence_score = COALESCE($6, candidate_skills.ai_confidence_score)
                    `, [ownerId, skillId, proficiency, years, aiLevel, confidence]);
                }
            }

            // Add education - handle OpenAI format (degree, field, institution, year)
            if (parsedData.education && Array.isArray(parsedData.education)) {
                for (const edu of parsedData.education) {
                    const degreeType = edu.degreeType || edu.degree || null;
                    const field = edu.field || edu.fieldOfStudy || null;
                    const institution = edu.institution || edu.institutionName || null;
                    // Handle year-only format from OpenAI
                    const startDate = edu.startDate || null;
                    const endDate = edu.endDate || edu.year || null;
                    
                    if (institution || degreeType) {
                        await client.query(`
                            INSERT INTO education_records (candidate_id, institution_name, degree_type, field_of_study, start_date, end_date, ai_verified)
                            VALUES ($1, $2, $3, $4, $5, $6, true)
                            ON CONFLICT DO NOTHING
                        `, [ownerId, institution, degreeType, field, startDate, endDate]);
                    }
                }
            }

            // Add work experience - handle OpenAI format (title, company, startDate, endDate)
            if (parsedData.experience && Array.isArray(parsedData.experience)) {
                for (const exp of parsedData.experience) {
                    const company = exp.company || exp.companyName || null;
                    const title = exp.title || exp.jobTitle || null;
                    const location = exp.location || null;
                    const startDate = exp.startDate || null;
                    const endDate = exp.endDate || null;
                    const isCurrent = exp.isCurrent || (endDate && endDate.toLowerCase() === 'present') || false;
                    const description = exp.description || exp.highlights?.join('. ') || null;
                    const skills = exp.skills || [];
                    
                    if (company || title) {
                        await client.query(`
                            INSERT INTO work_experience (candidate_id, company_name, job_title, location, start_date, end_date, is_current, description, ai_extracted_skills)
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                            ON CONFLICT DO NOTHING
                        `, [ownerId, company, title, location, startDate, endDate, isCurrent, description, JSON.stringify(skills)]);
                    }
                }
            }

            // Add certifications - handle OpenAI format (name, issuer, date)
            if (parsedData.certifications && Array.isArray(parsedData.certifications)) {
                for (const cert of parsedData.certifications) {
                    const name = cert.name || null;
                    const issuer = cert.issuer || cert.issuingOrganization || null;
                    const date = cert.date || cert.issueDate || null;
                    
                    if (name) {
                        await client.query(`
                            INSERT INTO certifications (candidate_id, name, issuing_organization, issue_date, ai_verified)
                            VALUES ($1, $2, $3, $4, true)
                            ON CONFLICT DO NOTHING
                        `, [ownerId, name, issuer, date]);
                    }
                }
            }
        }

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

module.exports = router;
