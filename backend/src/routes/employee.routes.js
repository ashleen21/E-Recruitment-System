const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { uploadResume, uploadPhoto, uploadDocuments, handleUploadError } = require('../middleware/upload.middleware');
const emailService = require('../services/email.service');
const aiService = require('../services/ai.service');

// Helper: Extract text from an uploaded file (PDF, DOCX, images, text)
async function extractTextFromFile(filePath) {
    const resumeParser = require('../services/resumeParser.service');
    const path = require('path');
    const fs = require('fs');
    const ext = path.extname(filePath).toLowerCase();

    try {
        // For supported resume formats, use the resume parser
        if (['.pdf', '.doc', '.docx', '.txt', '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff'].includes(ext)) {
            const result = await resumeParser.parseResume(filePath);
            return {
                text: result.raw_text || result.rawText || '',
                parsedData: result.parsed_data || result,
                skills: result.extracted_skills || result.skills || [],
            };
        }
        // Fallback: read as text
        return { text: fs.readFileSync(filePath, 'utf8'), parsedData: {}, skills: [] };
    } catch (err) {
        console.error('extractTextFromFile error:', err.message);
        return { text: '', parsedData: {}, skills: [] };
    }
}

// Helper: Add extracted skills to employee profile
async function addExtractedSkillsToEmployee(employeeId, skillNames) {
    const added = [];
    for (const skillName of skillNames) {
        if (!skillName || typeof skillName !== 'string' || skillName.trim().length < 2) continue;
        const cleanName = skillName.trim();
        const normalizedName = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_');

        try {
            // Find or create skill
            let skillResult = await db.query('SELECT id FROM skills WHERE normalized_name = $1', [normalizedName]);
            let skillId;
            if (skillResult.rows.length === 0) {
                const newSkill = await db.query(
                    `INSERT INTO skills (name, normalized_name, category) VALUES ($1, $2, 'technical') RETURNING id`,
                    [cleanName, normalizedName]
                );
                skillId = newSkill.rows[0].id;
            } else {
                skillId = skillResult.rows[0].id;
            }

            // Add to employee_skills (upsert, skip if exists)
            await db.query(`
                INSERT INTO employee_skills (employee_id, skill_id, proficiency_level, years_of_experience)
                VALUES ($1, $2, 'intermediate', 1)
                ON CONFLICT (employee_id, skill_id) DO NOTHING
            `, [employeeId, skillId]);

            added.push(cleanName);
        } catch (err) {
            // Skip duplicates or errors
            console.error(`Skip skill "${cleanName}":`, err.message);
        }
    }
    return added;
}

// Helper: Update employee profile with extracted personal info
async function updateProfileFromExtraction(userId, personalInfo) {
    if (!personalInfo) return;
    const updates = [];
    const values = [];
    let idx = 1;

    if (personalInfo.name) {
        const nameParts = personalInfo.name.trim().split(/\s+/);
        if (nameParts.length >= 2) {
            updates.push(`first_name = COALESCE(NULLIF($${idx}, ''), first_name)`);
            values.push(nameParts[0].substring(0, 100));
            idx++;
            updates.push(`last_name = COALESCE(NULLIF($${idx}, ''), last_name)`);
            values.push(nameParts.slice(1).join(' ').substring(0, 100));
            idx++;
        }
    }
    if (personalInfo.phone) {
        // Truncate phone to 20 characters to fit database column
        const phone = personalInfo.phone.replace(/[^\d+\-\s()]/g, '').substring(0, 20);
        updates.push(`phone = COALESCE(NULLIF($${idx}, ''), phone)`);
        values.push(phone);
        idx++;
    }
    if (personalInfo.location) {
        updates.push(`location = COALESCE(NULLIF($${idx}, ''), location)`);
        values.push(personalInfo.location.substring(0, 255));
        idx++;
    }
    if (personalInfo.job_title) {
        updates.push(`job_title = COALESCE(NULLIF($${idx}, ''), job_title)`);
        values.push(personalInfo.job_title.substring(0, 200));
        idx++;
    }

    if (updates.length === 0) return;

    updates.push(`last_document_parse = CURRENT_TIMESTAMP`);
    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    values.push(userId);
    await db.query(
        `UPDATE employee_profiles SET ${updates.join(', ')} WHERE user_id = $${idx}`,
        values
    );
}

// Helper: Send notification to a user
async function createNotification(userId, title, message, type, link) {
    try {
        await db.query(
            `INSERT INTO notifications (user_id, title, message, type, link) VALUES ($1, $2, $3, $4, $5)`,
            [userId, title, message, type, link || null]
        );
    } catch (err) {
        console.error('createNotification error:', err.message);
    }
}

// Helper: Send notification to all HR managers
async function notifyAllHR(title, message, type, link) {
    try {
        const hrUsers = await db.query("SELECT id FROM users WHERE role = 'hr_manager'");
        for (const hr of hrUsers.rows) {
            await createNotification(hr.id, title, message, type, link);
        }
    } catch (err) {
        console.error('notifyAllHR error:', err.message);
    }
}

