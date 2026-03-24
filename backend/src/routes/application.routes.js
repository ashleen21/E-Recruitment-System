const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { uploadResume, handleUploadError } = require('../middleware/upload.middleware');
const aiService = require('../services/ai.service');
const emailService = require('../services/email.service');
const resumeParser = require('../services/resumeParser.service');

// Get all applications (HR view)
router.get('/', authenticate, authorize('admin', 'hr_manager', 'recruiter'), async (req, res) => {
    try {
        const { job_id, jobId, status, search, min_score, page = 1, limit = 20, sort = 'submitted_at', order = 'DESC' } = req.query;
        const effectiveJobId = job_id || jobId;
        const offset = (page - 1) * limit;

        let query = `
            SELECT a.*,
                   j.title as job_title, j.department,
                   COALESCE(cp.first_name, ep.first_name) as first_name, 
                   COALESCE(cp.last_name, ep.last_name) as last_name,
                   COALESCE(cp.first_name, ep.first_name) || ' ' || COALESCE(cp.last_name, ep.last_name) as candidate_name,
                   COALESCE(cp.location, ep.location) as candidate_location,
                   cp.years_of_experience, 
                   COALESCE(cp.current_job_title, ep.job_title) as current_job_title,
                   u.email as candidate_email,
                   COALESCE(a.resume_url, (SELECT r.file_path FROM resumes r WHERE r.candidate_id = cp.id ORDER BY r.is_primary DESC, r.created_at DESC LIMIT 1), (SELECT r.file_path FROM resumes r WHERE r.employee_id = ep.id ORDER BY r.is_primary DESC, r.created_at DESC LIMIT 1)) as resume_url
            FROM applications a
            JOIN jobs j ON a.job_id = j.id
            LEFT JOIN candidate_profiles cp ON a.candidate_id = cp.id
            LEFT JOIN employee_profiles ep ON a.employee_id = ep.id
            LEFT JOIN users u ON COALESCE(cp.user_id, ep.user_id) = u.id
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (effectiveJobId) {
            query += ` AND a.job_id = $${paramIndex++}`;
            params.push(effectiveJobId);
        }

        if (status) {
            query += ` AND a.status = $${paramIndex++}`;
            params.push(status);
        }

        if (search) {
            query += ` AND (cp.first_name ILIKE $${paramIndex} OR cp.last_name ILIKE $${paramIndex} OR ep.first_name ILIKE $${paramIndex} OR ep.last_name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex} OR j.title ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        if (min_score) {
            query += ` AND a.ai_overall_score >= $${paramIndex++}`;
            params.push(parseFloat(min_score));
        }

        // Count
        const fromIndex = query.indexOf('FROM applications');
        const countQuery = 'SELECT COUNT(*) ' + query.substring(fromIndex);
        const countResult = await db.query(countQuery, params);
        const total = parseInt(countResult.rows[0].count);

        // Sort and paginate
        const validSorts = ['ai_overall_score', 'submitted_at', 'status', 'created_at'];
        const sortField = validSorts.includes(sort) ? sort : 'submitted_at';
        const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        query += ` ORDER BY a.${sortField} ${sortOrder} NULLS LAST LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
        params.push(limit, offset);

        const result = await db.query(query, params);

        // Auto-calculate match scores for applications that don't have one (fire and forget)
        const appsWithoutScore = result.rows.filter(a => !a.resume_match_score);
        if (appsWithoutScore.length > 0) {
            (async () => {
                for (const app of appsWithoutScore) {
                    try {
                        const resumeResult = await db.query(`
                            SELECT COALESCE(rc.extracted_skills, re.extracted_skills) as parsed_skills,
                                   COALESCE(rc.extracted_education, re.extracted_education) as parsed_education,
                                   COALESCE(rc.extracted_experience, re.extracted_experience) as parsed_experience,
                                   COALESCE(rc.raw_text, re.raw_text) as resume_text
                            FROM applications a
                            LEFT JOIN candidate_profiles cp ON a.candidate_id = cp.id
                            LEFT JOIN employee_profiles ep ON a.employee_id = ep.id
                            LEFT JOIN resumes rc ON rc.candidate_id = cp.id
                            LEFT JOIN resumes re ON re.employee_id = ep.id
                            WHERE a.id = $1
                            ORDER BY COALESCE(rc.is_primary, re.is_primary) DESC,
                                     COALESCE(rc.created_at, re.created_at) DESC
                            LIMIT 1
                        `, [app.id]);

                        if (resumeResult.rows.length > 0 && resumeResult.rows[0].resume_text) {
                            const rd = resumeResult.rows[0];
                            const jobResult = await db.query('SELECT required_skills, min_experience_years, education_requirement FROM jobs WHERE id = $1', [app.job_id]);
                            const job = jobResult.rows[0] || {};
                            const matchScore = await resumeParser.calculateJobMatchScore(
                                { skills: rd.parsed_skills || [], education: rd.parsed_education || [], experience: rd.parsed_experience || [] },
                                { required_skills: job.required_skills || [], min_experience_years: job.min_experience_years || 0, education_level: job.education_requirement || '' },
                                rd.resume_text || ''
                            );
                            await db.query('UPDATE applications SET resume_match_score = $1, resume_match_details = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
                                [matchScore.overallScore, JSON.stringify(matchScore), app.id]);
                            console.log(`Auto-calculated match score for ${app.first_name} ${app.last_name}: ${matchScore.overallScore}%`);
                        }
                    } catch (err) {
                        console.error(`Auto match score error for ${app.id}:`, err.message);
                    }
                }
            })();
        }

        res.json({
            applications: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('Get applications error:', error);
        res.status(500).json({ error: 'Failed to fetch applications' });
    }
});

// Get my applications (candidate view)
router.get('/my-applications', authenticate, async (req, res) => {
    try {
        let query;
        let params = [];

        if (req.user.role === 'candidate') {
            query = `
                SELECT a.*, 
                       j.title as job_title, j.department, j.location as job_location,
                       j.description as job_description, j.requirements as job_requirements,
                       j.responsibilities as job_responsibilities, j.required_skills,
                       j.salary_min, j.salary_max, j.salary_currency,
                       j.job_type, j.experience_level, j.education_requirement,
                       j.benefits, j.closes_at as application_deadline, j.is_remote,
                       j.status as job_status,
                       (SELECT json_agg(json_build_object('id', i.id, 'type', i.interview_type, 'date', i.scheduled_date, 'time', i.start_time, 'status', i.status, 'meeting_link', i.meeting_link, 'location', i.location))
                        FROM interviews i WHERE i.application_id = a.id) as interviews
                FROM applications a
                JOIN jobs j ON a.job_id = j.id
                JOIN candidate_profiles cp ON a.candidate_id = cp.id
                WHERE cp.user_id = $1
                ORDER BY a.submitted_at DESC
            `;
            params = [req.user.id];
        } else if (req.user.role === 'employee') {
            query = `
                SELECT a.*, 
                       j.title as job_title, j.department, j.location as job_location,
                       j.description as job_description, j.requirements as job_requirements,
                       j.responsibilities as job_responsibilities, j.required_skills,
                       j.salary_min, j.salary_max, j.salary_currency,
                       j.job_type, j.experience_level, j.education_requirement,
                       j.benefits, j.closes_at as application_deadline, j.is_remote,
                       j.status as job_status,
                       (SELECT json_agg(json_build_object('id', i.id, 'type', i.interview_type, 'date', i.scheduled_date, 'time', i.start_time, 'status', i.status, 'meeting_link', i.meeting_link, 'location', i.location))
                        FROM interviews i WHERE i.application_id = a.id) as interviews
                FROM applications a
                JOIN jobs j ON a.job_id = j.id
                JOIN employee_profiles ep ON a.employee_id = ep.id
                WHERE ep.user_id = $1
                ORDER BY a.submitted_at DESC
            `;
            params = [req.user.id];
        } else {
            return res.status(403).json({ error: 'Access denied' });
        }

        const result = await db.query(query, params);
        res.json(result.rows);

    } catch (error) {
        console.error('Get my applications error:', error);
        res.status(500).json({ error: 'Failed to fetch applications' });
    }
});

// Get application by ID
router.get('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.query(`
            SELECT a.*,
                   j.title as job_title, j.department, j.description as job_description,
                   j.required_skills, j.requirements,
                   COALESCE(cp.first_name, ep.first_name) as first_name, 
                   COALESCE(cp.last_name, ep.last_name) as last_name, 
                   COALESCE(cp.phone, ep.phone) as phone, 
                   COALESCE(cp.location, ep.location) as candidate_location,
                   cp.years_of_experience, 
                   COALESCE(cp.current_job_title, ep.job_title) as current_job_title, 
                   cp.linkedin_url,
                   cp.summary as candidate_summary, cp.portfolio_url, 
                   cp.profile_photo_url,
                   u.email as candidate_email,
                   COALESCE(a.resume_url, (SELECT r.file_path FROM resumes r WHERE r.candidate_id = cp.id ORDER BY r.is_primary DESC, r.created_at DESC LIMIT 1), (SELECT r.file_path FROM resumes r WHERE r.employee_id = ep.id ORDER BY r.is_primary DESC, r.created_at DESC LIMIT 1)) as resume_url,
                   (SELECT json_agg(json_build_object(
                       'id', i.id, 'type', i.interview_type, 'date', i.scheduled_date, 
                       'start_time', i.start_time, 'end_time', i.end_time, 'status', i.status,
                       'location', i.location, 'meeting_link', i.meeting_link,
                       'feedback', (SELECT json_agg(json_build_object('rating', f.overall_rating, 'recommendation', f.recommendation))
                                    FROM interview_feedback f WHERE f.interview_id = i.id)
                   )) FROM interviews i WHERE i.application_id = a.id) as interviews,
                   (SELECT json_agg(json_build_object(
                       'name', s.name, 'level', cs.proficiency_level, 'category', s.category
                   )) FROM candidate_skills cs 
                   JOIN skills s ON cs.skill_id = s.id 
                   WHERE cs.candidate_id = cp.id) as skills,
                   (SELECT json_agg(json_build_object(
                       'name', s.name, 'level', es.proficiency_level, 'category', s.category
                   )) FROM employee_skills es 
                   JOIN skills s ON es.skill_id = s.id 
                   WHERE es.employee_id = ep.id) as employee_skills,
                   (SELECT json_agg(json_build_object(
                       'institution', er.institution_name, 'degree', er.degree_type, 
                       'fieldOfStudy', er.field_of_study, 'startDate', er.start_date,
                       'endDate', er.end_date, 'gpa', er.gpa
                   )) FROM education_records er WHERE er.candidate_id = cp.id) as education,
                   (SELECT json_agg(json_build_object(
                       'company', we.company_name, 'title', we.job_title, 
                       'location', we.location, 'startDate', we.start_date,
                       'endDate', we.end_date, 'isCurrent', we.is_current, 'description', we.description
                   )) FROM work_experience we WHERE we.candidate_id = cp.id) as experience,
                   (SELECT row_to_json(r) FROM (
                       SELECT r.id as resume_id, r.file_name as resume_filename, r.file_path as resume_file_path,
                              r.status as resume_status,
                              r.raw_text, r.parsed_data, r.extracted_contact, r.extracted_summary,
                              r.extracted_skills, r.extracted_experience, r.extracted_education,
                              r.extracted_certifications, r.extracted_personal_info, r.extracted_references,
                              r.extraction_confidence, r.parsing_error,
                              r.parsed_at
                       FROM resumes r
                       WHERE r.candidate_id = cp.id OR r.employee_id = ep.id
                       ORDER BY r.is_primary DESC, r.created_at DESC
                       LIMIT 1
                   ) r) as parsed_resume
            FROM applications a
            JOIN jobs j ON a.job_id = j.id
            LEFT JOIN candidate_profiles cp ON a.candidate_id = cp.id
            LEFT JOIN employee_profiles ep ON a.employee_id = ep.id
            LEFT JOIN users u ON COALESCE(cp.user_id, ep.user_id) = u.id
            WHERE a.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Application not found' });
        }

        const application = result.rows[0];

        // Check access
        if (req.user.role === 'candidate') {
            const profile = await db.query('SELECT id FROM candidate_profiles WHERE user_id = $1', [req.user.id]);
            if (profile.rows.length === 0 || profile.rows[0].id !== application.candidate_id) {
                return res.status(403).json({ error: 'Access denied' });
            }
        }

        // Auto-calculate match score if not yet calculated (fire and forget)
        if (!application.resume_match_score) {
            (async () => {
                try {
                    const resumeResult = await db.query(`
                        SELECT COALESCE(rc.extracted_skills, re.extracted_skills) as parsed_skills,
                               COALESCE(rc.extracted_education, re.extracted_education) as parsed_education,
                               COALESCE(rc.extracted_experience, re.extracted_experience) as parsed_experience,
                               COALESCE(rc.raw_text, re.raw_text) as resume_text
                        FROM applications a
                        LEFT JOIN candidate_profiles cp ON a.candidate_id = cp.id
                        LEFT JOIN employee_profiles ep ON a.employee_id = ep.id
                        LEFT JOIN resumes rc ON rc.candidate_id = cp.id
                        LEFT JOIN resumes re ON re.employee_id = ep.id
                        WHERE a.id = $1
                        ORDER BY COALESCE(rc.is_primary, re.is_primary) DESC,
                                 COALESCE(rc.created_at, re.created_at) DESC
                        LIMIT 1
                    `, [application.id]);

                    if (resumeResult.rows.length > 0 && resumeResult.rows[0].resume_text) {
                        const rd = resumeResult.rows[0];
                        const jobResult = await db.query('SELECT required_skills, min_experience_years, education_requirement FROM jobs WHERE id = $1', [application.job_id]);
                        const job = jobResult.rows[0] || {};
                        const matchScore = await resumeParser.calculateJobMatchScore(
                            { skills: rd.parsed_skills || [], education: rd.parsed_education || [], experience: rd.parsed_experience || [] },
                            { required_skills: job.required_skills || [], min_experience_years: job.min_experience_years || 0, education_level: job.education_requirement || '' },
                            rd.resume_text || ''
                        );
                        await db.query('UPDATE applications SET resume_match_score = $1, resume_match_details = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
                            [matchScore.overallScore, JSON.stringify(matchScore), application.id]);
                        console.log(`Auto-calculated match score for application ${application.id}: ${matchScore.overallScore}%`);
                    }
                } catch (err) {
                    console.error('Auto match score error:', err.message);
                }
            })();
        }

        res.json(application);

    } catch (error) {
        console.error('Get application error:', error);
        res.status(500).json({ error: 'Failed to fetch application' });
    }
});

