const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const emailService = require('../services/email.service');
const calendarService = require('../services/calendar.service');

// Get all interviews (HR view)
router.get('/', authenticate, authorize('admin', 'hr_manager', 'recruiter'), async (req, res) => {
    try {
        const { date, status, type, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT i.*,
                   a.status as application_status,
                   a.job_id,
                   j.title as job_title, j.department,
                   COALESCE(cp.first_name, ep.first_name) as candidate_first_name,
                   COALESCE(cp.last_name, ep.last_name) as candidate_last_name,
                   u.email as candidate_email
            FROM interviews i
            JOIN applications a ON i.application_id = a.id
            JOIN jobs j ON a.job_id = j.id
            LEFT JOIN candidate_profiles cp ON a.candidate_id = cp.id
            LEFT JOIN employee_profiles ep ON a.employee_id = ep.id
            LEFT JOIN users u ON cp.user_id = u.id OR ep.user_id = u.id
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (date) {
            query += ` AND i.scheduled_date = $${paramIndex++}`;
            params.push(date);
        }

        if (status) {
            query += ` AND i.status = $${paramIndex++}`;
            params.push(status);
        }

        if (type) {
            query += ` AND i.interview_type = $${paramIndex++}`;
            params.push(type);
        }

        const countQuery = query.replace(/SELECT.*FROM/, 'SELECT COUNT(*) FROM');
        const countResult = await db.query(countQuery, params);
        const total = parseInt(countResult.rows[0].count);

        query += ` ORDER BY i.scheduled_date DESC, i.start_time DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
        params.push(limit, offset);

        const result = await db.query(query, params);

        res.json({
            interviews: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('Get interviews error:', error);
        res.status(500).json({ error: 'Failed to fetch interviews' });
    }
});

// Get my interviews (candidate/employee view)
router.get('/my-interviews', authenticate, async (req, res) => {
    try {
        let query;
        let params;

        if (req.user.role === 'candidate') {
            query = `
                SELECT i.*, j.title as job_title, j.department, j.location as job_location
                FROM interviews i
                JOIN applications a ON i.application_id = a.id
                JOIN jobs j ON a.job_id = j.id
                JOIN candidate_profiles cp ON a.candidate_id = cp.id
                WHERE cp.user_id = $1
                ORDER BY i.scheduled_date DESC, i.start_time DESC
            `;
            params = [req.user.id];
        } else if (req.user.role === 'employee') {
            query = `
                SELECT i.*, j.title as job_title, j.department, j.location as job_location
                FROM interviews i
                JOIN applications a ON i.application_id = a.id
                JOIN jobs j ON a.job_id = j.id
                JOIN employee_profiles ep ON a.employee_id = ep.id
                WHERE ep.user_id = $1
                ORDER BY i.scheduled_date DESC, i.start_time DESC
            `;
            params = [req.user.id];
        } else {
            return res.status(403).json({ error: 'Access denied' });
        }

        const result = await db.query(query, params);
        res.json(result.rows);

    } catch (error) {
        console.error('Get my interviews error:', error);
        res.status(500).json({ error: 'Failed to fetch interviews' });
    }
});

// Get interview by ID
router.get('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.query(`
            SELECT i.*,
                   a.status as application_status, a.ai_overall_score, a.ai_interview_questions,
                   j.title as job_title, j.department, j.description as job_description,
                   COALESCE(cp.first_name, ep.first_name) as candidate_first_name,
                   COALESCE(cp.last_name, ep.last_name) as candidate_last_name,
                   COALESCE(cp.phone, ep.phone) as candidate_phone,
                   u.email as candidate_email,
                   (SELECT json_agg(json_build_object(
                       'id', f.id, 'interviewer_id', f.interviewer_id,
                       'technical_rating', f.technical_skills_rating,
                       'communication_rating', f.communication_rating,
                       'overall_rating', f.overall_rating,
                       'recommendation', f.recommendation,
                       'strengths', f.strengths,
                       'weaknesses', f.weaknesses,
                       'feedback', f.detailed_feedback,
                       'hire_recommendation', f.hire_recommendation
                   )) FROM interview_feedback f WHERE f.interview_id = i.id) as feedback
            FROM interviews i
            JOIN applications a ON i.application_id = a.id
            JOIN jobs j ON a.job_id = j.id
            LEFT JOIN candidate_profiles cp ON a.candidate_id = cp.id
            LEFT JOIN employee_profiles ep ON a.employee_id = ep.id
            LEFT JOIN users u ON cp.user_id = u.id OR ep.user_id = u.id
            WHERE i.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Interview not found' });
        }

        res.json(result.rows[0]);

    } catch (error) {
        console.error('Get interview error:', error);
        res.status(500).json({ error: 'Failed to fetch interview' });
    }
});

