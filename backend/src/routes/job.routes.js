const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticate, authorize, optionalAuth } = require('../middleware/auth.middleware');
const aiService = require('../services/ai.service');
const jobDistributionService = require('../services/jobDistribution.service');

// Validation Rules
const jobValidation = [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('department').trim().notEmpty().withMessage('Department is required'),
    body('description').trim().notEmpty().withMessage('Description is required'),
    body('job_type').isIn(['full_time', 'part_time', 'contract', 'temporary', 'internship', 'remote']),
    body('salary_min').optional().isNumeric(),
    body('salary_max').optional().isNumeric()
];

// Get all jobs (public with filters)
router.get('/', optionalAuth, async (req, res) => {
    try {
        const { 
            search, department, location, job_type, experience_level,
            remote, status = 'published', page = 1, limit = 20,
            sort = 'created_at', order = 'DESC'
        } = req.query;
        
        const offset = (page - 1) * limit;
        
        // Get candidate profile ID if user is logged in as candidate
        let candidateId = null;
        if (req.user && req.user.role === 'candidate') {
            const profileResult = await db.query('SELECT id FROM candidate_profiles WHERE user_id = $1', [req.user.id]);
            if (profileResult.rows.length > 0) {
                candidateId = profileResult.rows[0].id;
            }
        }
        
        let query = `
            SELECT j.*, 
                   u.email as created_by_email,
                   (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id) as application_count
                   ${candidateId ? `, EXISTS(SELECT 1 FROM applications a WHERE a.job_id = j.id AND a.candidate_id = '${candidateId}' AND a.status != 'withdrawn') as has_applied` : ''}
            FROM jobs j
            LEFT JOIN users u ON j.created_by = u.id
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        // Show internal jobs only to employees/HR
        if (!req.user || (req.user.role !== 'employee' && req.user.role !== 'hr_manager' && req.user.role !== 'admin')) {
            query += ` AND j.is_internal_only = false`;
        }

        // Status filter (default: published for public)
        if (req.user && (req.user.role === 'hr_manager' || req.user.role === 'admin')) {
            if (status && status !== 'all') {
                query += ` AND j.status = $${paramIndex++}`;
                params.push(status);
            }
        } else {
            query += ` AND j.status = 'published'`;
        }

        if (search) {
            query += ` AND (j.title ILIKE $${paramIndex} OR j.description ILIKE $${paramIndex} OR j.department ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        if (department) {
            query += ` AND j.department = $${paramIndex++}`;
            params.push(department);
        }

        if (location) {
            query += ` AND j.location ILIKE $${paramIndex++}`;
            params.push(`%${location}%`);
        }

        if (job_type) {
            query += ` AND j.job_type = $${paramIndex++}`;
            params.push(job_type);
        }

        if (experience_level) {
            query += ` AND j.experience_level = $${paramIndex++}`;
            params.push(experience_level);
        }

        if (remote === 'true') {
            query += ` AND j.is_remote = true`;
        }

        // Count total
        const countQuery = query.replace(/SELECT.*FROM/, 'SELECT COUNT(*) FROM');
        const countResult = await db.query(countQuery, params);
        const total = parseInt(countResult.rows[0].count);

        // Add sorting and pagination
        const validSortFields = ['created_at', 'title', 'salary_min', 'application_count'];
        const sortField = validSortFields.includes(sort) ? sort : 'created_at';
        const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
        
        query += ` ORDER BY j.${sortField} ${sortOrder} LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
        params.push(limit, offset);

        const result = await db.query(query, params);

        res.json({
            jobs: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('Get jobs error:', error);
        res.status(500).json({ error: 'Failed to fetch jobs' });
    }
});

// Get all distributions summary for admin dashboard
// IMPORTANT: This must be defined BEFORE /:identifier to avoid route conflict
router.get('/distributions/summary', authenticate, authorize('admin', 'hr_manager'), async (req, res) => {
    try {
        const result = await db.query(`
            SELECT 
                jd.platform,
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE jd.status = 'published') as published,
                COUNT(*) FILTER (WHERE jd.status = 'failed') as failed,
                COUNT(*) FILTER (WHERE jd.status = 'pending') as pending
            FROM job_distributions jd
            GROUP BY jd.platform
            ORDER BY total DESC
        `);

        const recentDistributions = await db.query(`
            SELECT jd.*, j.title as job_title
            FROM job_distributions jd
            JOIN jobs j ON jd.job_id = j.id
            ORDER BY jd.created_at DESC
            LIMIT 10
        `);

        res.json({
            summary: result.rows,
            recent: recentDistributions.rows
        });

    } catch (error) {
        console.error('Get distributions summary error:', error);
        res.status(500).json({ error: 'Failed to fetch distributions summary' });
    }
});

// Get departments list
router.get('/meta/departments', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT DISTINCT department FROM jobs WHERE department IS NOT NULL ORDER BY department
        `);
        res.json(result.rows.map(r => r.department));
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch departments' });
    }
});