// Apply for a job
router.post('/', authenticate, uploadResume, handleUploadError, async (req, res) => {
    try {
        const { job_id, cover_letter, screening_answers } = req.body;

        // Get job details
        const jobResult = await db.query('SELECT * FROM jobs WHERE id = $1', [job_id]);
        if (jobResult.rows.length === 0) {
            return res.status(404).json({ error: 'Job not found' });
        }

        const job = jobResult.rows[0];

        // Check if job is open
        if (job.status !== 'published') {
            return res.status(400).json({ error: 'This job is not accepting applications' });
        }

        // Check internal job access
        if (job.is_internal_only && req.user.role !== 'employee') {
            return res.status(403).json({ error: 'This is an internal job posting' });
        }

        let candidateId = null;
        let employeeId = null;

        // Get profile based on role
        if (req.user.role === 'candidate') {
            const profile = await db.query('SELECT id FROM candidate_profiles WHERE user_id = $1', [req.user.id]);
            if (profile.rows.length === 0) {
                return res.status(400).json({ error: 'Please complete your profile first' });
            }
            candidateId = profile.rows[0].id;
        } else if (req.user.role === 'employee') {
            const profile = await db.query('SELECT id FROM employee_profiles WHERE user_id = $1', [req.user.id]);
            if (profile.rows.length === 0) {
                return res.status(400).json({ error: 'Profile not found' });
            }
            employeeId = profile.rows[0].id;
        } else {
            return res.status(403).json({ error: 'Only candidates and employees can apply' });
        }

        // Check for existing application (excluding withdrawn ones - candidates can re-apply after withdrawal)
        const existingApp = await db.query(
            'SELECT id, status FROM applications WHERE job_id = $1 AND (candidate_id = $2 OR employee_id = $3)',
            [job_id, candidateId, employeeId]
        );

        if (existingApp.rows.length > 0) {
            // If the existing application was withdrawn, delete it so candidate can re-apply
            if (existingApp.rows[0].status === 'withdrawn') {
                await db.query('DELETE FROM applications WHERE id = $1', [existingApp.rows[0].id]);
            } else {
                return res.status(400).json({ error: 'You have already applied for this job' });
            }
        }

        // Get resume URL if uploaded
        const resumeUrl = req.file ? `/uploads/resumes/${req.file.filename}` : null;

        // Create application
        const result = await db.query(`
            INSERT INTO applications (job_id, candidate_id, employee_id, cover_letter, resume_url, screening_questions_answers, status)
            VALUES ($1, $2, $3, $4, $5, $6, 'submitted')
            RETURNING *
        `, [job_id, candidateId, employeeId, cover_letter, resumeUrl, JSON.stringify(screening_answers)]);

        const application = result.rows[0];

        // Trigger AI screening asynchronously (uses GPT-4o-mini via resume parser)
        aiService.screenApplication(application, job).then(async (scores) => {
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
            console.log(`Unified AI score for application ${application.id}: ${scores.overallScore}%`);
        }).catch(console.error);

        // Send confirmation email
        const userResult = await db.query('SELECT email FROM users WHERE id = $1', [req.user.id]);
        emailService.sendApplicationConfirmation(userResult.rows[0].email, job.title).catch(console.error);

        res.status(201).json({
            message: 'Application submitted successfully',
            application
        });

    } catch (error) {
        console.error('Apply error:', error);
        res.status(500).json({ error: 'Failed to submit application' });
    }
});