// Bulk schedule interviews for all shortlisted candidates of a job posting
router.post('/bulk-schedule', authenticate, authorize('admin', 'hr_manager', 'recruiter'), async (req, res) => {
    try {
        const {
            job_id, interview_type, scheduled_date, start_time,
            interval_minutes, location, meeting_link, notes
        } = req.body;

        if (!job_id || !interview_type || !scheduled_date || !start_time || !interval_minutes) {
            return res.status(400).json({ error: 'Please provide job_id, interview_type, scheduled_date, start_time, and interval_minutes' });
        }

        // Get all shortlisted applications for this job
        const appsResult = await db.query(`
            SELECT a.id, a.candidate_id, a.employee_id,
                   COALESCE(cp.first_name, ep.first_name) as first_name,
                   COALESCE(cp.last_name, ep.last_name) as last_name,
                   u.email as candidate_email,
                   j.title as job_title
            FROM applications a
            JOIN jobs j ON a.job_id = j.id
            LEFT JOIN candidate_profiles cp ON a.candidate_id = cp.id
            LEFT JOIN employee_profiles ep ON a.employee_id = ep.id
            LEFT JOIN users u ON COALESCE(cp.user_id, ep.user_id) = u.id
            WHERE a.job_id = $1 AND a.status = 'shortlisted'
            ORDER BY a.resume_match_score DESC NULLS LAST, a.submitted_at ASC
        `, [job_id]);

        if (appsResult.rows.length === 0) {
            return res.status(400).json({ error: 'No shortlisted candidates found for this job posting' });
        }

        const candidates = appsResult.rows;
        const scheduledInterviews = [];
        const intervalMs = parseInt(interval_minutes);

        // Parse start time
        const [startHours, startMinutes] = start_time.split(':').map(Number);

        for (let i = 0; i < candidates.length; i++) {
            const candidate = candidates[i];

            // Calculate this candidate's start time
            const totalMinutesOffset = i * intervalMs;
            const candidateStartMinutes = startHours * 60 + startMinutes + totalMinutesOffset;
            const candidateEndMinutes = candidateStartMinutes + intervalMs;

            const cStartH = String(Math.floor(candidateStartMinutes / 60)).padStart(2, '0');
            const cStartM = String(candidateStartMinutes % 60).padStart(2, '0');
            const cEndH = String(Math.floor(candidateEndMinutes / 60)).padStart(2, '0');
            const cEndM = String(candidateEndMinutes % 60).padStart(2, '0');

            const candidateStartTime = `${cStartH}:${cStartM}`;
            const candidateEndTime = `${cEndH}:${cEndM}`;

            // Validate time doesn't go past midnight
            if (candidateEndMinutes >= 24 * 60) {
                return res.status(400).json({
                    error: `Cannot schedule all ${candidates.length} interviews. Interview #${i + 1} for ${candidate.first_name} ${candidate.last_name} would end after midnight. Reduce interval or number of candidates.`,
                    scheduled_so_far: scheduledInterviews.length
                });
            }

            // Create interview
            const result = await db.query(`
                INSERT INTO interviews (
                    application_id, interview_type, scheduled_date, start_time, end_time,
                    timezone, location, meeting_link, organizer_id, notes
                )
                VALUES ($1, $2, $3, $4, $5, 'UTC', $6, $7, $8, $9)
                RETURNING *
            `, [
                candidate.id, interview_type, scheduled_date,
                candidateStartTime, candidateEndTime,
                location || null, meeting_link || null, req.user.id, notes || null
            ]);

            // Update application status
            await db.query(`
                UPDATE applications SET status = 'interview_scheduled', updated_at = CURRENT_TIMESTAMP WHERE id = $1
            `, [candidate.id]);

            // Send email invitation
            if (candidate.candidate_email) {
                emailService.sendInterviewInvitation(
                    candidate.candidate_email,
                    candidate.first_name,
                    candidate.job_title,
                    {
                        type: interview_type,
                        date: scheduled_date,
                        startTime: candidateStartTime,
                        endTime: candidateEndTime,
                        location: location,
                        meetingLink: meeting_link,
                        notes: notes
                    }
                ).then(async () => {
                    await db.query(`
                        UPDATE interviews SET invitation_sent = true, invitation_sent_at = CURRENT_TIMESTAMP
                        WHERE id = $1
                    `, [result.rows[0].id]);
                }).catch(err => console.error(`Email error for ${candidate.first_name}:`, err.message));
            }

            scheduledInterviews.push({
                interview: result.rows[0],
                candidate_name: `${candidate.first_name} ${candidate.last_name}`,
                time_slot: `${candidateStartTime} - ${candidateEndTime}`
            });
        }

        res.status(201).json({
            message: `Successfully scheduled ${scheduledInterviews.length} interviews`,
            total: scheduledInterviews.length,
            date: scheduled_date,
            interviews: scheduledInterviews
        });

    } catch (error) {
        console.error('Bulk schedule error:', error);
        res.status(500).json({ error: 'Failed to schedule bulk interviews' });
    }
});