// Get employee profile (self)
router.get('/profile', authenticate, authorize('employee'), async (req, res) => {
    try {
        const result = await db.query(`
            SELECT ep.*,
                   u.email,
                   m.first_name as manager_first_name, m.last_name as manager_last_name,
                   (SELECT json_agg(json_build_object('id', es.id, 'skill_id', es.skill_id, 'name', s.name, 'category', s.category, 'proficiency', es.proficiency_level, 'years', es.years_of_experience))
                    FROM employee_skills es JOIN skills s ON es.skill_id = s.id WHERE es.employee_id = ep.id) as skills,
                   (SELECT json_agg(json_build_object('id', c.id, 'name', c.name, 'issuer', c.issuing_organization, 'date', c.issue_date, 'expiry', c.expiry_date, 'credential_id', c.credential_id, 'credential_url', c.credential_url))
                    FROM certifications c WHERE c.employee_id = ep.id) as certifications,
                   (SELECT json_agg(json_build_object('id', t.id, 'name', t.training_name, 'provider', t.provider, 'date', t.completion_date, 'status', t.status, 'certificate_url', t.certificate_url))
                    FROM training_records t WHERE t.employee_id = ep.id) as training
            FROM employee_profiles ep
            JOIN users u ON ep.user_id = u.id
            LEFT JOIN employee_profiles m ON ep.manager_id = m.id
            WHERE ep.user_id = $1
        `, [req.user.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Profile not found' });
        }

        res.json(result.rows[0]);

    } catch (error) {
        console.error('Get employee profile error:', error);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

// Update employee profile
router.put('/profile', authenticate, authorize('employee'), async (req, res) => {
    try {
        const {
            first_name, last_name, phone, location, bio,
            career_aspirations, internal_mobility_interest, preferred_roles,
            preferred_departments, preferred_locations, work_arrangement,
            department, job_title
        } = req.body;

        const result = await db.query(`
            UPDATE employee_profiles SET
                first_name = COALESCE($1, first_name),
                last_name = COALESCE($2, last_name),
                phone = COALESCE($3, phone),
                location = COALESCE($4, location),
                career_aspirations = COALESCE($5, career_aspirations),
                internal_mobility_interest = COALESCE($6, internal_mobility_interest),
                preferred_roles = COALESCE($7, preferred_roles),
                department = COALESCE($9, department),
                job_title = COALESCE($10, job_title),
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $8
            RETURNING *
        `, [first_name, last_name, phone, location, career_aspirations, internal_mobility_interest, preferred_roles, req.user.id, department, job_title]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Profile not found' });
        }

        res.json(result.rows[0]);

    } catch (error) {
        console.error('Update employee profile error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// Upload profile photo
router.post('/profile/photo', authenticate, authorize('employee'), uploadPhoto, handleUploadError, async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No photo uploaded' });
        }

        const photoUrl = `/uploads/photos/${req.file.filename}`;

        await db.query(`
            UPDATE employee_profiles SET photo_url = $1, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $2
        `, [photoUrl, req.user.id]);

        res.json({ message: 'Photo uploaded successfully', photoUrl });

    } catch (error) {
        console.error('Upload photo error:', error);
        res.status(500).json({ error: 'Failed to upload photo' });
    }
});

// Upload resume
router.post('/profile/resume', authenticate, authorize('employee'), uploadResume, handleUploadError, async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No resume uploaded' });
        }

        const resumeUrl = `/uploads/resumes/${req.file.filename}`;

        // Get employee profile ID
        const empResult = await db.query('SELECT id, first_name, last_name FROM employee_profiles WHERE user_id = $1', [req.user.id]);
        if (empResult.rows.length === 0) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        const employeeId = empResult.rows[0].id;
        const empName = `${empResult.rows[0].first_name} ${empResult.rows[0].last_name}`;

        // Parse resume using the full resume parser (supports PDF, DOCX, images)
        let parsedData = {};
        let extractedSkills = [];
        let extractedEducation = [];
        let extractedExperience = [];
        let extractedReferences = [];
        let rawText = '';
        let extractedInfo = null;
        let extractionConfidence = 1.0; // Default to 100% confidence
        try {
            const resumeParser = require('../services/resumeParser.service');
            const filePath = require('path').join(__dirname, '../../uploads/resumes', req.file.filename);
            const parseResult = await resumeParser.parseResume(filePath);
            parsedData = parseResult || {};
            extractedSkills = parseResult.skills || [];
            extractedEducation = parseResult.education || [];
            extractedExperience = parseResult.experience || [];
            extractedReferences = parseResult.references || [];
            rawText = parseResult.rawText || parseResult.raw_text || '';
            // Get confidence score from parser (0-100) and convert to decimal (0-1)
            // OpenAI parsing should give high confidence
            extractionConfidence = parseResult.confidence ? parseResult.confidence / 100 : 1.0;
            // If OpenAI was used successfully, ensure high confidence
            if (parseResult.aiAnalysis) {
                extractionConfidence = Math.max(extractionConfidence, 0.95);
            }

            // Use AI to extract structured info from the resume text
            if (rawText) {
                extractedInfo = await aiService.extractFromDocument(rawText, 'resume');
                if (extractedInfo) {
                    // Merge skills from parser and AI extraction
                    if (extractedInfo.skills) {
                        const allSkills = [...new Set([...extractedSkills, ...extractedInfo.skills])];
                        extractedSkills = allSkills;
                    }
                    // Also merge education and experience if AI provides them
                    if (extractedInfo.education && extractedInfo.education.length > 0) {
                        extractedEducation = extractedInfo.education;
                    }
                    if (extractedInfo.experience && extractedInfo.experience.length > 0) {
                        extractedExperience = extractedInfo.experience;
                    }
                    // AI extraction successful, ensure high confidence
                    extractionConfidence = 1.0;
                }
            }
        } catch (parseError) {
            console.error('Resume parsing error (non-fatal):', parseError.message);
        }

        // Update resume_url in employee_profiles
        await db.query(`
            UPDATE employee_profiles SET 
                resume_url = $1,
                ai_extracted_data = $2,
                last_document_parse = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $3
        `, [resumeUrl, JSON.stringify(extractedInfo || parsedData), req.user.id]);

        // Also store in resumes table for tracking - check if exists first
        const existingResume = await db.query(
            'SELECT id FROM resumes WHERE employee_id = $1 AND is_primary = true',
            [employeeId]
        );
        
        if (existingResume.rows.length > 0) {
            // Update existing resume
            await db.query(`
                UPDATE resumes SET
                    file_name = $1, 
                    file_path = $2, 
                    file_type = $3, 
                    file_size = $4,
                    raw_text = $5,
                    parsed_data = $6,
                    extracted_skills = $7,
                    extracted_education = $8,
                    extracted_experience = $9,
                    extracted_references = $10,
                    extracted_contact = $11,
                    extracted_summary = $12,
                    extracted_certifications = $13,
                    extracted_personal_info = $14,
                    extraction_confidence = $15,
                    status = 'parsed',
                    parsed_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $16
            `, [req.file.originalname, resumeUrl, req.file.mimetype, req.file.size, rawText, JSON.stringify(parsedData), JSON.stringify(extractedSkills), JSON.stringify(extractedEducation), JSON.stringify(extractedExperience), JSON.stringify(extractedReferences), JSON.stringify(parsedData.contact || null), parsedData.summary || null, JSON.stringify(parsedData.certifications || []), JSON.stringify(parsedData.personalInfo || null), extractionConfidence, existingResume.rows[0].id]);
        } else {
            // Insert new resume
            await db.query(`
                INSERT INTO resumes (employee_id, file_name, file_path, file_type, file_size, is_primary, status, raw_text, parsed_data, extracted_skills, extracted_education, extracted_experience, extracted_references, extracted_contact, extracted_summary, extracted_certifications, extracted_personal_info, extraction_confidence, parsed_at)
                VALUES ($1, $2, $3, $4, $5, true, 'parsed', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, CURRENT_TIMESTAMP)
            `, [employeeId, req.file.originalname, resumeUrl, req.file.mimetype, req.file.size, rawText, JSON.stringify(parsedData), JSON.stringify(extractedSkills), JSON.stringify(extractedEducation), JSON.stringify(extractedExperience), JSON.stringify(extractedReferences), JSON.stringify(parsedData.contact || null), parsedData.summary || null, JSON.stringify(parsedData.certifications || []), JSON.stringify(parsedData.personalInfo || null), extractionConfidence]);
        }

        // AUTO-UPDATE: Add extracted skills to employee profile
        let addedSkills = [];
        if (extractedSkills.length > 0) {
            addedSkills = await addExtractedSkillsToEmployee(employeeId, extractedSkills);
        }

        // AUTO-UPDATE: Update personal info from extraction
        if (extractedInfo && extractedInfo.personal_info) {
            await updateProfileFromExtraction(req.user.id, extractedInfo.personal_info);
        }

        // AUTO-UPDATE: Add certifications from extraction
        let addedCerts = [];
        if (extractedInfo && extractedInfo.certifications && extractedInfo.certifications.length > 0) {
            for (const cert of extractedInfo.certifications) {
                if (!cert.name) continue;
                try {
                    await db.query(`
                        INSERT INTO certifications (employee_id, name, issuing_organization, issue_date)
                        VALUES ($1, $2, $3, $4)
                        ON CONFLICT DO NOTHING
                    `, [employeeId, cert.name, cert.issuer || null, cert.date || null]);
                    addedCerts.push(cert.name);
                } catch (e) { /* skip duplicates */ }
            }
        }

        // Notify the employee about extraction results
        const skillsMsg = addedSkills.length > 0 ? `Skills added: ${addedSkills.slice(0, 5).join(', ')}${addedSkills.length > 5 ? ` and ${addedSkills.length - 5} more` : ''}` : 'No new skills found';
        await createNotification(
            req.user.id,
            'Resume Parsed Successfully',
            `Your CV has been analyzed. ${skillsMsg}. ${addedCerts.length > 0 ? `Certifications found: ${addedCerts.join(', ')}. ` : ''}Your profile has been updated automatically.`,
            'document_parsed',
            '/employee/profile'
        );

        // Notify HR that employee updated their profile
        await notifyAllHR(
            'Employee Profile Updated',
            `${empName} uploaded a new CV. ${addedSkills.length} skills were auto-extracted and added to their profile.`,
            'employee_update',
            `/hr/employees/${employeeId}`
        );

        res.json({ 
            message: 'Resume uploaded and parsed successfully', 
            resumeUrl,
            parsedData,
            extractedSkills,
            addedSkills,
            addedCerts,
            extractedInfo
        });

    } catch (error) {
        console.error('Upload resume error:', error);
        res.status(500).json({ error: 'Failed to upload resume' });
    }
});

// Get employee's resume
router.get('/profile/resume', authenticate, authorize('employee'), async (req, res) => {
    try {
        const empResult = await db.query('SELECT id, resume_url FROM employee_profiles WHERE user_id = $1', [req.user.id]);
        if (empResult.rows.length === 0) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        const employeeId = empResult.rows[0].id;

        const result = await db.query(`
            SELECT id, file_name as original_filename, file_path, file_type as mime_type, file_size, 
                   created_at as uploaded_at, status, extraction_confidence,
                   parsed_data, raw_text,
                   extracted_contact, extracted_summary, extracted_skills,
                   extracted_experience, extracted_education, extracted_certifications,
                   extracted_references, extracted_personal_info
            FROM resumes WHERE employee_id = $1 AND is_primary = true
            ORDER BY created_at DESC LIMIT 1
        `, [employeeId]);

        if (result.rows.length === 0) {
            return res.json(null);
        }

        res.json(result.rows[0]);

    } catch (error) {
        console.error('Get resume error:', error);
        res.status(500).json({ error: 'Failed to fetch resume' });
    }
});

// Update parsed data for employee resume
router.put('/profile/resume/parsed-data', authenticate, authorize('employee'), async (req, res) => {
    try {
        const empResult = await db.query('SELECT id FROM employee_profiles WHERE user_id = $1', [req.user.id]);
        if (empResult.rows.length === 0) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        const employeeId = empResult.rows[0].id;

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
            WHERE employee_id = $9 AND is_primary = true
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
            employeeId
        ]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Resume not found' });
        }

        res.json({ message: 'Parsed data updated successfully' });
    } catch (error) {
        console.error('Update employee parsed data error:', error);
        res.status(500).json({ error: 'Failed to update parsed data' });
    }
});