// Update application status (HR)
router.patch('/:id/status', authenticate, authorize('admin', 'hr_manager', 'recruiter'), async (req, res) => {
    try {
        const { id } = req.params;
        const { status, notes } = req.body;

        const validStatuses = [
            'pending', 'submitted', 'under_review', 'shortlisted', 'interview_scheduled',
            'interviewed', 'offer_extended', 'offer_accepted', 'offer_declined',
            'hired', 'rejected', 'withdrawn'
        ];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        // Prevent changing status of withdrawn applications
        const currentApp = await db.query('SELECT status FROM applications WHERE id = $1', [id]);
        if (currentApp.rows.length > 0 && currentApp.rows[0].status === 'withdrawn') {
            return res.status(400).json({ error: 'Cannot change status of a withdrawn application' });
        }

        const result = await db.query(`
            UPDATE applications SET status = $1, notes = COALESCE($2, notes), reviewed_by = $3, reviewed_at = CURRENT_TIMESTAMP
            WHERE id = $4
            RETURNING *
        `, [status, notes, req.user.id, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Application not found' });
        }

        const application = result.rows[0];

        // Send status update email to candidate
        const candidateEmail = await db.query(`
            SELECT u.email, COALESCE(cp.first_name, ep.first_name) as first_name, j.title as job_title
            FROM applications a
            LEFT JOIN candidate_profiles cp ON a.candidate_id = cp.id
            LEFT JOIN employee_profiles ep ON a.employee_id = ep.id
            LEFT JOIN users u ON cp.user_id = u.id OR ep.user_id = u.id
            LEFT JOIN jobs j ON a.job_id = j.id
            WHERE a.id = $1
        `, [id]);

        if (candidateEmail.rows.length > 0) {
            emailService.sendStatusUpdateEmail(
                candidateEmail.rows[0].email,
                candidateEmail.rows[0].first_name,
                candidateEmail.rows[0].job_title,
                status
            ).catch(console.error);

            // Create in-app notification for the candidate/employee
            const statusMessages = {
                'under_review': 'Your application is being reviewed',
                'shortlisted': 'Congratulations! You have been shortlisted',
                'interview_scheduled': 'An interview has been scheduled for you',
                'interviewed': 'Your interview has been completed',
                'offer_extended': 'Great news! You have received a job offer',
                'offer_accepted': 'Your offer has been accepted',
                'offer_declined': 'Your offer has been declined',
                'hired': 'Congratulations! You have been hired',
                'rejected': 'Unfortunately, your application was not successful'
            };

            const statusIcons = {
                'under_review': 'review',
                'shortlisted': 'shortlist',
                'interview_scheduled': 'interview',
                'interviewed': 'interview',
                'offer_extended': 'offer',
                'offer_accepted': 'hired',
                'offer_declined': 'rejected',
                'hired': 'hired',
                'rejected': 'rejected'
            };

            if (statusMessages[status]) {
                // Get the user_id for the applicant
                const userIdResult = await db.query(`
                    SELECT COALESCE(cp.user_id, ep.user_id) as user_id
                    FROM applications a
                    LEFT JOIN candidate_profiles cp ON a.candidate_id = cp.id
                    LEFT JOIN employee_profiles ep ON a.employee_id = ep.id
                    WHERE a.id = $1
                `, [id]);

                if (userIdResult.rows[0]?.user_id) {
                    await db.query(`
                        INSERT INTO notifications (user_id, title, message, type, link)
                        VALUES ($1, $2, $3, $4, $5)
                    `, [
                        userIdResult.rows[0].user_id,
                        `Application Update: ${candidateEmail.rows[0].job_title}`,
                        statusMessages[status],
                        `application_${statusIcons[status] || 'update'}`,
                        application.employee_id ? '/employee/applications' : '/candidate/applications'
                    ]);
                }
            }
        }

        res.json(result.rows[0]);

    } catch (error) {
        console.error('Update status error:', error);
        res.status(500).json({ error: 'Failed to update status' });
    }
});

// Get shortlisted candidates for a job
router.get('/job/:jobId/shortlisted', authenticate, authorize('admin', 'hr_manager', 'recruiter'), async (req, res) => {
    try {
        const { jobId } = req.params;
        const { min_score = 70 } = req.query;

        const result = await db.query(`
            SELECT a.*,
                   cp.first_name, cp.last_name, cp.phone, cp.location,
                   cp.years_of_experience, cp.current_job_title,
                   u.email
            FROM applications a
            JOIN candidate_profiles cp ON a.candidate_id = cp.id
            JOIN users u ON cp.user_id = u.id
            WHERE a.job_id = $1 AND a.ai_overall_score >= $2
            ORDER BY a.ai_overall_score DESC
        `, [jobId, min_score]);

        res.json(result.rows);

    } catch (error) {
        console.error('Get shortlisted error:', error);
        res.status(500).json({ error: 'Failed to fetch shortlisted candidates' });
    }
});

// AI Rank candidates for a job
router.post('/job/:jobId/ai-rank', authenticate, authorize('admin', 'hr_manager'), async (req, res) => {
    try {
        const { jobId } = req.params;

        // Get job and all applications
        const job = await db.query('SELECT * FROM jobs WHERE id = $1', [jobId]);
        if (job.rows.length === 0) {
            return res.status(404).json({ error: 'Job not found' });
        }

        const applications = await db.query(`
            SELECT a.*, cp.*, u.email
            FROM applications a
            JOIN candidate_profiles cp ON a.candidate_id = cp.id
            JOIN users u ON cp.user_id = u.id
            WHERE a.job_id = $1 AND a.status NOT IN ('rejected', 'withdrawn')
        `, [jobId]);

        // Re-rank all applications
        const rankings = await aiService.rankCandidates(job.rows[0], applications.rows);

        // Update rankings
        for (const ranking of rankings) {
            await db.query('UPDATE applications SET ai_ranking = $1 WHERE id = $2', [ranking.rank, ranking.applicationId]);
        }

        res.json({ message: 'Candidates ranked successfully', rankings });

    } catch (error) {
        console.error('AI rank error:', error);
        res.status(500).json({ error: 'Failed to rank candidates' });
    }
});

// Withdraw application (candidate)
router.post('/:id/withdraw', authenticate, async (req, res) => {
    try {
        const { id } = req.params;

        // Verify ownership
        let query;
        if (req.user.role === 'candidate') {
            query = `
                UPDATE applications SET status = 'withdrawn'
                WHERE id = $1 AND candidate_id = (SELECT id FROM candidate_profiles WHERE user_id = $2)
                RETURNING *
            `;
        } else if (req.user.role === 'employee') {
            query = `
                UPDATE applications SET status = 'withdrawn'
                WHERE id = $1 AND employee_id = (SELECT id FROM employee_profiles WHERE user_id = $2)
                RETURNING *
            `;
        } else {
            return res.status(403).json({ error: 'Access denied' });
        }

        const result = await db.query(query, [id, req.user.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Application not found' });
        }

        res.json({ message: 'Application withdrawn', application: result.rows[0] });

    } catch (error) {
        console.error('Withdraw error:', error);
        res.status(500).json({ error: 'Failed to withdraw application' });
    }
});

// Accept an offer (candidate or employee)
router.post('/:id/accept-offer', authenticate, async (req, res) => {
    try {
        const { id } = req.params;

        // Build ownership query based on role
        let ownershipCheck;
        if (req.user.role === 'candidate') {
            ownershipCheck = `
                SELECT a.id, a.status, a.job_id, j.title as job_title, j.department
                FROM applications a
                JOIN jobs j ON a.job_id = j.id
                WHERE a.id = $1 AND a.candidate_id = (SELECT id FROM candidate_profiles WHERE user_id = $2)
            `;
        } else if (req.user.role === 'employee') {
            ownershipCheck = `
                SELECT a.id, a.status, a.job_id, j.title as job_title, j.department
                FROM applications a
                JOIN jobs j ON a.job_id = j.id
                WHERE a.id = $1 AND a.employee_id = (SELECT id FROM employee_profiles WHERE user_id = $2)
            `;
        } else {
            return res.status(403).json({ error: 'Access denied' });
        }

        const appResult = await db.query(ownershipCheck, [id, req.user.id]);
        if (appResult.rows.length === 0) {
            return res.status(404).json({ error: 'Application not found' });
        }

        const app = appResult.rows[0];
        if (app.status !== 'offer_extended') {
            return res.status(400).json({ error: 'No pending offer to accept. Current status: ' + app.status });
        }

        // Update status to hired
        const result = await db.query(`
            UPDATE applications 
            SET status = 'hired',
                notes = COALESCE(notes || E'\\n', '') || 'Offer accepted by applicant on ' || CURRENT_DATE::text,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING *
        `, [id]);

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
        `, [rejectReason, app.job_id, id]);

        console.log(`Offer accepted for job ${app.job_id}. Rejected ${rejectResult.rows.length} other candidates.`);

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

        // Notify HR about acceptance
        try {
            const hrUsers = await db.query("SELECT email FROM users WHERE role = 'hr_manager'");
            for (const hr of hrUsers.rows) {
                await emailService.sendEmail(
                    hr.email,
                    `Offer Accepted: ${app.job_title} - ${app.department}`,
                    `
                        <h2>Offer Accepted!</h2>
                        <p>An applicant has accepted the offer for:</p>
                        <p><strong>${app.job_title}</strong> - ${app.department}</p>
                        <p>Please proceed with the onboarding process.</p>
                        <p><em>${rejectResult.rows.length} other candidate(s) have been automatically notified of the decision.</em></p>
                    `
                );
            }
        } catch (emailError) {
            console.error('Failed to send offer acceptance notification:', emailError);
        }

        // Create in-app notification for the hired candidate
        try {
            await db.query(`
                INSERT INTO notifications (user_id, title, message, type, link)
                VALUES ($1, $2, $3, $4, $5)
            `, [
                req.user.id,
                `Congratulations! You're Hired - ${app.job_title}`,
                `Your offer for ${app.job_title} has been accepted. Welcome to the team!`,
                'application_hired',
                req.user.role === 'employee' ? '/employee/applications' : '/candidate/applications'
            ]);
        } catch (notifErr) {
            console.error('Failed to create hired notification:', notifErr.message);
        }

        // Create in-app notifications for auto-rejected candidates
        if (rejectResult.rows.length > 0) {
            const rejectedIds = rejectResult.rows.map(r => r.id);
            try {
                const rejectedUsers = await db.query(`
                    SELECT COALESCE(cp.user_id, ep.user_id) as user_id, a.employee_id, j.title as job_title
                    FROM applications a
                    JOIN jobs j ON a.job_id = j.id
                    LEFT JOIN candidate_profiles cp ON a.candidate_id = cp.id
                    LEFT JOIN employee_profiles ep ON a.employee_id = ep.id
                    WHERE a.id = ANY($1)
                `, [rejectedIds]);

                for (const user of rejectedUsers.rows) {
                    if (user.user_id) {
                        await db.query(`
                            INSERT INTO notifications (user_id, title, message, type, link)
                            VALUES ($1, $2, $3, $4, $5)
                        `, [
                            user.user_id,
                            `Application Update: ${user.job_title}`,
                            `Unfortunately, your application for ${user.job_title} was not successful. Another candidate was selected.`,
                            'application_rejected',
                            user.employee_id ? '/employee/applications' : '/candidate/applications'
                        ]);
                    }
                }
            } catch (notifErr) {
                console.error('Failed to create rejection notifications:', notifErr.message);
            }
        }

        res.json({ message: 'Offer accepted! Congratulations on your new position!', application: result.rows[0] });

    } catch (error) {
        console.error('Accept offer error:', error);
        res.status(500).json({ error: 'Failed to accept offer' });
    }
});