// Schedule interview
router.post('/', authenticate, authorize('admin', 'hr_manager', 'recruiter'), async (req, res) => {
    try {
        const {
            application_id, interview_type, scheduled_date, start_time, end_time,
            timezone, location, meeting_link, interviewers, notes
        } = req.body;

        // Validate application exists and is in correct status
        const appResult = await db.query(`
            SELECT a.*, j.title as job_title,
                   COALESCE(cp.first_name, ep.first_name) as first_name,
                   COALESCE(cp.last_name, ep.last_name) as last_name,
                   u.email as candidate_email
            FROM applications a
            JOIN jobs j ON a.job_id = j.id
            LEFT JOIN candidate_profiles cp ON a.candidate_id = cp.id
            LEFT JOIN employee_profiles ep ON a.employee_id = ep.id
            LEFT JOIN users u ON cp.user_id = u.id OR ep.user_id = u.id
            WHERE a.id = $1
        `, [application_id]);

        if (appResult.rows.length === 0) {
            return res.status(404).json({ error: 'Application not found' });
        }

        const application = appResult.rows[0];

        // Create interview
        const result = await db.query(`
            INSERT INTO interviews (
                application_id, interview_type, scheduled_date, start_time, end_time,
                timezone, location, meeting_link, interviewers, organizer_id, notes
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *
        `, [
            application_id, interview_type, scheduled_date, start_time, end_time,
            timezone || 'UTC', location, meeting_link, interviewers, req.user.id, notes
        ]);

        const interview = result.rows[0];

        // Update application status
        await db.query(`
            UPDATE applications SET status = 'interview_scheduled' WHERE id = $1
        `, [application_id]);

        // Send interview invitation email
        emailService.sendInterviewInvitation(
            application.candidate_email,
            application.first_name,
            application.job_title,
            {
                type: interview_type,
                date: scheduled_date,
                startTime: start_time,
                endTime: end_time,
                location: location,
                meetingLink: meeting_link,
                notes: notes
            }
        ).then(async () => {
            await db.query(`
                UPDATE interviews SET invitation_sent = true, invitation_sent_at = CURRENT_TIMESTAMP
                WHERE id = $1
            `, [interview.id]);
        }).catch(console.error);

        // Create Google Calendar event if configured
        if (process.env.GOOGLE_CLIENT_ID) {
            calendarService.createCalendarEvent(interview, application)
                .then(async (eventId) => {
                    if (eventId) {
                        await db.query(`
                            UPDATE interviews SET google_event_id = $1, calendar_synced = true
                            WHERE id = $2
                        `, [eventId, interview.id]);
                    }
                })
                .catch(console.error);
        }

        res.status(201).json({
            message: 'Interview scheduled successfully',
            interview
        });

    } catch (error) {
        console.error('Schedule interview error:', error);
        res.status(500).json({ error: 'Failed to schedule interview' });
    }
});