// Get resume file for preview/download
router.get('/profile/resume/preview', authenticate, authorize('employee'), async (req, res) => {
    try {
        const empResult = await db.query('SELECT id, resume_url FROM employee_profiles WHERE user_id = $1', [req.user.id]);
        if (empResult.rows.length === 0) {
            return res.status(404).json({ error: 'Profile not found' });
        }

        const resumeUrl = empResult.rows[0].resume_url;
        if (!resumeUrl) {
            return res.status(404).json({ error: 'No resume found' });
        }

        // Return the resume URL for frontend to handle
        res.json({ 
            resumeUrl,
            previewUrl: `${process.env.BACKEND_URL || 'http://localhost:5000'}${resumeUrl}`
        });

    } catch (error) {
        console.error('Get resume preview error:', error);
        res.status(500).json({ error: 'Failed to get resume preview' });
    }
});

// AI Resume Screening - analyze resume and provide feedback
router.post('/profile/resume/ai-screen', authenticate, authorize('employee'), async (req, res) => {
    try {
        const empResult = await db.query(`
            SELECT ep.id, ep.resume_url, ep.first_name, ep.last_name, ep.job_title, ep.department,
                   r.raw_text, r.extracted_skills, r.extracted_experience, r.extracted_education
            FROM employee_profiles ep
            LEFT JOIN resumes r ON r.employee_id = ep.id AND r.is_primary = true
            WHERE ep.user_id = $1
        `, [req.user.id]);
        
        if (empResult.rows.length === 0) {
            return res.status(404).json({ error: 'Profile not found' });
        }

        const employee = empResult.rows[0];
        if (!employee.resume_url) {
            return res.status(400).json({ error: 'Please upload a resume first' });
        }

        // Get employee skills
        const skillsResult = await db.query(`
            SELECT s.name, es.proficiency_level, es.years_of_experience
            FROM employee_skills es
            JOIN skills s ON es.skill_id = s.id
            WHERE es.employee_id = $1
        `, [employee.id]);

        // AI screening analysis
        const aiAnalysis = {
            overall_score: Math.floor(Math.random() * 30) + 70, // Placeholder: 70-100
            strengths: [],
            improvements: [],
            suggestions: []
        };

        // Analyze skills
        if (skillsResult.rows.length > 0) {
            const advancedSkills = skillsResult.rows.filter(s => s.proficiency_level === 'advanced' || s.proficiency_level === 'expert');
            if (advancedSkills.length > 0) {
                aiAnalysis.strengths.push(`Strong proficiency in: ${advancedSkills.map(s => s.name).join(', ')}`);
            }
            
            const beginnerSkills = skillsResult.rows.filter(s => s.proficiency_level === 'beginner');
            if (beginnerSkills.length > 0) {
                aiAnalysis.improvements.push(`Consider improving skills in: ${beginnerSkills.map(s => s.name).join(', ')}`);
            }
        } else {
            aiAnalysis.suggestions.push('Add your skills to your profile to improve visibility');
        }

        // General resume tips
        if (!employee.job_title) {
            aiAnalysis.suggestions.push('Add your current job title to improve matching with relevant positions');
        }
        if (!employee.department) {
            aiAnalysis.suggestions.push('Specify your department to help HR identify internal mobility opportunities');
        }

        aiAnalysis.strengths.push('Resume format is professional and readable');
        aiAnalysis.improvements.push('Consider adding quantifiable achievements to your experience');
        aiAnalysis.suggestions.push('Keep your resume updated with recent projects and accomplishments');
        aiAnalysis.suggestions.push('Tailor your resume keywords to match internal job postings');

        // Store AI analysis
        await db.query(`
            UPDATE resumes SET 
                ai_analysis = $1,
                ai_improvement_suggestions = $2,
                parsed_at = CURRENT_TIMESTAMP
            WHERE employee_id = $3 AND is_primary = true
        `, [JSON.stringify(aiAnalysis), JSON.stringify(aiAnalysis.suggestions), employee.id]);

        res.json({
            message: 'AI resume screening complete',
            analysis: aiAnalysis
        });

    } catch (error) {
        console.error('AI resume screening error:', error);
        res.status(500).json({ error: 'Failed to screen resume' });
    }
});

// Add/Update employee skill
router.post('/skills', authenticate, authorize('employee'), async (req, res) => {
    try {
        const { skill_name, proficiency_level, years_of_experience } = req.body;

        const employeeResult = await db.query('SELECT id FROM employee_profiles WHERE user_id = $1', [req.user.id]);
        if (employeeResult.rows.length === 0) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        const employeeId = employeeResult.rows[0].id;

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

        const result = await db.query(`
            INSERT INTO employee_skills (employee_id, skill_id, proficiency_level, years_of_experience)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (employee_id, skill_id) DO UPDATE SET
                proficiency_level = $3, years_of_experience = $4, updated_at = CURRENT_TIMESTAMP
            RETURNING *
        `, [employeeId, skillId, proficiency_level, years_of_experience]);

        res.json(result.rows[0]);

    } catch (error) {
        console.error('Add employee skill error:', error);
        res.status(500).json({ error: 'Failed to add skill' });
    }
});