// Decline an offer (candidate or employee)
router.post('/:id/decline-offer', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        // Build ownership query based on role
        let ownershipCheck;
        if (req.user.role === 'candidate') {
            ownershipCheck = `
                SELECT a.id, a.status, a.job_id, j.title as job_title, j.department
                FROM applications a
                JOIN jobs j ON a.job_id = j.id
                WHERE a.id = $1 AND a.candidate_id = (SELECT id FROM candidate_profiles WHERE user_id = $2)
            `;
        } else if (req.user.role === 'employee') {
            ownershipCheck = `
                SELECT a.id, a.status, a.job_id, j.title as job_title, j.department
                FROM applications a
                JOIN jobs j ON a.job_id = j.id
                WHERE a.id = $1 AND a.employee_id = (SELECT id FROM employee_profiles WHERE user_id = $2)
            `;
        } else {
            return res.status(403).json({ error: 'Access denied' });
        }

        const appResult = await db.query(ownershipCheck, [id, req.user.id]);
        if (appResult.rows.length === 0) {
            return res.status(404).json({ error: 'Application not found' });
        }

        const app = appResult.rows[0];
        if (app.status !== 'offer_extended') {
            return res.status(400).json({ error: 'No pending offer to decline. Current status: ' + app.status });
        }

        // Update status to offer_declined
        const result = await db.query(`
            UPDATE applications 
            SET status = 'offer_declined',
                notes = COALESCE(notes || E'\\n', '') || 'Offer declined by applicant on ' || CURRENT_DATE::text || '. Reason: ' || COALESCE($1, 'No reason provided'),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING *
        `, [reason || null, id]);

        // Reactivate previously rejected candidates for this job so HR can select someone else
        // Only reactivate those who were rejected as part of the evaluation process AND have completed interviews
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

        // Notify HR about decline
        try {
            const hrUsers = await db.query("SELECT id, email FROM users WHERE role = 'hr_manager'");
            
            // Get candidate name for notification
            const candidateInfo = await db.query(`
                SELECT COALESCE(cp.first_name, ep.first_name) as first_name,
                       COALESCE(cp.last_name, ep.last_name) as last_name
                FROM applications a
                LEFT JOIN candidate_profiles cp ON a.candidate_id = cp.id
                LEFT JOIN employee_profiles ep ON a.employee_id = ep.id
                WHERE a.id = $1
            `, [id]);
            const candidateName = candidateInfo.rows[0] 
                ? `${candidateInfo.rows[0].first_name} ${candidateInfo.rows[0].last_name}` 
                : 'A candidate';

            for (const hr of hrUsers.rows) {
                // Send email notification
                await emailService.sendEmail(
                    hr.email,
                    `Offer Declined: ${app.job_title} - ${app.department}`,
                    `
                        <h2>Offer Declined</h2>
                        <p><strong>${candidateName}</strong> has declined the offer for:</p>
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
                    `${candidateName} has declined the offer for ${app.job_title}. You can select another candidate to extend the offer.`,
                    'offer_declined',
                    '/hr/interviews'
                ]);
            }
        } catch (emailError) {
            console.error('Failed to send offer decline notification:', emailError);
        }

        // Create in-app notification for the declining candidate
        try {
            await db.query(`
                INSERT INTO notifications (user_id, title, message, type, link)
                VALUES ($1, $2, $3, $4, $5)
            `, [
                req.user.id,
                `Offer Declined: ${app.job_title}`,
                `You have declined the offer for ${app.job_title}. Thank you for considering the position.`,
                'application_offer_declined',
                req.user.role === 'employee' ? '/employee/applications' : '/candidate/applications'
            ]);
        } catch (notifErr) {
            console.error('Failed to create decline notification:', notifErr.message);
        }

        res.json({ message: 'Offer declined', application: result.rows[0] });

    } catch (error) {
        console.error('Decline offer error:', error);
        res.status(500).json({ error: 'Failed to decline offer' });
    }
});

// Manually update match score (HR override)
router.put('/:id/match-score', authenticate, authorize('admin', 'hr_manager', 'recruiter'), async (req, res) => {
    try {
        const { id } = req.params;
        const { score, comment } = req.body;

        const numScore = parseFloat(score);
        if (isNaN(numScore) || numScore < 0 || numScore > 100) {
            return res.status(400).json({ error: 'Score must be a number between 0 and 100' });
        }

        // Ensure hr_score_comment column exists
        await db.query(`
            ALTER TABLE applications ADD COLUMN IF NOT EXISTS hr_score_comment TEXT
        `);

        const result = await db.query(`
            UPDATE applications SET 
                resume_match_score = $1,
                hr_score_comment = $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
            RETURNING id, resume_match_score, hr_score_comment
        `, [numScore, comment || null, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Application not found' });
        }

        res.json({
            applicationId: id,
            matchScore: numScore,
            hrComment: comment || null,
            message: 'Match score updated successfully'
        });
    } catch (error) {
        console.error('Update match score error:', error);
        res.status(500).json({ error: 'Failed to update match score' });
    }
});

// Calculate match score for an application
router.get('/:id/match-score', authenticate, authorize('admin', 'hr_manager', 'recruiter'), async (req, res) => {
    try {
        const { id } = req.params;
        const forceRecalculate = req.query.force === 'true';

        // Get application with job details and resume data (support both candidates and employees)
        const result = await db.query(`
            SELECT a.*, 
                   j.title, j.required_skills, j.min_experience_years, j.education_requirement,
                   j.description as job_description, j.requirements as job_requirements,
                   COALESCE(rc.extracted_skills, re.extracted_skills) as parsed_skills, 
                   COALESCE(rc.extracted_education, re.extracted_education) as parsed_education, 
                   COALESCE(rc.extracted_experience, re.extracted_experience) as parsed_experience,
                   COALESCE(rc.raw_text, re.raw_text) as resume_text, 
                   COALESCE(rc.extraction_confidence, re.extraction_confidence) as extraction_confidence
            FROM applications a
            JOIN jobs j ON a.job_id = j.id
            LEFT JOIN candidate_profiles cp ON a.candidate_id = cp.id
            LEFT JOIN employee_profiles ep ON a.employee_id = ep.id
            LEFT JOIN resumes rc ON rc.candidate_id = cp.id
            LEFT JOIN resumes re ON re.employee_id = ep.id
            WHERE a.id = $1
            ORDER BY COALESCE(rc.is_primary, re.is_primary) DESC, 
                     COALESCE(rc.created_at, re.created_at) DESC
            LIMIT 1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Application not found' });
        }

        const application = result.rows[0];

        // If already calculated and not forcing recalculation, return cached
        if (application.resume_match_score && application.resume_match_details && !forceRecalculate) {
            return res.json({
                applicationId: id,
                matchScore: application.resume_match_details,
                resumeConfidence: application.extraction_confidence,
                cached: true
            });
        }

        // Prepare parsed resume data
        const parsedResume = {
            skills: application.parsed_skills || [],
            education: application.parsed_education || [],
            experience: application.parsed_experience || []
        };

        // Prepare job requirements
        const jobRequirements = {
            required_skills: application.required_skills || [],
            min_experience_years: application.min_experience_years || 0,
            education_level: application.education_requirement || ''
        };

        // Calculate match score (now async with OpenAI support)
        const matchScore = await resumeParser.calculateJobMatchScore(
            parsedResume, 
            jobRequirements, 
            application.resume_text || ''
        );

        // Update application with match score
        await db.query(`
            UPDATE applications SET 
                resume_match_score = $1,
                resume_match_details = $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
        `, [matchScore.overallScore, JSON.stringify(matchScore), id]);

        res.json({
            applicationId: id,
            matchScore: matchScore,
            resumeConfidence: application.extraction_confidence,
            cached: false
        });

    } catch (error) {
        console.error('Calculate match score error:', error);
        res.status(500).json({ error: 'Failed to calculate match score' });
    }
});