// Update interview
router.put('/:id', authenticate, authorize('admin', 'hr_manager', 'recruiter'), async (req, res) => {
    try {
        const { id } = req.params;
        const {
            scheduled_date, start_time, end_time, location, meeting_link,
            interviewers, notes, status
        } = req.body;

        const result = await db.query(`
            UPDATE interviews SET
                scheduled_date = COALESCE($1, scheduled_date),
                start_time = COALESCE($2, start_time),
                end_time = COALESCE($3, end_time),
                location = COALESCE($4, location),
                meeting_link = COALESCE($5, meeting_link),
                interviewers = COALESCE($6, interviewers),
                notes = COALESCE($7, notes),
                status = COALESCE($8, status),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $9
            RETURNING *
        `, [scheduled_date, start_time, end_time, location, meeting_link, interviewers, notes, status, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Interview not found' });
        }

        // If date/time changed, send update email
        if (scheduled_date || start_time) {
            const interview = result.rows[0];
            const appResult = await db.query(`
                SELECT COALESCE(cp.first_name, ep.first_name) as first_name, u.email, j.title
                FROM applications a
                LEFT JOIN candidate_profiles cp ON a.candidate_id = cp.id
                LEFT JOIN employee_profiles ep ON a.employee_id = ep.id
                LEFT JOIN users u ON cp.user_id = u.id OR ep.user_id = u.id
                JOIN jobs j ON a.job_id = j.id
                WHERE a.id = $1
            `, [interview.application_id]);

            if (appResult.rows.length > 0) {
                emailService.sendInterviewReschedule(
                    appResult.rows[0].email,
                    appResult.rows[0].first_name,
                    appResult.rows[0].title,
                    {
                        date: interview.scheduled_date,
                        startTime: interview.start_time,
                        endTime: interview.end_time,
                        location: interview.location,
                        meetingLink: interview.meeting_link
                    }
                ).catch(console.error);
            }
        }

        res.json(result.rows[0]);

    } catch (error) {
        console.error('Update interview error:', error);
        res.status(500).json({ error: 'Failed to update interview' });
    }
});

// Cancel interview
router.post('/:id/cancel', authenticate, authorize('admin', 'hr_manager', 'recruiter'), async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        const result = await db.query(`
            UPDATE interviews SET status = 'cancelled', notes = CONCAT(notes, E'\nCancellation reason: ', $1)
            WHERE id = $2
            RETURNING *
        `, [reason, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Interview not found' });
        }

        // Send cancellation email
        const interview = result.rows[0];
        const appResult = await db.query(`
            SELECT COALESCE(cp.first_name, ep.first_name) as first_name, u.email, j.title
            FROM applications a
            LEFT JOIN candidate_profiles cp ON a.candidate_id = cp.id
            LEFT JOIN employee_profiles ep ON a.employee_id = ep.id
            LEFT JOIN users u ON cp.user_id = u.id OR ep.user_id = u.id
            JOIN jobs j ON a.job_id = j.id
            WHERE a.id = $1
        `, [interview.application_id]);

        if (appResult.rows.length > 0) {
            emailService.sendInterviewCancellation(
                appResult.rows[0].email,
                appResult.rows[0].first_name,
                appResult.rows[0].title,
                reason
            ).catch(console.error);
        }

        res.json({ message: 'Interview cancelled', interview: result.rows[0] });

    } catch (error) {
        console.error('Cancel interview error:', error);
        res.status(500).json({ error: 'Failed to cancel interview' });
    }
});

// Confirm interview (candidate confirms attendance)
router.post('/:id/confirm', authenticate, async (req, res) => {
    try {
        const { id } = req.params;

        // Update interview status to confirmed
        const result = await db.query(`
            UPDATE interviews 
            SET status = 'confirmed', 
                confirmed_at = CURRENT_TIMESTAMP,
                confirmed_by = $1
            WHERE id = $2
            RETURNING *
        `, [req.user.id, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Interview not found' });
        }

        const interview = result.rows[0];

        // Get HR/organizer email to notify them
        const orgResult = await db.query(`
            SELECT u.email, u.id as user_id,
                   COALESCE(cp.first_name, ep.first_name) as candidate_first_name,
                   COALESCE(cp.last_name, ep.last_name) as candidate_last_name,
                   j.title as job_title
            FROM interviews i
            JOIN applications a ON i.application_id = a.id
            JOIN jobs j ON a.job_id = j.id
            LEFT JOIN candidate_profiles cp ON a.candidate_id = cp.id
            LEFT JOIN employee_profiles ep ON a.employee_id = ep.id
            LEFT JOIN users u ON i.organizer_id = u.id
            WHERE i.id = $1
        `, [id]);

        // Send confirmation notification to HR
        if (orgResult.rows.length > 0 && orgResult.rows[0].email) {
            const candidateName = `${orgResult.rows[0].candidate_first_name} ${orgResult.rows[0].candidate_last_name}`;
            const jobTitle = orgResult.rows[0].job_title;
            const interviewDate = new Date(interview.scheduled_date).toLocaleDateString('en-US', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            });

            // Send email to HR notifying interview confirmation
            emailService.sendEmail(
                orgResult.rows[0].email,
                `Interview Confirmed - ${candidateName}`,
                `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #10B981;">✅ Interview Confirmed!</h2>
                    <p>The candidate has confirmed their attendance for the interview.</p>
                    <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <p><strong>Candidate:</strong> ${candidateName}</p>
                        <p><strong>Position:</strong> ${jobTitle}</p>
                        <p><strong>Date:</strong> ${interviewDate}</p>
                        <p><strong>Time:</strong> ${interview.start_time?.slice(0, 5)} - ${interview.end_time?.slice(0, 5)}</p>
                    </div>
                    <p>Best regards,<br>Recruitment System</p>
                </div>
                `
            ).catch(console.error);
        }

        res.json({ message: 'Interview confirmed successfully', interview: result.rows[0] });

    } catch (error) {
        console.error('Confirm interview error:', error);
        res.status(500).json({ error: 'Failed to confirm interview' });
    }
});