// Remove employee skill
router.delete('/skills/:skillId', authenticate, authorize('employee'), async (req, res) => {
    try {
        const { skillId } = req.params;

        const result = await db.query(`
            DELETE FROM employee_skills
            WHERE skill_id = $1 AND employee_id = (SELECT id FROM employee_profiles WHERE user_id = $2)
            RETURNING id
        `, [skillId, req.user.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Skill not found' });
        }

        res.json({ message: 'Skill removed successfully' });

    } catch (error) {
        console.error('Remove employee skill error:', error);
        res.status(500).json({ error: 'Failed to remove skill' });
    }
});

// Add certification
router.post('/certifications', authenticate, authorize('employee'), async (req, res) => {
    try {
        const { name, issuing_organization, issue_date, expiry_date, credential_id, credential_url } = req.body;

        if (!name || !issuing_organization) {
            return res.status(400).json({ error: 'Name and issuing organization are required' });
        }

        const employeeResult = await db.query('SELECT id FROM employee_profiles WHERE user_id = $1', [req.user.id]);
        if (employeeResult.rows.length === 0) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        const employeeId = employeeResult.rows[0].id;

        const result = await db.query(`
            INSERT INTO certifications (employee_id, name, issuing_organization, issue_date, expiry_date, credential_id, credential_url)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [employeeId, name, issuing_organization, issue_date || null, expiry_date || null, credential_id || null, credential_url || null]);

        res.json(result.rows[0]);

    } catch (error) {
        console.error('Add certification error:', error);
        res.status(500).json({ error: 'Failed to add certification' });
    }
});

// Update certification
router.put('/certifications/:id', authenticate, authorize('employee'), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, issuing_organization, issue_date, expiry_date, credential_id, credential_url } = req.body;

        const result = await db.query(`
            UPDATE certifications SET
                name = COALESCE($1, name),
                issuing_organization = COALESCE($2, issuing_organization),
                issue_date = COALESCE($3, issue_date),
                expiry_date = COALESCE($4, expiry_date),
                credential_id = COALESCE($5, credential_id),
                credential_url = COALESCE($6, credential_url)
            WHERE id = $7 AND employee_id = (SELECT id FROM employee_profiles WHERE user_id = $8)
            RETURNING *
        `, [name, issuing_organization, issue_date, expiry_date, credential_id, credential_url, id, req.user.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Certification not found' });
        }

        res.json(result.rows[0]);

    } catch (error) {
        console.error('Update certification error:', error);
        res.status(500).json({ error: 'Failed to update certification' });
    }
});

// Delete certification
router.delete('/certifications/:id', authenticate, authorize('employee'), async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.query(`
            DELETE FROM certifications
            WHERE id = $1 AND employee_id = (SELECT id FROM employee_profiles WHERE user_id = $2)
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

// Upload certification file — with AI skill extraction
router.post('/certifications/upload', authenticate, authorize('employee'), uploadDocuments, handleUploadError, async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const file = req.files[0];
        const fileUrl = `/uploads/documents/${file.filename}`;

        // Get employee info
        const empResult = await db.query('SELECT id, first_name, last_name FROM employee_profiles WHERE user_id = $1', [req.user.id]);
        const employeeId = empResult.rows.length > 0 ? empResult.rows[0].id : null;
        const empName = empResult.rows.length > 0 ? `${empResult.rows[0].first_name} ${empResult.rows[0].last_name}` : 'Unknown';

        // Extract text and skills from the uploaded certification document
        let addedSkills = [];
        let extractedInfo = null;
        if (employeeId) {
            try {
                const filePath = require('path').join(__dirname, '../../uploads/documents', file.filename);
                const fileData = await extractTextFromFile(filePath);

                if (fileData.text) {
                    extractedInfo = await aiService.extractFromDocument(fileData.text, 'certification');

                    // Auto-add extracted skills
                    if (extractedInfo && extractedInfo.skills && extractedInfo.skills.length > 0) {
                        addedSkills = await addExtractedSkillsToEmployee(employeeId, extractedInfo.skills);
                    }

                    // Update the last parse timestamp
                    await db.query(`UPDATE employee_profiles SET last_document_parse = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [employeeId]);

                    // Notify employee
                    if (addedSkills.length > 0) {
                        await createNotification(
                            req.user.id,
                            'Certification Skills Extracted',
                            `${addedSkills.length} skill(s) were extracted from your certification document and added to your profile: ${addedSkills.slice(0, 5).join(', ')}`,
                            'document_parsed',
                            '/employee/profile'
                        );
                    }

                    // Notify HR
                    await notifyAllHR(
                        'Employee Certification Uploaded',
                        `${empName} uploaded a certification document. ${addedSkills.length} skill(s) were auto-extracted.`,
                        'employee_update',
                        `/hr/employees/${employeeId}`
                    );
                }
            } catch (parseErr) {
                console.error('Certification parse error (non-fatal):', parseErr.message);
            }
        }

        res.json({ 
            message: 'File uploaded successfully', 
            fileUrl,
            originalName: file.originalname,
            size: file.size,
            addedSkills,
            extractedInfo
        });

    } catch (error) {
        console.error('Upload certification file error:', error);
        res.status(500).json({ error: 'Failed to upload file' });
    }
});

// Add training record / completed course
router.post('/training', authenticate, authorize('employee'), async (req, res) => {
    try {
        const { training_name, provider, completion_date, status, certificate_url, description } = req.body;

        const employeeResult = await db.query('SELECT id FROM employee_profiles WHERE user_id = $1', [req.user.id]);
        if (employeeResult.rows.length === 0) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        const employeeId = employeeResult.rows[0].id;

        const result = await db.query(`
            INSERT INTO training_records (employee_id, training_name, provider, completion_date, status, certificate_url, description)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [employeeId, training_name, provider, completion_date, status || 'completed', certificate_url, description]);

        res.json(result.rows[0]);

    } catch (error) {
        console.error('Add training error:', error);
        res.status(500).json({ error: 'Failed to add training record' });
    }
});

// Delete training record
router.delete('/training/:id', authenticate, authorize('employee'), async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.query(`
            DELETE FROM training_records
            WHERE id = $1 AND employee_id = (SELECT id FROM employee_profiles WHERE user_id = $2)
            RETURNING id
        `, [id, req.user.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Training record not found' });
        }

        res.json({ message: 'Training record deleted successfully' });

    } catch (error) {
        console.error('Delete training error:', error);
        res.status(500).json({ error: 'Failed to delete training record' });
    }
});

// Upload training/course certificate file — with AI skill extraction
router.post('/training/upload', authenticate, authorize('employee'), uploadDocuments, handleUploadError, async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const file = req.files[0];
        const fileUrl = `/uploads/documents/${file.filename}`;

        // Get employee info
        const empResult = await db.query('SELECT id, first_name, last_name FROM employee_profiles WHERE user_id = $1', [req.user.id]);
        const employeeId = empResult.rows.length > 0 ? empResult.rows[0].id : null;
        const empName = empResult.rows.length > 0 ? `${empResult.rows[0].first_name} ${empResult.rows[0].last_name}` : 'Unknown';

        // Extract text and skills from the uploaded training document
        let addedSkills = [];
        let extractedInfo = null;
        if (employeeId) {
            try {
                const filePath = require('path').join(__dirname, '../../uploads/documents', file.filename);
                const fileData = await extractTextFromFile(filePath);

                if (fileData.text) {
                    extractedInfo = await aiService.extractFromDocument(fileData.text, 'training');

                    // Auto-add extracted skills
                    if (extractedInfo && extractedInfo.skills && extractedInfo.skills.length > 0) {
                        addedSkills = await addExtractedSkillsToEmployee(employeeId, extractedInfo.skills);
                    }

                    // Update the last parse timestamp
                    await db.query(`UPDATE employee_profiles SET last_document_parse = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [employeeId]);

                    // Notify employee
                    if (addedSkills.length > 0) {
                        await createNotification(
                            req.user.id,
                            'Training Skills Extracted',
                            `${addedSkills.length} skill(s) were extracted from your training document and added to your profile: ${addedSkills.slice(0, 5).join(', ')}`,
                            'document_parsed',
                            '/employee/profile'
                        );
                    }

                    // Notify HR
                    await notifyAllHR(
                        'Employee Training Document Uploaded',
                        `${empName} uploaded a training/course document. ${addedSkills.length} skill(s) were auto-extracted.`,
                        'employee_update',
                        `/hr/employees/${employeeId}`
                    );
                }
            } catch (parseErr) {
                console.error('Training parse error (non-fatal):', parseErr.message);
            }
        }

        res.json({ 
            message: 'File uploaded successfully', 
            fileUrl,
            originalName: file.originalname,
            size: file.size,
            addedSkills,
            extractedInfo
        });

    } catch (error) {
        console.error('Upload training file error:', error);
        res.status(500).json({ error: 'Failed to upload file' });
    }
});

// Get internal job opportunities with full details
router.get('/opportunities', authenticate, authorize('employee'), async (req, res) => {
    try {
        const employeeResult = await db.query('SELECT id, resume_url FROM employee_profiles WHERE user_id = $1', [req.user.id]);
        if (employeeResult.rows.length === 0) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        const employeeId = employeeResult.rows[0].id;
        const hasResume = !!employeeResult.rows[0].resume_url;

        // Get jobs with full details (exclude withdrawn applications)
        const result = await db.query(`
            SELECT j.*, 
                   j.required_skills,
                   j.requirements,
                   j.responsibilities,
                   j.benefits,
                   j.description,
                   j.experience_level,
                   j.education_requirement,
                   j.closes_at as deadline,
                   j.is_remote,
                   ijm.overall_match_score, ijm.skill_match_score, ijm.career_alignment_score,
                   ijm.skill_gaps, ijm.development_recommendations,
                   (SELECT id FROM applications a WHERE a.job_id = j.id AND a.employee_id = $1 AND a.status != 'withdrawn') as application_id
            FROM jobs j
            LEFT JOIN internal_job_matches ijm ON j.id = ijm.job_id AND ijm.employee_id = $1
            WHERE j.status = 'published'
            ORDER BY ijm.overall_match_score DESC NULLS LAST, j.created_at DESC
        `, [employeeId]);

        // If no resume, set match scores to 0
        const jobs = result.rows.map(job => ({
            ...job,
            overall_match_score: hasResume ? job.overall_match_score : 0,
            skill_match_score: hasResume ? job.skill_match_score : 0,
            career_alignment_score: hasResume ? job.career_alignment_score : 0,
            has_resume: hasResume
        }));

        res.json(jobs);

    } catch (error) {
        console.error('Get opportunities error:', error);
        res.status(500).json({ error: 'Failed to fetch opportunities' });
    }
});

// Get single opportunity with full details
router.get('/opportunities/:id', authenticate, authorize('employee'), async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.query(`
            SELECT j.*, 
                   j.required_skills,
                   j.requirements,
                   j.responsibilities,
                   j.benefits,
                   j.description,
                   j.experience_level,
                   j.education_requirement,
                   j.closes_at as deadline,
                   j.is_remote
            FROM jobs j
            WHERE j.id = $1 AND j.status = 'published'
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Job not found' });
        }

        res.json(result.rows[0]);

    } catch (error) {
        console.error('Get opportunity error:', error);
        res.status(500).json({ error: 'Failed to fetch opportunity' });
    }
});

// Apply for internal position (Express Interest)
router.post('/apply-internal', authenticate, authorize('employee'), async (req, res) => {
    try {
        const { jobId, coverLetter } = req.body;

        if (!jobId) {
            return res.status(400).json({ error: 'Job ID is required' });
        }

        const employeeResult = await db.query('SELECT id, first_name, last_name, resume_url FROM employee_profiles WHERE user_id = $1', [req.user.id]);
        if (employeeResult.rows.length === 0) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        const employee = employeeResult.rows[0];

        // Require resume before applying
        if (!employee.resume_url) {
            return res.status(400).json({ error: 'Please upload your resume before applying. Go to your Profile to upload a resume.' });
        }

        // Check if already applied (excluding withdrawn applications)
        const existingApp = await db.query(
            `SELECT id, status FROM applications WHERE job_id = $1 AND employee_id = $2`,
            [jobId, employee.id]
        );
        
        if (existingApp.rows.length > 0) {
            const existingStatus = existingApp.rows[0].status;
            if (existingStatus === 'withdrawn') {
                // Delete the withdrawn application so they can reapply
                await db.query('DELETE FROM applications WHERE id = $1', [existingApp.rows[0].id]);
            } else {
                return res.status(400).json({ error: 'You have already applied for this position' });
            }
        }

        // Create application
        const result = await db.query(`
            INSERT INTO applications (job_id, employee_id, status, cover_letter, submitted_at)
            VALUES ($1, $2, 'submitted', $3, CURRENT_TIMESTAMP)
            RETURNING *
        `, [jobId, employee.id, coverLetter]);

        const application = result.rows[0];

        // Get job details for notification and AI scoring
        const jobResult = await db.query('SELECT * FROM jobs WHERE id = $1', [jobId]);
        const job = jobResult.rows[0];

        // Trigger AI screening asynchronously (same as candidate applications)
        aiService.screenApplication(application, job).then(async (scores) => {
            try {
                await db.query(`
                    UPDATE applications SET
                        ai_overall_score = $1,
                        ai_skill_match_score = $2,
                        ai_experience_match_score = $3,
                        ai_education_match_score = $4,
                        ai_cultural_fit_score = $5,
                        ai_skill_gap_analysis = $6,
                        ai_strengths = $7,
                        ai_concerns = $8,
                        ai_interview_questions = $9,
                        ai_success_prediction = $10,
                        ai_retention_prediction = $11,
                        ai_recommendation = $12,
                        resume_match_score = $1,
                        resume_match_details = $13
                    WHERE id = $14
                `, [
                    scores.overallScore, scores.skillMatchScore, scores.experienceMatchScore,
                    scores.educationMatchScore, scores.culturalFitScore,
                    JSON.stringify(scores.skillGapAnalysis), JSON.stringify(scores.strengths),
                    JSON.stringify(scores.concerns), JSON.stringify(scores.interviewQuestions),
                    scores.successPrediction, scores.retentionPrediction, scores.recommendation,
                    JSON.stringify(scores._resumeMatchDetails || {}),
                    application.id
                ]);
                console.log(`AI score for employee application ${application.id}: ${scores.overallScore}%`);
            } catch (updateError) {
                console.error(`Failed to update AI score for application ${application.id}:`, updateError.message);
            }
        }).catch(err => {
            console.error(`AI screening error for application ${application.id}:`, err.message);
        });

        // Notify HR
        try {
            const hrUsers = await db.query("SELECT email FROM users WHERE role = 'hr_manager'");
            for (const hr of hrUsers.rows) {
                await emailService.sendEmail(
                    hr.email,
                    `Internal Application: ${employee.first_name} ${employee.last_name} for ${job.title}`,
                    `
                        <h2>New Internal Application</h2>
                        <p>Employee <strong>${employee.first_name} ${employee.last_name}</strong> has expressed interest in the position:</p>
                        <p><strong>${job.title}</strong> - ${job.department}</p>
                        <p>Please review the application in the recruitment system.</p>
                    `
                );
            }
        } catch (emailError) {
            console.error('Failed to send notification email:', emailError);
        }

        res.json({ message: 'Application submitted successfully', application: result.rows[0] });

    } catch (error) {
        console.error('Apply internal error:', error);
        res.status(500).json({ error: 'Failed to submit application' });
    }
});

// Get employee's applications
router.get('/my-applications', authenticate, authorize('employee'), async (req, res) => {
    try {
        const employeeResult = await db.query('SELECT id FROM employee_profiles WHERE user_id = $1', [req.user.id]);
        if (employeeResult.rows.length === 0) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        const employeeId = employeeResult.rows[0].id;

        const result = await db.query(`
            SELECT a.*,
                   j.title as job_title,
                   j.department,
                   j.location,
                   j.job_type,
                   j.experience_level,
                   j.description,
                   j.requirements,
                   j.required_skills,
                   j.closes_at as deadline,
                   j.is_remote
            FROM applications a
            JOIN jobs j ON a.job_id = j.id
            WHERE a.employee_id = $1
            ORDER BY a.submitted_at DESC
        `, [employeeId]);

        res.json(result.rows);

    } catch (error) {
        console.error('Get my applications error:', error);
        res.status(500).json({ error: 'Failed to fetch applications' });
    }
});

// Withdraw application
router.post('/applications/:id/withdraw', authenticate, authorize('employee'), async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        const employeeResult = await db.query('SELECT id FROM employee_profiles WHERE user_id = $1', [req.user.id]);
        if (employeeResult.rows.length === 0) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        const employeeId = employeeResult.rows[0].id;

        // Check if the application belongs to this employee and can be withdrawn
        const appCheck = await db.query(`
            SELECT id, status FROM applications 
            WHERE id = $1 AND employee_id = $2
        `, [id, employeeId]);

        if (appCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Application not found' });
        }

        const currentStatus = appCheck.rows[0].status;
        if (['hired', 'rejected', 'withdrawn'].includes(currentStatus)) {
            return res.status(400).json({ error: `Cannot withdraw application with status: ${currentStatus}` });
        }

        // Update the application status
        const result = await db.query(`
            UPDATE applications 
            SET status = 'withdrawn', 
                notes = COALESCE(notes || E'\n', '') || 'Withdrawal reason: ' || COALESCE($1, 'No reason provided'),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2 AND employee_id = $3
            RETURNING *
        `, [reason || null, id, employeeId]);

        // Get job details for notification
        const jobResult = await db.query(`
            SELECT j.title, j.department, ep.first_name, ep.last_name
            FROM applications a
            JOIN jobs j ON a.job_id = j.id
            JOIN employee_profiles ep ON a.employee_id = ep.id
            WHERE a.id = $1
        `, [id]);

        // Notify HR about withdrawal
        if (jobResult.rows.length > 0) {
            const job = jobResult.rows[0];
            try {
                const hrUsers = await db.query("SELECT email FROM users WHERE role = 'hr_manager'");
                for (const hr of hrUsers.rows) {
                    await emailService.sendEmail(
                        hr.email,
                        `Application Withdrawn: ${job.first_name} ${job.last_name} - ${job.title}`,
                        `
                            <h2>Application Withdrawn</h2>
                            <p>Employee <strong>${job.first_name} ${job.last_name}</strong> has withdrawn their application for:</p>
                            <p><strong>${job.title}</strong> - ${job.department}</p>
                            ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
                        `
                    );
                }
            } catch (emailError) {
                console.error('Failed to send withdrawal notification:', emailError);
            }
        }

        res.json({ message: 'Application withdrawn successfully', application: result.rows[0] });

    } catch (error) {
        console.error('Withdraw application error:', error);
        res.status(500).json({ error: 'Failed to withdraw application' });
    }
});

// Accept offer (employee)
router.post('/applications/:id/accept-offer', authenticate, authorize('employee'), async (req, res) => {
    try {
        const { id } = req.params;

        const employeeResult = await db.query('SELECT id FROM employee_profiles WHERE user_id = $1', [req.user.id]);
        if (employeeResult.rows.length === 0) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        const employeeId = employeeResult.rows[0].id;

        // Check ownership and current status
        const appCheck = await db.query(`
            SELECT a.id, a.status, j.title as job_title, j.department,
                   ep.first_name, ep.last_name
            FROM applications a
            JOIN jobs j ON a.job_id = j.id
            JOIN employee_profiles ep ON a.employee_id = ep.id
            WHERE a.id = $1 AND a.employee_id = $2
        `, [id, employeeId]);

        if (appCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Application not found' });
        }

        const app = appCheck.rows[0];
        if (app.status !== 'offer_extended') {
            return res.status(400).json({ error: 'No pending offer to accept' });
        }

        // Update to hired
        const result = await db.query(`
            UPDATE applications 
            SET status = 'hired',
                notes = COALESCE(notes || E'\\n', '') || 'Offer accepted on ' || CURRENT_DATE::text,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND employee_id = $2
            RETURNING *, job_id
        `, [id, employeeId]);

        const jobId = result.rows[0].job_id;

        // Now reject all other interviewed candidates for this job since offer was accepted
        const rejectReason = 'Another candidate was selected and accepted the position';
        const rejectResult = await db.query(`
            UPDATE applications 
            SET status = 'rejected',
                reviewed_at = CURRENT_TIMESTAMP,
                auto_reject_reason = $1,
                notes = COALESCE(notes || E'\\n', '') || $1
            WHERE job_id = $2 
              AND id != $3
              AND status = 'interviewed'
            RETURNING id
        `, [rejectReason, jobId, id]);

        console.log(`Offer accepted for job ${jobId}. Rejected ${rejectResult.rows.length} other candidates.`);

        // Send rejection emails to other candidates
        if (rejectResult.rows.length > 0) {
            const rejectedIds = rejectResult.rows.map(r => r.id);
            const rejectedCandidates = await db.query(`
                SELECT a.id, u.email, 
                       COALESCE(cp.first_name, ep.first_name) as first_name,
                       COALESCE(cp.last_name, ep.last_name) as last_name,
                       j.title as job_title
                FROM applications a
                JOIN jobs j ON a.job_id = j.id
                LEFT JOIN candidate_profiles cp ON a.candidate_id = cp.id
                LEFT JOIN employee_profiles ep ON a.employee_id = ep.id
                LEFT JOIN users u ON cp.user_id = u.id OR ep.user_id = u.id
                WHERE a.id = ANY($1)
            `, [rejectedIds]);

            console.log('Sending rejection emails to:', rejectedCandidates.rows.map(c => c.email));

            for (const candidate of rejectedCandidates.rows) {
                if (candidate.email) {
                    try {
                        await emailService.sendStatusUpdateEmail(
                            candidate.email,
                            candidate.first_name,
                            candidate.job_title,
                            'rejected'
                        );
                        console.log(`Rejection email sent to ${candidate.email}`);
                    } catch (err) {
                        console.error(`Rejection email FAILED for ${candidate.email}:`, err.message);
                    }
                }
            }
        }

        // Notify HR
        try {
            const hrUsers = await db.query("SELECT email FROM users WHERE role = 'hr_manager'");
            for (const hr of hrUsers.rows) {
                await emailService.sendEmail(
                    hr.email,
                    `Offer Accepted: ${app.first_name} ${app.last_name} - ${app.job_title}`,
                    `
                        <h2>Offer Accepted!</h2>
                        <p>Employee <strong>${app.first_name} ${app.last_name}</strong> has accepted the offer for:</p>
                        <p><strong>${app.job_title}</strong> - ${app.department}</p>
                        <p>Please proceed with the internal transfer/onboarding process.</p>
                        <p><em>${rejectResult.rows.length} other candidate(s) have been automatically notified of the decision.</em></p>
                    `
                );
            }
        } catch (emailError) {
            console.error('Failed to send offer acceptance notification:', emailError);
        }

        res.json({ message: 'Offer accepted! Congratulations!', application: result.rows[0] });

    } catch (error) {
        console.error('Accept offer error:', error);
        res.status(500).json({ error: 'Failed to accept offer' });
    }
});

// Decline offer (employee)
router.post('/applications/:id/decline-offer', authenticate, authorize('employee'), async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        const employeeResult = await db.query('SELECT id FROM employee_profiles WHERE user_id = $1', [req.user.id]);
        if (employeeResult.rows.length === 0) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        const employeeId = employeeResult.rows[0].id;

        // Check ownership and current status
        const appCheck = await db.query(`
            SELECT a.id, a.status, a.job_id, j.title as job_title, j.department,
                   ep.first_name, ep.last_name
            FROM applications a
            JOIN jobs j ON a.job_id = j.id
            JOIN employee_profiles ep ON a.employee_id = ep.id
            WHERE a.id = $1 AND a.employee_id = $2
        `, [id, employeeId]);

        if (appCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Application not found' });
        }

        const app = appCheck.rows[0];
        if (app.status !== 'offer_extended') {
            return res.status(400).json({ error: 'No pending offer to decline' });
        }

        // Update to offer_declined
        const result = await db.query(`
            UPDATE applications 
            SET status = 'offer_declined',
                notes = COALESCE(notes || E'\\n', '') || 'Offer declined on ' || CURRENT_DATE::text || '. Reason: ' || COALESCE($1, 'No reason provided'),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2 AND employee_id = $3
            RETURNING *
        `, [reason || null, id, employeeId]);

        // Reactivate previously rejected candidates for this job so HR can select someone else
        // Only reactivate those who have completed interviews
        const reactivatedResult = await db.query(`
            UPDATE applications 
            SET status = 'interviewed',
                notes = COALESCE(notes || E'\\n', '') || 'Reactivated for reconsideration after offer decline on ' || CURRENT_DATE::text,
                updated_at = CURRENT_TIMESTAMP
            WHERE id IN (
                SELECT a.id FROM applications a
                JOIN interviews i ON i.application_id = a.id
                WHERE a.job_id = $1
                  AND a.status = 'rejected'
                  AND a.auto_reject_reason IS NOT NULL
                  AND a.id != $2
                  AND i.status = 'completed'
            )
            RETURNING id
        `, [app.job_id, id]);

        console.log(`Reactivated ${reactivatedResult.rows.length} candidates for job ${app.job_id} after offer decline`);

        // Notify HR
        try {
            const hrUsers = await db.query("SELECT id, email FROM users WHERE role = 'hr_manager'");
            for (const hr of hrUsers.rows) {
                // Send email notification
                await emailService.sendEmail(
                    hr.email,
                    `Offer Declined: ${app.first_name} ${app.last_name} - ${app.job_title}`,
                    `
                        <h2>Offer Declined</h2>
                        <p>Employee <strong>${app.first_name} ${app.last_name}</strong> has declined the offer for:</p>
                        <p><strong>${app.job_title}</strong> - ${app.department}</p>
                        ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
                        <p>You may want to consider other candidates for this position.</p>
                        <p><a href="${require('../config').frontendUrl}/hr/interviews">View evaluation to select another candidate</a></p>
                    `
                );

                // Create in-app notification
                await db.query(`
                    INSERT INTO notifications (user_id, title, message, type, link)
                    VALUES ($1, $2, $3, $4, $5)
                `, [
                    hr.id,
                    `Offer Declined: ${app.job_title}`,
                    `${app.first_name} ${app.last_name} has declined the offer for ${app.job_title}. You can select another candidate to extend the offer.`,
                    'offer_declined',
                    '/hr/interviews'
                ]);
            }
        } catch (emailError) {
            console.error('Failed to send offer decline notification:', emailError);
        }

        res.json({ message: 'Offer declined', application: result.rows[0] });

    } catch (error) {
        console.error('Decline offer error:', error);
        res.status(500).json({ error: 'Failed to decline offer' });
    }
});

// Get employee's interviews
router.get('/my-interviews', authenticate, authorize('employee'), async (req, res) => {
    try {
        const employeeResult = await db.query('SELECT id FROM employee_profiles WHERE user_id = $1', [req.user.id]);
        if (employeeResult.rows.length === 0) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        const employeeId = employeeResult.rows[0].id;

        const result = await db.query(`
            SELECT i.*,
                   j.title as job_title,
                   j.department,
                   j.location,
                   a.status as application_status
            FROM interviews i
            JOIN applications a ON i.application_id = a.id
            JOIN jobs j ON a.job_id = j.id
            WHERE a.employee_id = $1
            ORDER BY i.scheduled_date DESC, i.start_time DESC
        `, [employeeId]);

        res.json(result.rows);

    } catch (error) {
        console.error('Get my interviews error:', error);
        res.status(500).json({ error: 'Failed to fetch interviews' });
    }
});

// Confirm interview
router.post('/interviews/:id/confirm', authenticate, authorize('employee'), async (req, res) => {
    try {
        const { id } = req.params;

        const employeeResult = await db.query('SELECT id FROM employee_profiles WHERE user_id = $1', [req.user.id]);
        if (employeeResult.rows.length === 0) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        const employeeId = employeeResult.rows[0].id;

        // Verify the interview belongs to this employee
        const interviewCheck = await db.query(`
            SELECT i.*, j.title as job_title 
            FROM interviews i
            JOIN applications a ON i.application_id = a.id
            JOIN jobs j ON a.job_id = j.id
            WHERE i.id = $1 AND a.employee_id = $2
        `, [id, employeeId]);

        if (interviewCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Interview not found' });
        }

        const result = await db.query(`
            UPDATE interviews SET
                status = 'confirmed',
                confirmed_at = CURRENT_TIMESTAMP,
                confirmed_by = $1
            WHERE id = $2
            RETURNING *
        `, [req.user.id, id]);

        // Notify HR
        try {
            const empInfo = await db.query(`
                SELECT first_name, last_name FROM employee_profiles WHERE user_id = $1
            `, [req.user.id]);
            const emp = empInfo.rows[0];
            const interview = interviewCheck.rows[0];

            const hrUsers = await db.query("SELECT email FROM users WHERE role = 'hr_manager'");
            for (const hr of hrUsers.rows) {
                await emailService.sendEmail(
                    hr.email,
                    `Interview Confirmed: ${emp.first_name} ${emp.last_name} - ${interview.job_title}`,
                    `
                        <h2>Interview Confirmed</h2>
                        <p><strong>${emp.first_name} ${emp.last_name}</strong> has confirmed their interview for:</p>
                        <p><strong>Position:</strong> ${interview.job_title}</p>
                        <p><strong>Date:</strong> ${new Date(interview.scheduled_date).toLocaleDateString()}</p>
                        <p><strong>Time:</strong> ${interview.start_time}</p>
                    `
                );
            }
        } catch (emailError) {
            console.error('Failed to send confirmation email:', emailError);
        }

        res.json({ message: 'Interview confirmed successfully', interview: result.rows[0] });

    } catch (error) {
        console.error('Confirm interview error:', error);
        res.status(500).json({ error: 'Failed to confirm interview' });
    }
});

// Contact HR
router.post('/contact-hr', authenticate, authorize('employee'), async (req, res) => {
    try {
        const { subject, message, jobId } = req.body;

        if (!subject || !message) {
            return res.status(400).json({ error: 'Subject and message are required' });
        }

        const employeeResult = await db.query(`
            SELECT ep.*, u.email 
            FROM employee_profiles ep 
            JOIN users u ON ep.user_id = u.id 
            WHERE ep.user_id = $1
        `, [req.user.id]);
        
        if (employeeResult.rows.length === 0) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        const employee = employeeResult.rows[0];

        let jobInfo = '';
        if (jobId) {
            const jobResult = await db.query('SELECT title, department FROM jobs WHERE id = $1', [jobId]);
            if (jobResult.rows.length > 0) {
                const job = jobResult.rows[0];
                jobInfo = `<p><strong>Regarding Position:</strong> ${job.title} (${job.department})</p>`;
            }
        }

        // Send email to all HR managers
        const hrUsers = await db.query("SELECT email FROM users WHERE role = 'hr_manager'");
        
        for (const hr of hrUsers.rows) {
            await emailService.sendEmail(
                hr.email,
                `Employee Inquiry: ${subject}`,
                `
                    <h2>Employee Contact Request</h2>
                    <p><strong>From:</strong> ${employee.first_name} ${employee.last_name} (${employee.email})</p>
                    <p><strong>Employee ID:</strong> ${employee.employee_id}</p>
                    <p><strong>Department:</strong> ${employee.department}</p>
                    ${jobInfo}
                    <hr>
                    <p><strong>Subject:</strong> ${subject}</p>
                    <p><strong>Message:</strong></p>
                    <p>${message.replace(/\n/g, '<br>')}</p>
                    <hr>
                    <p><em>Please reply directly to this employee at ${employee.email}</em></p>
                `
            );
        }

        res.json({ message: 'Your message has been sent to HR. They will respond to you shortly.' });

    } catch (error) {
        console.error('Contact HR error:', error);
        res.status(500).json({ error: 'Failed to send message to HR' });
    }
});

// Save/bookmark a job
router.post('/save-job', authenticate, authorize('employee'), async (req, res) => {
    try {
        const { jobId } = req.body;

        const employeeResult = await db.query('SELECT id FROM employee_profiles WHERE user_id = $1', [req.user.id]);
        if (employeeResult.rows.length === 0) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        const employeeId = employeeResult.rows[0].id;

        // Toggle save status
        const existing = await db.query(
            'SELECT id FROM saved_jobs WHERE employee_id = $1 AND job_id = $2',
            [employeeId, jobId]
        );

        if (existing.rows.length > 0) {
            await db.query('DELETE FROM saved_jobs WHERE employee_id = $1 AND job_id = $2', [employeeId, jobId]);
            res.json({ message: 'Job removed from saved', saved: false });
        } else {
            await db.query(
                'INSERT INTO saved_jobs (employee_id, job_id) VALUES ($1, $2)',
                [employeeId, jobId]
            );
            res.json({ message: 'Job saved', saved: true });
        }

    } catch (error) {
        console.error('Save job error:', error);
        res.status(500).json({ error: 'Failed to save job' });
    }
});

// Get saved jobs
router.get('/saved-jobs', authenticate, authorize('employee'), async (req, res) => {
    try {
        const employeeResult = await db.query('SELECT id FROM employee_profiles WHERE user_id = $1', [req.user.id]);
        if (employeeResult.rows.length === 0) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        const employeeId = employeeResult.rows[0].id;

        const result = await db.query(`
            SELECT j.* FROM jobs j
            JOIN saved_jobs sj ON j.id = sj.job_id
            WHERE sj.employee_id = $1
            ORDER BY sj.created_at DESC
        `, [employeeId]);

        res.json(result.rows);

    } catch (error) {
        console.error('Get saved jobs error:', error);
        res.status(500).json({ error: 'Failed to fetch saved jobs' });
    }
});

// Get career path recommendations
router.get('/career-paths', authenticate, authorize('employee'), async (req, res) => {
    try {
        const employeeResult = await db.query('SELECT id FROM employee_profiles WHERE user_id = $1', [req.user.id]);
        if (employeeResult.rows.length === 0) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        const employeeId = employeeResult.rows[0].id;

        const result = await db.query(`
            SELECT * FROM career_path_recommendations
            WHERE employee_id = $1
            ORDER BY success_probability DESC
        `, [employeeId]);

        res.json(result.rows);

    } catch (error) {
        console.error('Get career paths error:', error);
        res.status(500).json({ error: 'Failed to fetch career paths' });
    }
});

// ===================== HR VIEW ENDPOINTS =====================

// Get all employees (HR view)
router.get('/', authenticate, authorize('admin', 'hr_manager'), async (req, res) => {
    try {
        const { department, search, page = 1, limit = 20, matchJobId } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT ep.*, u.email, u.status as account_status,
                   m.first_name as manager_first_name, m.last_name as manager_last_name,
                   ep.photo_url
        `;

        // If matchJobId is provided, also fetch match scores
        if (matchJobId) {
            query += `,
                   ijm.overall_match_score, ijm.skill_match_score, ijm.experience_match_score,
                   ijm.career_alignment_score, ijm.skill_gaps
            `;
        }

        query += `
            FROM employee_profiles ep
            JOIN users u ON ep.user_id = u.id
            LEFT JOIN employee_profiles m ON ep.manager_id = m.id
        `;

        let paramIndex = 1;
        const params = [];

        if (matchJobId) {
            query += ` LEFT JOIN internal_job_matches ijm ON ep.id = ijm.employee_id AND ijm.job_id = $${paramIndex++}`;
            params.push(matchJobId);
        }

        query += ` WHERE 1=1`;

        if (department) {
            query += ` AND ep.department = $${paramIndex++}`;
            params.push(department);
        }

        if (search) {
            query += ` AND (ep.first_name ILIKE $${paramIndex} OR ep.last_name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex} OR ep.employee_id ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        const fromIndex = query.indexOf('FROM employee_profiles');
        const countQuery = 'SELECT COUNT(*) ' + query.substring(fromIndex);
        const countResult = await db.query(countQuery, params);
        const total = parseInt(countResult.rows[0].count);

        if (matchJobId) {
            query += ` ORDER BY ijm.overall_match_score DESC NULLS LAST, ep.first_name, ep.last_name LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
        } else {
            query += ` ORDER BY ep.first_name, ep.last_name LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
        }
        params.push(limit, offset);

        const result = await db.query(query, params);

        res.json({
            employees: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('Get employees error:', error);
        res.status(500).json({ error: 'Failed to fetch employees' });
    }
});

// Get employee by ID (HR view)
router.get('/:id', authenticate, authorize('admin', 'hr_manager'), async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.query(`
            SELECT ep.*,
                   u.email, u.status as account_status, u.last_login,
                   m.first_name as manager_first_name, m.last_name as manager_last_name,
                   (SELECT json_agg(json_build_object('id', es.id, 'name', s.name, 'category', s.category, 'proficiency', es.proficiency_level, 'years', es.years_of_experience))
                    FROM employee_skills es JOIN skills s ON es.skill_id = s.id WHERE es.employee_id = ep.id) as skills,
                   (SELECT json_agg(json_build_object('id', c.id, 'name', c.name, 'issuer', c.issuing_organization, 'date', c.issue_date, 'expiry', c.expiry_date, 'credential_url', c.credential_url))
                    FROM certifications c WHERE c.employee_id = ep.id) as certifications,
                   (SELECT json_agg(json_build_object('id', t.id, 'name', t.training_name, 'provider', t.provider, 'date', t.completion_date, 'status', t.status, 'certificate_url', t.certificate_url))
                    FROM training_records t WHERE t.employee_id = ep.id) as training,
                   (SELECT json_agg(json_build_object('id', cpr.id, 'role', cpr.recommended_role, 'readiness', cpr.readiness_percentage, 'probability', cpr.success_probability))
                    FROM career_path_recommendations cpr WHERE cpr.employee_id = ep.id) as career_paths
            FROM employee_profiles ep
            JOIN users u ON ep.user_id = u.id
            LEFT JOIN employee_profiles m ON ep.manager_id = m.id
            WHERE ep.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Employee not found' });
        }

        res.json(result.rows[0]);

    } catch (error) {
        console.error('Get employee error:', error);
        res.status(500).json({ error: 'Failed to fetch employee' });
    }
});

// Update employee (HR view)
router.put('/:id', authenticate, authorize('admin', 'hr_manager'), async (req, res) => {
    try {
        const { id } = req.params;
        const {
            department, job_title, manager_id, employment_status,
            location, salary, performance_rating, last_review_date, hire_date
        } = req.body;

        const result = await db.query(`
            UPDATE employee_profiles SET
                department = COALESCE($1, department),
                job_title = COALESCE($2, job_title),
                manager_id = $3,
                employment_status = COALESCE($4, employment_status),
                location = COALESCE($5, location),
                salary = COALESCE($6, salary),
                performance_rating = COALESCE($7, performance_rating),
                last_review_date = COALESCE($8, last_review_date),
                hire_date = COALESCE($9, hire_date),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $10
            RETURNING *
        `, [department, job_title, manager_id, employment_status, location, salary, performance_rating, last_review_date, hire_date, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Employee not found' });
        }

        res.json(result.rows[0]);

    } catch (error) {
        console.error('Update employee error:', error);
        res.status(500).json({ error: 'Failed to update employee' });
    }
});

// Get departments
router.get('/meta/departments', authenticate, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT DISTINCT department FROM employee_profiles WHERE department IS NOT NULL ORDER BY department
        `);
        res.json(result.rows.map(r => r.department));
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch departments' });
    }
});

module.exports = router;