// Get locations list
router.get('/meta/locations', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT DISTINCT location FROM jobs WHERE location IS NOT NULL ORDER BY location
        `);
        res.json(result.rows.map(r => r.location));
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch locations' });
    }
});

// Get recommended jobs for candidate/employee based on skills and education
router.get('/recommendations', authenticate, async (req, res) => {
    try {
        const { limit = 6 } = req.query;
        let userSkills = [];
        let userEducation = null;
        let profileId = null;
        let profileType = null;

        // Get user's skills and education based on role
        if (req.user.role === 'candidate') {
            // Get candidate profile with skills and education
            const profileResult = await db.query(`
                SELECT cp.id,
                       (SELECT json_agg(s.name) FROM candidate_skills cs 
                        JOIN skills s ON cs.skill_id = s.id WHERE cs.candidate_id = cp.id) as skills,
                       (SELECT MAX(degree_type) FROM education_records WHERE candidate_id = cp.id) as highest_education
                FROM candidate_profiles cp
                WHERE cp.user_id = $1
            `, [req.user.id]);
            
            if (profileResult.rows.length > 0) {
                const profile = profileResult.rows[0];
                profileId = profile.id;
                profileType = 'candidate';
                userSkills = profile.skills || [];
                userEducation = profile.highest_education;
            }

            // Also check resume for extracted skills
            const resumeResult = await db.query(`
                SELECT extracted_skills FROM resumes 
                WHERE candidate_id = $1 ORDER BY is_primary DESC, created_at DESC LIMIT 1
            `, [profileId]);
            
            if (resumeResult.rows.length > 0 && resumeResult.rows[0].extracted_skills) {
                const extractedSkills = resumeResult.rows[0].extracted_skills;
                if (Array.isArray(extractedSkills)) {
                    userSkills = [...new Set([...userSkills, ...extractedSkills])];
                }
            }
        } else if (req.user.role === 'employee') {
            // Get employee profile with skills
            const profileResult = await db.query(`
                SELECT ep.id,
                       (SELECT json_agg(s.name) FROM employee_skills es 
                        JOIN skills s ON es.skill_id = s.id WHERE es.employee_id = ep.id) as skills
                FROM employee_profiles ep
                WHERE ep.user_id = $1
            `, [req.user.id]);
            
            if (profileResult.rows.length > 0) {
                const profile = profileResult.rows[0];
                profileId = profile.id;
                profileType = 'employee';
                userSkills = profile.skills || [];
            }

            // Also check resume for extracted skills
            const resumeResult = await db.query(`
                SELECT extracted_skills, extracted_education FROM resumes 
                WHERE employee_id = $1 ORDER BY is_primary DESC, created_at DESC LIMIT 1
            `, [profileId]);
            
            if (resumeResult.rows.length > 0) {
                if (resumeResult.rows[0].extracted_skills) {
                    const extractedSkills = resumeResult.rows[0].extracted_skills;
                    if (Array.isArray(extractedSkills)) {
                        userSkills = [...new Set([...userSkills, ...extractedSkills])];
                    }
                }
                if (resumeResult.rows[0].extracted_education) {
                    userEducation = resumeResult.rows[0].extracted_education;
                }
            }
        } else {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Helper function to extract skill name from various formats
        const extractSkillName = (skill) => {
            if (typeof skill === 'string') return skill;
            if (typeof skill === 'object' && skill !== null) {
                return skill.name || skill.skill_name || skill.skill || '';
            }
            return '';
        };

        // Normalize skills to lowercase for matching
        const normalizedSkills = userSkills
            .map(s => extractSkillName(s).toLowerCase().trim())
            .filter(Boolean);

        // Get published jobs that user hasn't applied to yet
        const appliedJobsQuery = profileType === 'candidate'
            ? `SELECT job_id FROM applications WHERE candidate_id = $1`
            : `SELECT job_id FROM applications WHERE employee_id = $1`;
        
        const appliedResult = await db.query(appliedJobsQuery, [profileId]);
        const appliedJobIds = appliedResult.rows.map(r => r.job_id);

        // Get all published jobs
        let jobQuery = `
            SELECT j.id, j.title, j.department, j.location, j.job_type, j.is_remote,
                   j.salary_min, j.salary_max, j.salary_currency,
                   j.required_skills, j.experience_level, j.education_requirement,
                   j.positions_available, j.positions_filled,
                   j.created_at,
                   (SELECT COUNT(*) FROM applications WHERE job_id = j.id) as application_count
            FROM jobs j
            WHERE j.status = 'published'
        `;

        if (appliedJobIds.length > 0) {
            jobQuery += ` AND j.id NOT IN (${appliedJobIds.map((_, i) => `$${i + 1}`).join(',')})`;
        }

        const jobsResult = await db.query(
            appliedJobIds.length > 0 ? jobQuery : jobQuery,
            appliedJobIds.length > 0 ? appliedJobIds : []
        );

        // Calculate match score for each job
        const jobsWithScores = jobsResult.rows.map(job => {
            let matchScore = 0;
            let matchedSkills = [];
            let skillMatchCount = 0;

            // Get required skills from job (handle both string arrays and object arrays)
            const jobSkills = (job.required_skills || [])
                .map(s => extractSkillName(s).toLowerCase().trim())
                .filter(Boolean);
            
            // Calculate skill match
            if (jobSkills.length > 0 && normalizedSkills.length > 0) {
                for (const jobSkill of jobSkills) {
                    for (const userSkill of normalizedSkills) {
                        if (jobSkill.includes(userSkill) || userSkill.includes(jobSkill)) {
                            skillMatchCount++;
                            matchedSkills.push(jobSkill);
                            break;
                        }
                    }
                }
                matchScore += Math.min(70, (skillMatchCount / jobSkills.length) * 70);
            } else if (jobSkills.length === 0) {
                // No specific skills required, give partial score
                matchScore += 35;
            }

            // Education match (30 points max)
            if (userEducation && job.education_requirement) {
                const eduHierarchy = {
                    'high_school': 0, 'certificate': 1, 'diploma': 2, 'associate': 3,
                    'bachelor': 4, 'bachelors': 4, 'degree': 4,
                    'master': 5, 'masters': 5, 'mba': 5,
                    'phd': 6, 'doctorate': 6
                };
                
                const userEduLevel = eduHierarchy[userEducation.toLowerCase()] ?? 
                    (userEducation.toLowerCase().includes('master') ? 5 :
                     userEducation.toLowerCase().includes('bachelor') ? 4 :
                     userEducation.toLowerCase().includes('diploma') ? 2 : 0);
                
                const requiredEduLevel = eduHierarchy[job.education_requirement.toLowerCase()] ?? 
                    (job.education_requirement.toLowerCase().includes('master') ? 5 :
                     job.education_requirement.toLowerCase().includes('bachelor') ? 4 :
                     job.education_requirement.toLowerCase().includes('diploma') ? 2 : 0);

                if (userEduLevel >= requiredEduLevel) {
                    matchScore += 30;
                } else if (userEduLevel >= requiredEduLevel - 1) {
                    matchScore += 15; // Close to required
                }
            } else {
                matchScore += 15; // No education requirement or unknown
            }

            return {
                ...job,
                matchScore: Math.round(matchScore),
                matchedSkills: [...new Set(matchedSkills)],
                skillMatchCount
            };
        });

        // Sort by match score descending
        jobsWithScores.sort((a, b) => b.matchScore - a.matchScore);

        // Return top N recommendations
        const recommendations = jobsWithScores.slice(0, parseInt(limit));

        res.json({
            recommendations,
            userSkillsCount: normalizedSkills.length,
            totalAvailableJobs: jobsWithScores.length
        });

    } catch (error) {
        console.error('Get job recommendations error:', error);
        res.status(500).json({ error: 'Failed to fetch job recommendations' });
    }
});

// Get job by ID or slug
router.get('/:identifier', optionalAuth, async (req, res) => {
    try {
        const { identifier } = req.params;
        
        let query = `
            SELECT j.*, 
                   u.email as created_by_email,
                   (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id) as application_count,
                   (SELECT json_agg(json_build_object('id', s.id, 'name', s.name, 'category', s.category, 'is_required', js.is_required, 'min_proficiency', js.min_proficiency))
                    FROM job_skills js JOIN skills s ON js.skill_id = s.id WHERE js.job_id = j.id) as skills
            FROM jobs j
            LEFT JOIN users u ON j.created_by = u.id
        `;
        
        // Check if identifier is UUID or slug
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
        
        if (isUUID) {
            query += ` WHERE j.id = $1`;
        } else {
            query += ` WHERE j.slug = $1`;
        }

        const result = await db.query(query, [identifier]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Job not found' });
        }

        const job = result.rows[0];

        // Check access for internal jobs
        if (job.is_internal_only && (!req.user || (req.user.role !== 'employee' && req.user.role !== 'hr_manager' && req.user.role !== 'admin'))) {
            return res.status(403).json({ error: 'This is an internal job posting' });
        }

        // Increment view count
        await db.query('UPDATE jobs SET view_count = view_count + 1 WHERE id = $1', [job.id]);

        // Check if current user has applied
        if (req.user) {
            let applied = false;
            if (req.user.role === 'candidate') {
                const appResult = await db.query(`
                    SELECT a.id, a.status FROM applications a
                    JOIN candidate_profiles cp ON a.candidate_id = cp.id
                    WHERE a.job_id = $1 AND cp.user_id = $2
                `, [job.id, req.user.id]);
                if (appResult.rows.length > 0) {
                    job.userApplication = appResult.rows[0];
                }
            } else if (req.user.role === 'employee') {
                const appResult = await db.query(`
                    SELECT a.id, a.status FROM applications a
                    JOIN employee_profiles ep ON a.employee_id = ep.id
                    WHERE a.job_id = $1 AND ep.user_id = $2
                `, [job.id, req.user.id]);
                if (appResult.rows.length > 0) {
                    job.userApplication = appResult.rows[0];
                }
            }
        }

        res.json(job);

    } catch (error) {
        console.error('Get job error:', error);
        res.status(500).json({ error: 'Failed to fetch job' });
    }
});

// Create job
router.post('/', authenticate, authorize('admin', 'hr_manager', 'recruiter'), jobValidation, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const {
            title, department, location, job_type, experience_level,
            min_experience_years, max_experience_years, education_requirement,
            salary_min, salary_max, salary_currency, show_salary,
            description, responsibilities, requirements, benefits,
            required_skills, preferred_skills, competency_requirements,
            is_internal_only, is_remote, closes_at, positions_available,
            distribute_to // Array of platforms to distribute to
        } = req.body;

        // Ensure TEXT[] fields are proper arrays
        const responsibilitiesArr = Array.isArray(responsibilities) ? responsibilities : [];
        const requirementsArr = Array.isArray(requirements) ? requirements : [];
        const benefitsArr = Array.isArray(benefits) ? benefits : [];

        const result = await db.query(`
            INSERT INTO jobs (
                title, department, location, job_type, experience_level,
                min_experience_years, max_experience_years, education_requirement,
                salary_min, salary_max, salary_currency, show_salary,
                description, responsibilities, requirements, benefits,
                required_skills, preferred_skills, competency_requirements,
                is_internal_only, is_remote, closes_at, positions_available,
                created_by, status
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, 'draft')
            RETURNING *
        `, [
            title, department, location, job_type, experience_level,
            min_experience_years, max_experience_years, education_requirement,
            salary_min, salary_max, salary_currency || 'USD', show_salary || false,
            description, responsibilitiesArr, requirementsArr, benefitsArr,
            JSON.stringify(required_skills || []), JSON.stringify(preferred_skills || []), JSON.stringify(competency_requirements || []),
            is_internal_only || false, is_remote || false, closes_at, positions_available || 1,
            req.user.id
        ]);

        const job = result.rows[0];

        // Add skills to job
        if (required_skills && Array.isArray(required_skills)) {
            for (const skill of required_skills) {
                // Find or create skill
                let skillResult = await db.query(
                    'SELECT id FROM skills WHERE normalized_name = $1',
                    [skill.name.toLowerCase().replace(/[^a-z0-9]/g, '_')]
                );
                
                let skillId;
                if (skillResult.rows.length === 0) {
                    const newSkill = await db.query(`
                        INSERT INTO skills (name, normalized_name, category)
                        VALUES ($1, $2, 'technical')
                        RETURNING id
                    `, [skill.name, skill.name.toLowerCase().replace(/[^a-z0-9]/g, '_')]);
                    skillId = newSkill.rows[0].id;
                } else {
                    skillId = skillResult.rows[0].id;
                }

                await db.query(`
                    INSERT INTO job_skills (job_id, skill_id, is_required, min_proficiency, min_years_experience, weight)
                    VALUES ($1, $2, true, $3, $4, $5)
                    ON CONFLICT (job_id, skill_id) DO NOTHING
                `, [job.id, skillId, skill.proficiency || 'intermediate', skill.years || 0, skill.weight || 1.0]);
            }
        }

        // Generate AI analysis for the job
        aiService.analyzeJob(job).then(async (analysis) => {
            await db.query('UPDATE jobs SET ai_job_analysis = $1, ai_ideal_candidate_profile = $2 WHERE id = $3', 
                [JSON.stringify(analysis.jobAnalysis), JSON.stringify(analysis.idealCandidate), job.id]);
        }).catch(console.error);

        // Log action
        await db.query(`
            INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values)
            VALUES ($1, 'create', 'job', $2, $3)
        `, [req.user.id, job.id, JSON.stringify({ title, department })]);

        res.status(201).json(job);

    } catch (error) {
        console.error('Create job error:', error);
        res.status(500).json({ error: 'Failed to create job' });
    }
});

// Update job
router.put('/:id', authenticate, authorize('admin', 'hr_manager', 'recruiter'), async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        
        // Get current job
        const currentJob = await db.query('SELECT * FROM jobs WHERE id = $1', [id]);
        if (currentJob.rows.length === 0) {
            return res.status(404).json({ error: 'Job not found' });
        }

        // Build update query dynamically
        const allowedFields = [
            'title', 'department', 'location', 'job_type', 'experience_level',
            'min_experience_years', 'max_experience_years', 'education_requirement',
            'salary_min', 'salary_max', 'salary_currency', 'show_salary',
            'description', 'responsibilities', 'requirements', 'benefits',
            'required_skills', 'preferred_skills', 'competency_requirements',
            'is_internal_only', 'is_remote', 'closes_at', 'positions_available'
        ];

        // Fields that are TEXT[] (PostgreSQL arrays) vs JSONB
        const textArrayFields = ['responsibilities', 'requirements', 'benefits'];
        const jsonbFields = ['required_skills', 'preferred_skills', 'competency_requirements'];

        const setClauses = [];
        const values = [];
        let paramIndex = 1;

        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                setClauses.push(`${field} = $${paramIndex++}`);
                
                let value = updates[field];
                
                if (textArrayFields.includes(field)) {
                    // TEXT[] fields - pass as array directly (pg driver handles it)
                    value = Array.isArray(value) ? value : [];
                } else if (jsonbFields.includes(field)) {
                    // JSONB fields - stringify objects
                    value = typeof value === 'object' ? JSON.stringify(value) : value;
                }
                
                values.push(value);
            }
        }

        if (setClauses.length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        values.push(id);
        const result = await db.query(`
            UPDATE jobs SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE id = $${paramIndex}
            RETURNING *
        `, values);

        res.json(result.rows[0]);

    } catch (error) {
        console.error('Update job error:', error);
        console.error('Update job error message:', error.message);
        console.error('Update job error stack:', error.stack);
        res.status(500).json({ error: 'Failed to update job', details: error.message });
    }
});

// Publish job
router.post('/:id/publish', authenticate, authorize('admin', 'hr_manager'), async (req, res) => {
    try {
        const { id } = req.params;
        const { distribute_to } = req.body; // Array of platforms

        const result = await db.query(`
            UPDATE jobs SET status = 'published', published_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND status = 'draft'
            RETURNING *
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Job not found or already published' });
        }

        const job = result.rows[0];

        // Distribute to platforms
        if (distribute_to && Array.isArray(distribute_to)) {
            for (const platform of distribute_to) {
                jobDistributionService.distributeJob(job, platform).catch(console.error);
            }
        }

        // AUTO-MATCH: Find matching internal employees, notify them and HR
        (async () => {
            try {
                const matches = await aiService.matchEmployeesToJob(job);

                if (matches.length > 0) {
                    // Get job skills for the notification
                    const skillsResult = await db.query(`
                        SELECT s.name FROM job_skills js JOIN skills s ON js.skill_id = s.id WHERE js.job_id = $1
                    `, [job.id]);
                    const jobSkillNames = skillsResult.rows.map(r => r.name);

                    // Notify each matching employee
                    for (const match of matches.filter(m => m.overallScore >= 50)) {
                        await db.query(
                            `INSERT INTO notifications (user_id, title, message, type, link) VALUES ($1, $2, $3, $4, $5)`,
                            [
                                match.userId,
                                `New Job Match: ${job.title}`,
                                `A new ${job.department || ''} position "${job.title}" matches your profile. ${match.skillGaps.length > 0 ? `Skills to develop: ${match.skillGaps.slice(0, 3).join(', ')}.` : 'You have all required skills!'} Check it out and consider applying.`,
                                'job_match',
                                `/employee/opportunities?jobId=${job.id}`
                            ]
                        );

                        // Also send email to high-match employees
                        if (match.overallScore >= 70 && match.email) {
                            try {
                                const emailService = require('../services/email.service');
                                await emailService.sendEmail(
                                    match.email,
                                    `New Internal Opportunity: ${job.title} (${match.overallScore}% Match)`,
                                    `
                                        <h2>New Internal Opportunity Matching Your Skills!</h2>
                                        <p>Hi ${match.firstName},</p>
                                        <p>A new position has been posted that matches your profile:</p>
                                        <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
                                            <h3 style="margin: 0 0 8px 0; color: #1f2937;">${job.title}</h3>
                                            <p style="margin: 4px 0; color: #6b7280;"><strong>Department:</strong> ${job.department || 'N/A'}</p>
                                            <p style="margin: 4px 0; color: #6b7280;"><strong>Location:</strong> ${job.location || 'N/A'}</p>
                                            <p style="margin: 4px 0; color: #4f46e5;"><strong>Match Score:</strong> ${match.overallScore}%</p>
                                            ${jobSkillNames.length > 0 ? `<p style="margin: 4px 0; color: #6b7280;"><strong>Required Skills:</strong> ${jobSkillNames.join(', ')}</p>` : ''}
                                        </div>
                                        <p>Log in to view details and apply.</p>
                                    `
                                );
                            } catch (emailErr) {
                                console.error('Email to matched employee failed:', emailErr.message);
                            }
                        }
                    }

                    // Notify HR about matching employees
                    const hrUsers = await db.query("SELECT id FROM users WHERE role = 'hr_manager'");
                    const topMatches = matches.slice(0, 5);
                    const matchSummary = topMatches.map(m => `${m.firstName} ${m.lastName} (${m.overallScore}%)`).join(', ');

                    for (const hr of hrUsers.rows) {
                        await db.query(
                            `INSERT INTO notifications (user_id, title, message, type, link) VALUES ($1, $2, $3, $4, $5)`,
                            [
                                hr.id,
                                `${matches.length} Employee(s) Match: ${job.title}`,
                                `${matches.length} internal employee(s) match the new job "${job.title}". Top matches: ${matchSummary}. Consider internal candidates before external recruitment.`,
                                'job_match_hr',
                                `/hr/employees?matchJobId=${job.id}`
                            ]
                        );
                    }
                }
            } catch (matchError) {
                console.error('Auto-match employees error:', matchError);
            }
        })();

        res.json({ message: 'Job published successfully', job });

    } catch (error) {
        console.error('Publish job error:', error);
        res.status(500).json({ error: 'Failed to publish job' });
    }
});