// Submit interview feedback
router.post('/:id/feedback', authenticate, authorize('admin', 'hr_manager', 'recruiter'), async (req, res) => {
    try {
        const { id } = req.params;
        const {
            technical_skills_rating, communication_rating, problem_solving_rating,
            cultural_fit_rating, leadership_rating, overall_rating,
            strengths, weaknesses, detailed_feedback, recommendation, hire_recommendation
        } = req.body;

        // Check if interview exists
        const interviewCheck = await db.query('SELECT id FROM interviews WHERE id = $1', [id]);
        if (interviewCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Interview not found' });
        }

        const result = await db.query(`
            INSERT INTO interview_feedback (
                interview_id, interviewer_id,
                technical_skills_rating, communication_rating, problem_solving_rating,
                cultural_fit_rating, leadership_rating, overall_rating,
                strengths, weaknesses, detailed_feedback, recommendation, hire_recommendation
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            ON CONFLICT DO NOTHING
            RETURNING *
        `, [
            id, req.user.id,
            technical_skills_rating, communication_rating, problem_solving_rating,
            cultural_fit_rating, leadership_rating, overall_rating,
            strengths, weaknesses, detailed_feedback, recommendation, hire_recommendation
        ]);

        // Update interview status to completed
        await db.query(`
            UPDATE interviews SET status = 'completed'
            WHERE id = $1 AND status IN ('scheduled', 'confirmed', 'in_progress')
        `, [id]);

        // Update application status to interviewed
        await db.query(`
            UPDATE applications a SET status = 'interviewed'
            FROM interviews i
            WHERE i.id = $1 AND a.id = i.application_id AND a.status = 'interview_scheduled'
        `, [id]);

        res.status(201).json({
            message: 'Feedback submitted successfully',
            feedback: result.rows[0]
        });

    } catch (error) {
        console.error('Submit feedback error:', error);
        res.status(500).json({ error: 'Failed to submit feedback' });
    }
});

// Get feedback for a specific interview
router.get('/:id/feedback', authenticate, authorize('admin', 'hr_manager', 'recruiter'), async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.query(`
            SELECT f.*, u.email as interviewer_email
            FROM interview_feedback f
            LEFT JOIN users u ON f.interviewer_id = u.id
            WHERE f.interview_id = $1
            ORDER BY f.submitted_at DESC
        `, [id]);

        res.json(result.rows);
    } catch (error) {
        console.error('Get feedback error:', error);
        res.status(500).json({ error: 'Failed to get feedback' });
    }
});

// Get evaluation summary for a job — all interviewed candidates with scores
router.get('/job/:jobId/evaluation', authenticate, authorize('admin', 'hr_manager', 'recruiter'), async (req, res) => {
    try {
        const { jobId } = req.params;

        // Get all applications that have been interviewed (or further) for this job
        // Use a subquery to get only the best interview (highest rating) per application
        const result = await db.query(`
            WITH best_interviews AS (
                SELECT DISTINCT ON (i.application_id)
                    i.id as interview_id,
                    i.application_id,
                    i.interview_type,
                    i.scheduled_date,
                    i.start_time,
                    i.status as interview_status,
                    f.overall_rating,
                    f.technical_skills_rating,
                    f.communication_rating,
                    f.problem_solving_rating,
                    f.cultural_fit_rating,
                    f.leadership_rating,
                    f.strengths,
                    f.weaknesses,
                    f.detailed_feedback,
                    f.recommendation,
                    f.hire_recommendation,
                    f.submitted_at as feedback_submitted_at
                FROM interviews i
                LEFT JOIN interview_feedback f ON f.interview_id = i.id
                WHERE i.status = 'completed'
                ORDER BY i.application_id, f.overall_rating DESC NULLS LAST, i.scheduled_date DESC
            )
            SELECT 
                a.id as application_id,
                a.status as application_status,
                a.ai_overall_score as match_score,
                COALESCE(cp.first_name, ep.first_name) as first_name,
                COALESCE(cp.last_name, ep.last_name) as last_name,
                u.email,
                bi.interview_id,
                bi.interview_type,
                bi.scheduled_date,
                bi.start_time,
                bi.interview_status,
                bi.overall_rating,
                bi.technical_skills_rating,
                bi.communication_rating,
                bi.problem_solving_rating,
                bi.cultural_fit_rating,
                bi.leadership_rating,
                bi.strengths,
                bi.weaknesses,
                bi.detailed_feedback,
                bi.recommendation,
                bi.hire_recommendation,
                bi.feedback_submitted_at,
                ROUND(
                    (COALESCE(bi.technical_skills_rating, 0) + COALESCE(bi.communication_rating, 0) + 
                     COALESCE(bi.problem_solving_rating, 0) + COALESCE(bi.cultural_fit_rating, 0) + 
                     COALESCE(bi.leadership_rating, 0)) / 
                    NULLIF(
                        (CASE WHEN bi.technical_skills_rating IS NOT NULL THEN 1 ELSE 0 END +
                         CASE WHEN bi.communication_rating IS NOT NULL THEN 1 ELSE 0 END +
                         CASE WHEN bi.problem_solving_rating IS NOT NULL THEN 1 ELSE 0 END +
                         CASE WHEN bi.cultural_fit_rating IS NOT NULL THEN 1 ELSE 0 END +
                         CASE WHEN bi.leadership_rating IS NOT NULL THEN 1 ELSE 0 END), 0
                    )::numeric, 1
                ) as average_rating
            FROM applications a
            JOIN best_interviews bi ON bi.application_id = a.id
            LEFT JOIN candidate_profiles cp ON a.candidate_id = cp.id
            LEFT JOIN employee_profiles ep ON a.employee_id = ep.id
            LEFT JOIN users u ON cp.user_id = u.id OR ep.user_id = u.id
            WHERE a.job_id = $1
              AND a.status IN ('interviewed', 'offer_extended', 'offer_accepted', 'offer_declined', 'hired', 'rejected')
            ORDER BY bi.overall_rating DESC NULLS LAST, a.ai_overall_score DESC NULLS LAST
        `, [jobId]);

        // Get job details
        const jobResult = await db.query(`
            SELECT id, title, department, positions_available, positions_filled
            FROM jobs WHERE id = $1
        `, [jobId]);

        res.json({
            job: jobResult.rows[0] || null,
            candidates: result.rows
        });

    } catch (error) {
        console.error('Get evaluation error:', error);
        res.status(500).json({ error: 'Failed to get evaluation data' });
    }
});