// Bulk calculate match scores for all/selected applications
router.post('/bulk-match-score', authenticate, authorize('admin', 'hr_manager', 'recruiter'), async (req, res) => {
    try {
        const { applicationIds } = req.body;
        
        // Get applications to calculate scores for
        let query = `
            SELECT a.id, a.resume_match_score,
                   j.title, j.required_skills, j.min_experience_years, j.education_requirement,
                   j.description as job_description, j.requirements as job_requirements,
                   COALESCE(rc.extracted_skills, re.extracted_skills) as parsed_skills, 
                   COALESCE(rc.extracted_education, re.extracted_education) as parsed_education, 
                   COALESCE(rc.extracted_experience, re.extracted_experience) as parsed_experience,
                   COALESCE(rc.raw_text, re.raw_text) as resume_text,
                   COALESCE(rc.extraction_confidence, re.extraction_confidence) as extraction_confidence
            FROM applications a
            JOIN jobs j ON a.job_id = j.id
            LEFT JOIN candidate_profiles cp ON a.candidate_id = cp.id
            LEFT JOIN employee_profiles ep ON a.employee_id = ep.id
            LEFT JOIN resumes rc ON rc.candidate_id = cp.id
            LEFT JOIN resumes re ON re.employee_id = ep.id
            WHERE a.status NOT IN ('withdrawn', 'rejected', 'hired')
        `;
        
        const params = [];
        if (applicationIds && Array.isArray(applicationIds) && applicationIds.length > 0) {
            query += ` AND a.id = ANY($1)`;
            params.push(applicationIds);
        }
        
        const result = await db.query(query, params);
        
        const results = {
            total: result.rows.length,
            calculated: 0,
            skipped: 0,
            failed: 0,
            scores: []
        };
        
        // Process each application
        for (const app of result.rows) {
            try {
                // Skip if no resume data
                if (!app.parsed_skills && !app.parsed_experience && !app.resume_text) {
                    results.skipped++;
                    continue;
                }
                
                const parsedResume = {
                    skills: app.parsed_skills || [],
                    education: app.parsed_education || [],
                    experience: app.parsed_experience || []
                };
                
                const jobRequirements = {
                    required_skills: app.required_skills || [],
                    min_experience_years: app.min_experience_years || 0,
                    education_level: app.education_requirement || ''
                };
                
                // Calculate match score with OpenAI
                const matchScore = await resumeParser.calculateJobMatchScore(
                    parsedResume, 
                    jobRequirements, 
                    app.resume_text || ''
                );
                
                // Update application with match score
                await db.query(`
                    UPDATE applications SET 
                        resume_match_score = $1,
                        resume_match_details = $2,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $3
                `, [matchScore.overallScore, JSON.stringify(matchScore), app.id]);
                
                results.calculated++;
                results.scores.push({
                    applicationId: app.id,
                    score: matchScore.overallScore,
                    recommendation: matchScore.recommendation
                });
                
            } catch (appError) {
                console.error(`Error calculating score for application ${app.id}:`, appError.message);
                results.failed++;
            }
        }
        
        res.json({
            message: `Calculated match scores for ${results.calculated} applications`,
            ...results
        });
        
    } catch (error) {
        console.error('Bulk match score error:', error);
        res.status(500).json({ error: 'Failed to calculate bulk match scores' });
    }
});