// Close job
router.post('/:id/close', authenticate, authorize('admin', 'hr_manager'), async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.query(`
            UPDATE jobs SET status = 'closed'
            WHERE id = $1 AND status IN ('published', 'paused')
            RETURNING *
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Job not found or cannot be closed' });
        }

        res.json({ message: 'Job closed successfully', job: result.rows[0] });

    } catch (error) {
        console.error('Close job error:', error);
        res.status(500).json({ error: 'Failed to close job' });
    }
});

// Get job distribution status
router.get('/:id/distributions', authenticate, authorize('admin', 'hr_manager'), async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.query(`
            SELECT * FROM job_distributions WHERE job_id = $1 ORDER BY created_at DESC
        `, [id]);

        res.json(result.rows);

    } catch (error) {
        console.error('Get distributions error:', error);
        res.status(500).json({ error: 'Failed to fetch distribution status' });
    }
});

// Generate job flyer image (public endpoint for sharing)
router.get('/:id/flyer', async (req, res) => {
    try {
        const { id } = req.params;
        const { download } = req.query;

        const job = await db.query('SELECT * FROM jobs WHERE id = $1', [id]);
        if (job.rows.length === 0) {
            return res.status(404).json({ error: 'Job not found' });
        }

        const jobFlyerService = require('../services/jobFlyer.service');
        const companyName = process.env.COMPANY_NAME || 'Our Company';
        
        const flyerPath = await jobFlyerService.generateFlyer(job.rows[0], companyName);
        
        // Set CORS headers for image access
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'image/png');
        
        if (download === 'true') {
            res.download(flyerPath, `job-flyer-${job.rows[0].title.replace(/[^a-z0-9]/gi, '-')}.png`);
        } else {
            res.sendFile(flyerPath);
        }
    } catch (error) {
        console.error('Generate flyer error:', error);
        res.status(500).json({ error: 'Failed to generate job flyer' });
    }
});

// Distribute job to platform(s)
router.post('/:id/distribute', authenticate, authorize('admin', 'hr_manager'), async (req, res) => {
    try {
        const { id } = req.params;
        const { platforms } = req.body;

        if (!platforms || !Array.isArray(platforms) || platforms.length === 0) {
            return res.status(400).json({ error: 'Please select at least one platform' });
        }

        const job = await db.query('SELECT * FROM jobs WHERE id = $1', [id]);
        if (job.rows.length === 0) {
            return res.status(404).json({ error: 'Job not found' });
        }

        if (job.rows[0].status !== 'published') {
            return res.status(400).json({ error: 'Job must be published before distribution' });
        }

        const results = await jobDistributionService.distributeJob(job.rows[0], platforms);

        // Store distribution records in database
        const successful = [];
        const failed = [];

        for (const result of results) {
            try {
                // Check if distribution already exists for this job/platform
                const existing = await db.query(
                    'SELECT id FROM job_distributions WHERE job_id = $1 AND platform = $2',
                    [id, result.platform]
                );

                if (existing.rows.length > 0) {
                    // Update existing record
                    await db.query(`
                        UPDATE job_distributions 
                        SET status = $1, external_job_id = $2, external_url = $3, 
                            published_at = $4, error_message = $5, updated_at = CURRENT_TIMESTAMP
                        WHERE id = $6
                    `, [
                        result.success ? 'published' : 'failed',
                        result.postId || null,
                        result.url || null,
                        result.success ? new Date() : null,
                        result.error || null,
                        existing.rows[0].id
                    ]);
                } else {
                    // Insert new record
                    await db.query(`
                        INSERT INTO job_distributions (job_id, platform, status, external_job_id, external_url, published_at, error_message)
                        VALUES ($1, $2, $3, $4, $5, $6, $7)
                    `, [
                        id,
                        result.platform,
                        result.success ? 'published' : 'failed',
                        result.postId || null,
                        result.url || null,
                        result.success ? new Date() : null,
                        result.error || null
                    ]);
                }

                if (result.success) {
                    successful.push(result.platform);
                } else {
                    failed.push({ platform: result.platform, error: result.error });
                }
            } catch (dbError) {
                console.error('Error storing distribution record:', dbError);
                failed.push({ platform: result.platform, error: 'Failed to store record' });
            }
        }

        res.json({ 
            message: 'Distribution completed', 
            successful,
            failed,
            results
        });

    } catch (error) {
        console.error('Distribute job error:', error);
        res.status(500).json({ error: 'Failed to distribute job' });
    }
});

// Send job via email to multiple recipients
router.post('/:id/share-email', authenticate, authorize('admin', 'hr_manager', 'recruiter'), async (req, res) => {
    try {
        const { id } = req.params;
        const { emails, subject, message } = req.body;

        if (!emails || !Array.isArray(emails) || emails.length === 0) {
            return res.status(400).json({ error: 'Please provide at least one email address' });
        }

        const job = await db.query(`
            SELECT j.*, 
                   (SELECT array_agg(s.name) FROM job_skills js JOIN skills s ON js.skill_id = s.id WHERE js.job_id = j.id) as skill_names
            FROM jobs j WHERE j.id = $1
        `, [id]);

        if (job.rows.length === 0) {
            return res.status(404).json({ error: 'Job not found' });
        }

        const jobData = job.rows[0];
        const jobUrl = `${config.frontendUrl}/jobs/${id}`;

        // Send email to each recipient
        const emailService = require('../services/email.service');
        const emailPromises = emails.map(async (email) => {
            try {
                await emailService.sendEmail({
                    to: email,
                    subject: subject || `Job Opportunity: ${jobData.title}`,
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                            <h2 style="color: #333;">Job Opportunity: ${jobData.title}</h2>
                            ${message ? `<p style="color: #666;">${message}</p>` : ''}
                            <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
                                <h3 style="margin: 0 0 10px 0; color: #333;">${jobData.title}</h3>
                                <p style="margin: 5px 0; color: #666;">
                                    <strong>Department:</strong> ${jobData.department || 'N/A'}
                                </p>
                                <p style="margin: 5px 0; color: #666;">
                                    <strong>Location:</strong> ${jobData.location || 'N/A'} ${jobData.is_remote ? '(Remote Available)' : ''}
                                </p>
                                <p style="margin: 5px 0; color: #666;">
                                    <strong>Type:</strong> ${jobData.job_type?.replace('_', ' ') || 'Full-time'}
                                </p>
                                ${jobData.salary_min && jobData.show_salary ? `
                                <p style="margin: 5px 0; color: #666;">
                                    <strong>Salary:</strong> ${jobData.salary_currency || '$'}${jobData.salary_min.toLocaleString()} - ${jobData.salary_currency || '$'}${jobData.salary_max?.toLocaleString() || 'N/A'}
                                </p>
                                ` : ''}
                                <p style="margin: 15px 0 5px 0; color: #333;">${jobData.description?.substring(0, 300)}${jobData.description?.length > 300 ? '...' : ''}</p>
                                ${jobData.skill_names?.length > 0 ? `
                                <p style="margin: 15px 0 5px 0; color: #666;">
                                    <strong>Required Skills:</strong> ${jobData.skill_names.join(', ')}
                                </p>
                                ` : ''}
                            </div>
                            <div style="text-align: center; margin: 20px 0;">
                                <a href="${jobUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                                    View Full Job Details
                                </a>
                            </div>
                            <p style="color: #999; font-size: 12px; text-align: center;">
                                This job was shared with you by ${req.user.email || 'our recruitment team'}.
                            </p>
                        </div>
                    `
                });
                return { email, success: true };
            } catch (error) {
                return { email, success: false, error: error.message };
            }
        });

        const results = await Promise.all(emailPromises);
        const successful = results.filter(r => r.success).map(r => r.email);
        const failed = results.filter(r => !r.success);

        res.json({
            message: `Email sent to ${successful.length} recipient(s)`,
            successful,
            failed
        });

    } catch (error) {
        console.error('Share job via email error:', error);
        res.status(500).json({ error: 'Failed to share job via email' });
    }
});