// Finalize hiring decision — extend offer to selected, reject the rest
router.post('/job/:jobId/finalize', authenticate, authorize('admin', 'hr_manager'), async (req, res) => {
    try {
        const { jobId } = req.params;
        const { selectedApplicationIds, rejectionReason } = req.body;

        if (!selectedApplicationIds || selectedApplicationIds.length === 0) {
            return res.status(400).json({ error: 'Please select at least one candidate to extend an offer to' });
        }

        // Verify the selected applications belong to this job
        const verifyResult = await db.query(`
            SELECT id FROM applications 
            WHERE id = ANY($1) AND job_id = $2 AND status IN ('interviewed', 'offer_extended', 'offer_declined')
        `, [selectedApplicationIds, jobId]);

        if (verifyResult.rows.length !== selectedApplicationIds.length) {
            return res.status(400).json({ error: 'Some selected applications are invalid or not in interview stage' });
        }

        // Extend offers to selected candidates (others remain as 'interviewed' until offer is accepted)
        const offerResult = await db.query(`
            UPDATE applications 
            SET status = 'offer_extended', 
                reviewed_by = $1,
                reviewed_at = CURRENT_TIMESTAMP,
                notes = COALESCE(notes || E'\n', '') || 'Offer extended after interview evaluation'
            WHERE id = ANY($2) AND job_id = $3
            RETURNING id
        `, [req.user.id, selectedApplicationIds, jobId]);

        // Note: We no longer auto-reject other candidates here.
        // Rejection happens when the selected candidate ACCEPTS the offer.
        // This allows HR to select a different candidate if the offer is declined.
        const rejectResult = { rows: [] }; // Empty - no rejections at this stage

        // Send emails to all candidates
        // Get selected candidates info
        const selectedCandidates = await db.query(`
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
        `, [selectedApplicationIds]);

        console.log('Selected candidates for offer:', selectedCandidates.rows.map(c => ({ 
            name: `${c.first_name} ${c.last_name}`, 
            email: c.email || 'NO EMAIL FOUND' 
        })));

        // Send offer emails
        const offerEmailPromises = [];
        for (const candidate of selectedCandidates.rows) {
            if (candidate.email) {
                console.log(`Sending offer email to: ${candidate.first_name} (${candidate.email})`);
                const emailPromise = emailService.sendEmail(
                    candidate.email,
                    `Congratulations! Offer Extended - ${candidate.job_title}`,
                    `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <div style="background-color: #059669; padding: 24px; border-radius: 8px 8px 0 0; text-align: center;">
                            <h2 style="color: #ffffff; margin: 0;">🎉 Congratulations!</h2>
                        </div>
                        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                            <p style="font-size: 16px;">Dear <strong>${candidate.first_name}</strong>,</p>
                            <p>We are thrilled to inform you that after careful evaluation, you have been selected for the <strong>${candidate.job_title}</strong> position!</p>
                            <div style="background-color: #ecfdf5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #059669;">
                                <p style="margin: 0; font-size: 16px; color: #065f46;">
                                    <strong>We would like to extend a formal offer to you.</strong>
                                </p>
                                <p style="margin-top: 8px; color: #047857;">Our HR team will be in touch shortly with the detailed offer letter and next steps.</p>
                            </div>
                            <p>Please log in to your account to view your application status.</p>
                            <div style="text-align: center; margin: 24px 0;">
                                <a href="${require('../config').frontendUrl}/my-applications" style="display: inline-block; padding: 14px 32px; background-color: #059669; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">
                                    View Application
                                </a>
                            </div>
                            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
                            <p style="color: #9ca3af; font-size: 13px;">Best regards,<br>The Recruitment Team</p>
                        </div>
                    </div>
                    `
                ).then(() => console.log(`Offer email sent to ${candidate.email}`))
                 .catch(err => console.error(`Offer email FAILED for ${candidate.first_name} (${candidate.email}):`, err.message));
                offerEmailPromises.push(emailPromise);
            } else {
                console.warn(`No email found for candidate: ${candidate.first_name} ${candidate.last_name}`);
            }
        }

        // Wait for offer emails to be sent
        await Promise.allSettled(offerEmailPromises);

        // Get rejected candidates info and send rejection emails
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

            console.log('Rejected candidates:', rejectedCandidates.rows.map(c => ({ 
                name: `${c.first_name} ${c.last_name}`, 
                email: c.email || 'NO EMAIL FOUND' 
            })));

            const rejectEmailPromises = [];
            for (const candidate of rejectedCandidates.rows) {
                if (candidate.email) {
                    console.log(`Sending rejection email to: ${candidate.first_name} (${candidate.email})`);
                    const emailPromise = emailService.sendStatusUpdateEmail(
                        candidate.email,
                        candidate.first_name,
                        candidate.job_title,
                        'rejected'
                    ).then(() => console.log(`Rejection email sent to ${candidate.email}`))
                     .catch(err => console.error(`Rejection email FAILED for ${candidate.first_name} (${candidate.email}):`, err.message));
                    rejectEmailPromises.push(emailPromise);
                } else {
                    console.warn(`No email found for rejected candidate: ${candidate.first_name} ${candidate.last_name}`);
                }
            }

            // Wait for rejection emails to be sent
            await Promise.allSettled(rejectEmailPromises);
        }

        // Create in-app notifications for offer-extended candidates
        for (const candidate of selectedCandidates.rows) {
            try {
                const userIdResult = await db.query(`
                    SELECT COALESCE(cp.user_id, ep.user_id) as user_id, a.employee_id
                    FROM applications a
                    LEFT JOIN candidate_profiles cp ON a.candidate_id = cp.id
                    LEFT JOIN employee_profiles ep ON a.employee_id = ep.id
                    WHERE a.id = $1
                `, [candidate.id]);

                if (userIdResult.rows[0]?.user_id) {
                    await db.query(`
                        INSERT INTO notifications (user_id, title, message, type, link)
                        VALUES ($1, $2, $3, $4, $5)
                    `, [
                        userIdResult.rows[0].user_id,
                        `Offer Extended: ${candidate.job_title}`,
                        `Great news! You have received a job offer for the ${candidate.job_title} position. Please review and respond.`,
                        'application_offer',
                        userIdResult.rows[0].employee_id ? '/employee/applications' : '/candidate/applications'
                    ]);
                }
            } catch (notifErr) {
                console.error('Failed to create offer notification:', notifErr.message);
            }
        }

        // Record hiring decision
        for (const appId of selectedApplicationIds) {
            await db.query(`
                INSERT INTO hiring_decisions (application_id, decision, decision_date, decision_maker_id)
                VALUES ($1, 'offer_extended', CURRENT_DATE, $2)
                ON CONFLICT DO NOTHING
            `, [appId, req.user.id]).catch(() => {});
        }

        res.json({
            message: `Offer extended to ${offerResult.rows.length} candidate(s). Other interviewed candidates remain on hold until offer is accepted or declined.`,
            offers_extended: offerResult.rows.length,
            rejected: 0
        });

    } catch (error) {
        console.error('Finalize hiring error:', error);
        res.status(500).json({ error: 'Failed to finalize hiring decision' });
    }
});