// Top N shortlist: shortlist top N candidates by match score, reject the rest
router.post('/top-n-shortlist', authenticate, authorize('admin', 'hr_manager', 'recruiter'), async (req, res) => {
    try {
        const { jobId, topN } = req.body;

        if (!jobId || !topN || topN < 1) {
            return res.status(400).json({ error: 'Please provide a valid job ID and number of candidates to shortlist' });
        }

        // Get all active (non-withdrawn) applications for this job, ordered by match score
        const allApps = await db.query(`
            SELECT a.id, a.status, a.resume_match_score,
                   COALESCE(cp.first_name, ep.first_name) || ' ' || COALESCE(cp.last_name, ep.last_name) as candidate_name
            FROM applications a
            LEFT JOIN candidate_profiles cp ON a.candidate_id = cp.id
            LEFT JOIN employee_profiles ep ON a.employee_id = ep.id
            WHERE a.job_id = $1 AND a.status != 'withdrawn'
            ORDER BY COALESCE(a.resume_match_score, 0) DESC, a.submitted_at ASC
        `, [jobId]);

        if (allApps.rows.length === 0) {
            return res.status(400).json({ error: 'No active applications found for this job posting' });
        }

        const topApps = allApps.rows.slice(0, topN);
        const restApps = allApps.rows.slice(topN);

        const topIds = topApps.map(a => a.id);
        const restIds = restApps.map(a => a.id);

        // Shortlist top N
        let shortlisted = 0;
        if (topIds.length > 0) {
            const shortlistResult = await db.query(`
                UPDATE applications 
                SET status = 'shortlisted', 
                    reviewed_by = $1,
                    reviewed_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ANY($2) AND status != 'withdrawn'
                RETURNING *
            `, [req.user.id, topIds]);
            shortlisted = shortlistResult.rows.length;

            // Send shortlist notification emails and bell notifications
            for (const app of shortlistResult.rows) {
                try {
                    const userResult = await db.query(`
                        SELECT u.id as user_id, u.email, j.title as job_title,
                               COALESCE(cp.first_name, ep.first_name, 'Applicant') as first_name,
                               a.employee_id
                        FROM applications a
                        JOIN jobs j ON a.job_id = j.id
                        LEFT JOIN candidate_profiles cp ON a.candidate_id = cp.id
                        LEFT JOIN employee_profiles ep ON a.employee_id = ep.id
                        LEFT JOIN users u ON COALESCE(cp.user_id, ep.user_id) = u.id
                        WHERE a.id = $1
                    `, [app.id]);
                    if (userResult.rows[0]?.email) {
                        emailService.sendStatusUpdateEmail(
                            userResult.rows[0].email,
                            userResult.rows[0].first_name,
                            userResult.rows[0].job_title,
                            'shortlisted'
                        ).catch(console.error);
                    }
                    if (userResult.rows[0]?.user_id) {
                        await db.query(`
                            INSERT INTO notifications (user_id, title, message, type, link)
                            VALUES ($1, $2, $3, $4, $5)
                        `, [
                            userResult.rows[0].user_id,
                            `Application Update: ${userResult.rows[0].job_title}`,
                            `Congratulations! You have been shortlisted for ${userResult.rows[0].job_title}.`,
                            'application_shortlist',
                            userResult.rows[0].employee_id ? '/employee/applications' : '/candidate/applications'
                        ]);
                    }
                } catch (e) { console.error('Notification error:', e.message); }
            }
        }

        // Reject the rest
        let rejected = 0;
        if (restIds.length > 0) {
            const rejectResult = await db.query(`
                UPDATE applications 
                SET status = 'rejected', 
                    auto_reject_reason = 'Auto-rejected: did not make the top ' || $1 || ' shortlist',
                    notes = 'Auto-rejected: did not make the top ' || $1 || ' shortlist',
                    reviewed_by = $2,
                    reviewed_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ANY($3) AND status != 'withdrawn'
                RETURNING *
            `, [topN, req.user.id, restIds]);
            rejected = rejectResult.rows.length;

            // Send rejection notification emails and bell notifications
            for (const app of rejectResult.rows) {
                try {
                    const userResult = await db.query(`
                        SELECT u.id as user_id, u.email, j.title as job_title,
                               COALESCE(cp.first_name, ep.first_name, 'Applicant') as first_name,
                               a.employee_id
                        FROM applications a
                        JOIN jobs j ON a.job_id = j.id
                        LEFT JOIN candidate_profiles cp ON a.candidate_id = cp.id
                        LEFT JOIN employee_profiles ep ON a.employee_id = ep.id
                        LEFT JOIN users u ON COALESCE(cp.user_id, ep.user_id) = u.id
                        WHERE a.id = $1
                    `, [app.id]);
                    if (userResult.rows[0]?.email) {
                        emailService.sendStatusUpdateEmail(
                            userResult.rows[0].email,
                            userResult.rows[0].first_name,
                            userResult.rows[0].job_title,
                            'rejected'
                        ).catch(console.error);
                    }
                    if (userResult.rows[0]?.user_id) {
                        await db.query(`
                            INSERT INTO notifications (user_id, title, message, type, link)
                            VALUES ($1, $2, $3, $4, $5)
                        `, [
                            userResult.rows[0].user_id,
                            `Application Update: ${userResult.rows[0].job_title}`,
                            `Unfortunately, your application for ${userResult.rows[0].job_title} was not successful.`,
                            'application_rejected',
                            userResult.rows[0].employee_id ? '/employee/applications' : '/candidate/applications'
                        ]);
                    }
                } catch (e) { console.error('Notification error:', e.message); }
            }
        }

        res.json({
            message: `Top ${topN} shortlisted, rest rejected`,
            shortlisted,
            rejected,
            totalApplications: allApps.rows.length,
            shortlistedCandidates: topApps.map(a => ({ id: a.id, name: a.candidate_name, score: a.resume_match_score }))
        });

    } catch (error) {
        console.error('Top N shortlist error:', error);
        res.status(500).json({ error: 'Failed to process top-N shortlisting' });
    }
});