// Generate shareable link for a job
router.get('/:id/share-link', authenticate, async (req, res) => {
    try {
        const { id } = req.params;

        const job = await db.query('SELECT id, title, status FROM jobs WHERE id = $1', [id]);
        if (job.rows.length === 0) {
            return res.status(404).json({ error: 'Job not found' });
        }

        const jobUrl = `${config.frontendUrl}/jobs/${id}`;
        const linkedInShareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(jobUrl)}`;
        const twitterShareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check out this job opportunity: ${job.rows[0].title}`)}&url=${encodeURIComponent(jobUrl)}`;
        const facebookShareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(jobUrl)}`;

        res.json({
            jobUrl,
            shareLinks: {
                linkedin: linkedInShareUrl,
                twitter: twitterShareUrl,
                facebook: facebookShareUrl,
                copy: jobUrl
            }
        });

    } catch (error) {
        console.error('Generate share link error:', error);
        res.status(500).json({ error: 'Failed to generate share link' });
    }
});

// Note: /distributions/summary and /meta/* routes moved before /:identifier route

// Delete job
router.delete('/:id', authenticate, authorize('admin', 'hr_manager'), async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.query('DELETE FROM jobs WHERE id = $1 RETURNING id, title', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Job not found' });
        }

        res.json({ message: 'Job deleted successfully' });

    } catch (error) {
        console.error('Delete job error:', error);
        res.status(500).json({ error: 'Failed to delete job' });
    }
});

module.exports = router;