// Get completed evaluations history — jobs where hiring decisions were finalized
router.get('/evaluations/history', authenticate, authorize('admin', 'hr_manager', 'recruiter'), async (req, res) => {
    try {
        // Jobs that had offers extended (evaluation completed)
        const result = await db.query(`
            SELECT DISTINCT j.id as job_id, j.title as job_title, j.department,
                   j.positions_available, j.positions_filled,
                   (SELECT COUNT(*) FROM applications a2 
                    JOIN interviews i2 ON i2.application_id = a2.id
                    WHERE a2.job_id = j.id AND i2.status = 'completed') as total_interviewed,
                   (SELECT COUNT(*) FROM applications a3 
                    WHERE a3.job_id = j.id AND a3.status IN ('offer_extended', 'offer_accepted', 'hired')) as offers_extended,
                   (SELECT COUNT(*) FROM applications a4 
                    WHERE a4.job_id = j.id AND a4.status = 'rejected' 
                    AND a4.reviewed_at IS NOT NULL) as rejected_count,
                   (SELECT MAX(a5.reviewed_at) FROM applications a5 
                    WHERE a5.job_id = j.id AND a5.status IN ('offer_extended', 'offer_accepted', 'hired')) as evaluation_date
            FROM jobs j
            WHERE EXISTS (
                SELECT 1 FROM applications a 
                WHERE a.job_id = j.id 
                AND a.status IN ('offer_extended', 'offer_accepted', 'hired')
                AND a.reviewed_at IS NOT NULL
            )
            ORDER BY evaluation_date DESC
        `);

        res.json(result.rows);
    } catch (error) {
        console.error('Get evaluations history error:', error);
        res.status(500).json({ error: 'Failed to get evaluations history' });
    }
});