// Bulk update application status (HR)
router.post('/bulk-update-status', authenticate, authorize('admin', 'hr_manager', 'recruiter'), async (req, res) => {
    try {
        const { applicationIds, status, reason } = req.body;

        if (!applicationIds || !Array.isArray(applicationIds) || applicationIds.length === 0) {
            return res.status(400).json({ error: 'Please provide application IDs' });
        }

        const validStatuses = ['submitted', 'under_review', 'shortlisted', 'interview_scheduled', 'interviewed', 'offer_extended', 'offer_accepted', 'offer_declined', 'hired', 'rejected', 'withdrawn'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        // Update applications (exclude withdrawn ones)
        const result = await db.query(`
            UPDATE applications 
            SET status = $1::application_status, 
                auto_reject_reason = CASE WHEN $1 = 'rejected' THEN $2 ELSE auto_reject_reason END,
                notes = CASE WHEN $1 = 'rejected' THEN COALESCE($2, notes) ELSE notes END,
                reviewed_by = $3,
                reviewed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ANY($4) AND status != 'withdrawn'
            RETURNING *
        `, [status, reason, req.user.id, applicationIds]);

        // Send notifications for status changes
        for (const app of result.rows) {
            const userResult = await db.query(`
                SELECT u.id as user_id, u.email, j.title as job_title,
                       COALESCE(cp.first_name, ep.first_name, 'Applicant') as first_name,
                       a.employee_id
                FROM applications a
                JOIN jobs j ON a.job_id = j.id
                LEFT JOIN candidate_profiles cp ON a.candidate_id = cp.id
                LEFT JOIN employee_profiles ep ON a.employee_id = ep.id
                LEFT JOIN users u ON COALESCE(cp.user_id, ep.user_id) = u.id
                WHERE a.id = $1
            `, [app.id]);

            if (userResult.rows[0]?.email) {
                // Send email notification
                emailService.sendStatusUpdateEmail(
                    userResult.rows[0].email,
                    userResult.rows[0].first_name,
                    userResult.rows[0].job_title,
                    status
                ).catch(console.error);

                // Create in-app notification
                const statusMessages = {
                    'under_review': 'Your application is being reviewed',
                    'shortlisted': 'Congratulations! You have been shortlisted',
                    'interview_scheduled': 'An interview has been scheduled',
                    'interviewed': 'Your interview has been completed',
                    'offer_extended': 'Great news! You have received a job offer',
                    'hired': 'Congratulations! You have been hired',
                    'rejected': 'Unfortunately, your application was not successful'
                };

                if (statusMessages[status] && userResult.rows[0].user_id) {
                    await db.query(`
                        INSERT INTO notifications (user_id, title, message, type, link)
                        VALUES ($1, $2, $3, $4, $5)
                    `, [
                        userResult.rows[0].user_id,
                        `Application Update: ${userResult.rows[0].job_title}`,
                        statusMessages[status],
                        `application_${status}`,
                        userResult.rows[0].employee_id ? '/employee/applications' : '/candidate/applications'
                    ]);
                }
            }
        }

        res.json({
            message: `${result.rows.length} applications updated to ${status}`,
            updated: result.rows.length,
            applications: result.rows
        });

    } catch (error) {
        console.error('Bulk update status error:', error);
        res.status(500).json({ error: 'Failed to update applications' });
    }
});

// Reparse resume for an application (HR only)
router.post('/:id/reparse-resume', authenticate, async (req, res) => {
    try {
        // Only HR and admin can reparse
        if (!['hr_manager', 'hr', 'admin', 'recruiter'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { id } = req.params;

        // Get the application and resume (supports both candidates and employees)
        const appResult = await db.query(`
            SELECT a.candidate_id, a.employee_id, 
                   COALESCE(rc.id, re.id) as resume_id, 
                   COALESCE(rc.file_path, re.file_path) as file_path, 
                   COALESCE(rc.file_type, re.file_type) as file_type
            FROM applications a
            LEFT JOIN candidate_profiles cp ON a.candidate_id = cp.id
            LEFT JOIN employee_profiles ep ON a.employee_id = ep.id
            LEFT JOIN resumes rc ON rc.candidate_id = cp.id
            LEFT JOIN resumes re ON re.employee_id = ep.id
            WHERE a.id = $1
            ORDER BY COALESCE(rc.is_primary, re.is_primary) DESC, 
                     COALESCE(rc.created_at, re.created_at) DESC
            LIMIT 1
        `, [id]);

        if (appResult.rows.length === 0) {
            return res.status(404).json({ error: 'Application not found' });
        }

        const { resume_id, file_path, file_type } = appResult.rows[0];

        if (!resume_id) {
            return res.status(404).json({ error: 'No resume found for this application' });
        }

        // Update resume status to processing
        await db.query(
            'UPDATE resumes SET status = $1, parsing_error = NULL WHERE id = $2',
            ['processing', resume_id]
        );

        // Parse the resume asynchronously
        const path = require('path');
        // file_path is like /uploads/resumes/xxx.pdf, so we need to go to backend folder
        const fullPath = path.join(__dirname, '../..', file_path);
        
        resumeParser.parseResume(fullPath, file_type)
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
                        extraction_confidence = $9,
                        parsed_at = CURRENT_TIMESTAMP
                    WHERE id = $10
                `, [
                    parsedData.rawText,
                    JSON.stringify(parsedData),
                    JSON.stringify(parsedData.contact || {}),
                    parsedData.summary || '',
                    JSON.stringify(parsedData.skills || []),
                    JSON.stringify(parsedData.experience || []),
                    JSON.stringify(parsedData.education || []),
                    JSON.stringify(parsedData.certifications || []),
                    parsedData.confidenceScore || 0.5,
                    resume_id
                ]);
                console.log(`Resume ${resume_id} reparsed successfully`);
            })
            .catch(async (error) => {
                console.error('Reparse error:', error);
                await db.query(
                    'UPDATE resumes SET status = $1, parsing_error = $2 WHERE id = $3',
                    ['failed', error.message, resume_id]
                );
            });

        res.json({ 
            message: 'Resume reparsing started', 
            resume_id,
            status: 'processing'
        });

    } catch (error) {
        console.error('Reparse resume error:', error);
        res.status(500).json({ error: 'Failed to reparse resume' });
    }
});

module.exports = router;