// Get available time slots
router.get('/availability/:date', authenticate, authorize('admin', 'hr_manager', 'recruiter'), async (req, res) => {
    try {
        const { date } = req.params;
        const { interviewers } = req.query;

        // Get existing interviews for the date
        const existingInterviews = await db.query(`
            SELECT start_time, end_time FROM interviews
            WHERE scheduled_date = $1 AND status NOT IN ('cancelled')
        `, [date]);

        // Generate available slots (9 AM to 6 PM, 1 hour slots)
        const slots = [];
        for (let hour = 9; hour < 18; hour++) {
            const startTime = `${hour.toString().padStart(2, '0')}:00`;
            const endTime = `${(hour + 1).toString().padStart(2, '0')}:00`;
            
            const isBooked = existingInterviews.rows.some(i => 
                (startTime >= i.start_time && startTime < i.end_time) ||
                (endTime > i.start_time && endTime <= i.end_time)
            );
            
            slots.push({
                startTime,
                endTime,
                available: !isBooked
            });
        }

        res.json(slots);

    } catch (error) {
        console.error('Get availability error:', error);
        res.status(500).json({ error: 'Failed to get availability' });
    }
});

// Send reminder
router.post('/:id/send-reminder', authenticate, authorize('admin', 'hr_manager'), async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.query(`
            SELECT i.*, 
                   COALESCE(cp.first_name, ep.first_name) as first_name,
                   u.email, j.title
            FROM interviews i
            JOIN applications a ON i.application_id = a.id
            LEFT JOIN candidate_profiles cp ON a.candidate_id = cp.id
            LEFT JOIN employee_profiles ep ON a.employee_id = ep.id
            LEFT JOIN users u ON cp.user_id = u.id OR ep.user_id = u.id
            JOIN jobs j ON a.job_id = j.id
            WHERE i.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Interview not found' });
        }

        const interview = result.rows[0];

        await emailService.sendInterviewReminder(
            interview.email,
            interview.first_name,
            interview.title,
            {
                date: interview.scheduled_date,
                startTime: interview.start_time,
                location: interview.location,
                meetingLink: interview.meeting_link
            }
        );

        await db.query(`
            UPDATE interviews SET reminder_sent = true, reminder_sent_at = CURRENT_TIMESTAMP
            WHERE id = $1
        `, [id]);

        // Create in-app notification for the candidate
        try {
            const userIdResult = await db.query(`
                SELECT COALESCE(cp.user_id, ep.user_id) as user_id, a.employee_id
                FROM applications a
                LEFT JOIN candidate_profiles cp ON a.candidate_id = cp.id
                LEFT JOIN employee_profiles ep ON a.employee_id = ep.id
                WHERE a.id = $1
            `, [interview.application_id]);

            if (userIdResult.rows[0]?.user_id) {
                await db.query(`
                    INSERT INTO notifications (user_id, title, message, type, link)
                    VALUES ($1, $2, $3, $4, $5)
                `, [
                    userIdResult.rows[0].user_id,
                    `Interview Reminder: ${interview.title}`,
                    `Reminder: You have an upcoming interview for ${interview.title} on ${new Date(interview.scheduled_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}.`,
                    'interview_reminder',
                    userIdResult.rows[0].employee_id ? '/employee/interviews' : '/candidate/interviews'
                ]);
            }
        } catch (notifErr) {
            console.error('Failed to create reminder notification:', notifErr.message);
        }

        res.json({ message: 'Reminder sent successfully' });

    } catch (error) {
        console.error('Send reminder error:', error);
        res.status(500).json({ error: 'Failed to send reminder' });
    }
});

module.exports = router;
