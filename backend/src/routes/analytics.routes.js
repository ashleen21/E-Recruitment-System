const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// Get recruitment dashboard analytics
router.get('/dashboard', authenticate, authorize('admin', 'hr_manager', 'recruiter'), async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        
        // Default to last 90 days - add 1 day to endDate to make it inclusive
        const endDateRaw = end_date || new Date().toISOString().split('T')[0];
        // Add 1 day to end date to include the full day (BETWEEN uses < for end)
        const endDateInclusive = new Date(new Date(endDateRaw).getTime() + 24*60*60*1000).toISOString().split('T')[0];
        const startDate = start_date || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        // Comprehensive overview stats
        const overviewStats = await db.query(`
            SELECT
                (SELECT COUNT(*) FROM jobs WHERE status = 'published') as active_jobs,
                (SELECT COUNT(*) FROM jobs WHERE status IN ('closed', 'filled')) as closed_jobs,
                (SELECT COUNT(*) FROM applications WHERE submitted_at >= $1 AND submitted_at < $2) as total_applications,
                (SELECT COUNT(*) FROM applications WHERE status = 'hired' AND submitted_at >= $1 AND submitted_at < $2) as total_hires,
                (SELECT COUNT(*) FROM interviews WHERE scheduled_date >= $1 AND scheduled_date < $2) as total_interviews,
                (SELECT ROUND(AVG(ai_overall_score)::numeric, 1) FROM applications WHERE submitted_at >= $1 AND submitted_at < $2 AND ai_overall_score IS NOT NULL) as avg_candidate_score,
                (SELECT COUNT(*) FROM applications WHERE status = 'shortlisted') as shortlisted_count,
                (SELECT COUNT(*) FROM applications WHERE status = 'offer_extended') as offers_pending,
                (SELECT COUNT(*) FROM applications WHERE status = 'offer_accepted') as offers_accepted,
                (SELECT COUNT(*) FROM applications WHERE status = 'offer_declined') as offers_declined,
                (SELECT COUNT(*) FROM applications WHERE status = 'rejected' AND submitted_at >= $1 AND submitted_at < $2) as total_rejections,
                (SELECT COUNT(DISTINCT COALESCE(candidate_id, employee_id)) FROM applications WHERE submitted_at >= $1 AND submitted_at < $2) as unique_candidates,
                (SELECT COUNT(*) FROM applications WHERE submitted_at >= (CURRENT_DATE - INTERVAL '7 days')) as apps_this_week,
                (SELECT COUNT(*) FROM applications WHERE submitted_at >= (CURRENT_DATE - INTERVAL '14 days') AND submitted_at < (CURRENT_DATE - INTERVAL '7 days')) as apps_last_week,
                (SELECT COUNT(*) FROM interviews WHERE scheduled_date >= CURRENT_DATE AND status IN ('scheduled', 'confirmed')) as upcoming_interviews_count,
                (SELECT COUNT(*) FROM employee_profiles) as total_employees
        `, [startDate, endDateInclusive]);

        // Applications by status
        const applicationsByStatus = await db.query(`
            SELECT status, COUNT(*) as count
            FROM applications
            WHERE submitted_at >= $1 AND submitted_at < $2
            GROUP BY status
            ORDER BY count DESC
        `, [startDate, endDateInclusive]);

        // Applications over time (weekly)
        const applicationsOverTime = await db.query(`
            SELECT DATE_TRUNC('week', submitted_at)::date as date, COUNT(*) as count
            FROM applications
            WHERE submitted_at >= $1 AND submitted_at < $2
            GROUP BY DATE_TRUNC('week', submitted_at)
            ORDER BY date
        `, [startDate, endDateInclusive]);

        // Top performing jobs
        const topJobs = await db.query(`
            SELECT j.id, j.title, j.department,
                   COUNT(a.id) as application_count,
                   ROUND(AVG(a.ai_overall_score)::numeric, 1) as avg_score,
                   COUNT(CASE WHEN a.status = 'hired' THEN 1 END) as hires,
                   COUNT(CASE WHEN a.status = 'offer_extended' THEN 1 END) as pending_offers,
                   j.positions_available,
                   j.positions_filled
            FROM jobs j
            LEFT JOIN applications a ON j.id = a.job_id
            WHERE j.status = 'published'
            GROUP BY j.id, j.title, j.department, j.positions_available, j.positions_filled
            ORDER BY application_count DESC
            LIMIT 8
        `);

        // Hiring pipeline
        const pipeline = await db.query(`
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN status = 'submitted' THEN 1 END) as submitted,
                COUNT(CASE WHEN status = 'under_review' THEN 1 END) as under_review,
                COUNT(CASE WHEN status = 'shortlisted' THEN 1 END) as shortlisted,
                COUNT(CASE WHEN status = 'interview_scheduled' THEN 1 END) as interview_scheduled,
                COUNT(CASE WHEN status = 'interviewed' THEN 1 END) as interviewed,
                COUNT(CASE WHEN status = 'offer_extended' THEN 1 END) as offer_extended,
                COUNT(CASE WHEN status = 'offer_accepted' THEN 1 END) as offer_accepted,
                COUNT(CASE WHEN status = 'offer_declined' THEN 1 END) as offer_declined,
                COUNT(CASE WHEN status = 'hired' THEN 1 END) as hired,
                COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected
            FROM applications
            WHERE submitted_at >= $1 AND submitted_at < $2
        `, [startDate, endDateInclusive]);

        // Department breakdown
        const departmentStats = await db.query(`
            SELECT j.department,
                   COUNT(DISTINCT j.id) as open_positions,
                   COUNT(a.id) as applications,
                   COUNT(CASE WHEN a.status = 'hired' THEN 1 END) as hires,
                   COUNT(CASE WHEN a.status IN ('offer_extended','offer_accepted') THEN 1 END) as offers
            FROM jobs j
            LEFT JOIN applications a ON j.id = a.job_id
            WHERE j.department IS NOT NULL
            GROUP BY j.department
            ORDER BY applications DESC
        `);

        // Recent applications (last 10)
        const recentApplications = await db.query(`
            SELECT a.id, j.title as job_title, j.department,
                   COALESCE(
                       NULLIF(TRIM(COALESCE(cp.first_name, '') || ' ' || COALESCE(cp.last_name, '')), ''),
                       NULLIF(TRIM(COALESCE(ep.first_name, '') || ' ' || COALESCE(ep.last_name, '')), ''),
                       u.email,
                       'Unknown'
                   ) as candidate_name,
                   a.status,
                   a.ai_overall_score,
                   a.submitted_at,
                   CASE WHEN a.employee_id IS NOT NULL THEN 'internal' ELSE 'external' END as type
            FROM applications a
            JOIN jobs j ON a.job_id = j.id
            LEFT JOIN candidate_profiles cp ON a.candidate_id = cp.id
            LEFT JOIN employee_profiles ep ON a.employee_id = ep.id
            LEFT JOIN users u ON u.id = COALESCE(cp.user_id, ep.user_id)
            ORDER BY a.submitted_at DESC
            LIMIT 10
        `);

        // Upcoming interviews (next 10)
        const upcomingInterviews = await db.query(`
            SELECT i.id, i.scheduled_date, i.start_time, i.end_time, i.interview_type,
                   i.location, i.status as interview_status,
                   j.title as job_title,
                   COALESCE(
                       NULLIF(TRIM(COALESCE(cp.first_name, '') || ' ' || COALESCE(cp.last_name, '')), ''),
                       NULLIF(TRIM(COALESCE(ep.first_name, '') || ' ' || COALESCE(ep.last_name, '')), ''),
                       u.email,
                       'Unknown'
                   ) as candidate_name
            FROM interviews i
            JOIN applications a ON i.application_id = a.id
            JOIN jobs j ON a.job_id = j.id
            LEFT JOIN candidate_profiles cp ON a.candidate_id = cp.id
            LEFT JOIN employee_profiles ep ON a.employee_id = ep.id
            LEFT JOIN users u ON u.id = COALESCE(cp.user_id, ep.user_id)
            WHERE i.scheduled_date >= CURRENT_DATE
              AND i.status IN ('scheduled', 'confirmed')
            ORDER BY i.scheduled_date ASC, i.start_time ASC
            LIMIT 10
        `);

        res.json({
            overview: overviewStats.rows[0],
            applicationsByStatus: applicationsByStatus.rows,
            applicationsOverTime: applicationsOverTime.rows,
            topJobs: topJobs.rows,
            pipeline: pipeline.rows[0],
            departmentStats: departmentStats.rows,
            recentApplications: recentApplications.rows,
            upcomingInterviews: upcomingInterviews.rows,
            dateRange: { startDate, endDate: endDateRaw },
            generatedAt: new Date().toISOString()
        });

    } catch (error) {
        console.error('Get dashboard error:', error);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

// Get job-specific analytics
router.get('/jobs/:id', authenticate, authorize('admin', 'hr_manager'), async (req, res) => {
    try {
        const { id } = req.params;

        // Job details and stats
        const jobStats = await db.query(`
            SELECT j.*,
                   COUNT(a.id) as total_applications,
                   AVG(a.ai_overall_score) as avg_score,
                   MIN(a.ai_overall_score) as min_score,
                   MAX(a.ai_overall_score) as max_score,
                   COUNT(CASE WHEN a.status = 'shortlisted' THEN 1 END) as shortlisted,
                   COUNT(CASE WHEN a.status = 'interviewed' THEN 1 END) as interviewed,
                   COUNT(CASE WHEN a.status = 'hired' THEN 1 END) as hired,
                   COUNT(CASE WHEN a.status = 'rejected' THEN 1 END) as rejected
            FROM jobs j
            LEFT JOIN applications a ON j.id = a.job_id
            WHERE j.id = $1
            GROUP BY j.id
        `, [id]);

        if (jobStats.rows.length === 0) {
            return res.status(404).json({ error: 'Job not found' });
        }

        // Score distribution
        const scoreDistribution = await db.query(`
            SELECT 
                CASE 
                    WHEN ai_overall_score >= 90 THEN '90-100'
                    WHEN ai_overall_score >= 80 THEN '80-89'
                    WHEN ai_overall_score >= 70 THEN '70-79'
                    WHEN ai_overall_score >= 60 THEN '60-69'
                    ELSE 'Below 60'
                END as range,
                COUNT(*) as count
            FROM applications
            WHERE job_id = $1 AND ai_overall_score IS NOT NULL
            GROUP BY range
            ORDER BY range DESC
        `, [id]);

        // Applications over time
        const applicationsOverTime = await db.query(`
            SELECT DATE(submitted_at) as date, COUNT(*) as count
            FROM applications
            WHERE job_id = $1
            GROUP BY DATE(submitted_at)
            ORDER BY date
        `, [id]);

        // Top candidates
        const topCandidates = await db.query(`
            SELECT a.id, a.ai_overall_score, a.status,
                   cp.first_name, cp.last_name, cp.current_job_title, cp.years_of_experience,
                   u.email
            FROM applications a
            JOIN candidate_profiles cp ON a.candidate_id = cp.id
            JOIN users u ON cp.user_id = u.id
            WHERE a.job_id = $1
            ORDER BY a.ai_overall_score DESC NULLS LAST
            LIMIT 10
        `, [id]);

        // Skill match analysis
        const skillAnalysis = await db.query(`
            SELECT 
                a.ai_skill_gap_analysis,
                a.ai_strengths,
                a.ai_concerns
            FROM applications a
            WHERE a.job_id = $1 AND a.ai_skill_gap_analysis IS NOT NULL
        `, [id]);

        res.json({
            job: jobStats.rows[0],
            scoreDistribution: scoreDistribution.rows,
            applicationsOverTime: applicationsOverTime.rows,
            topCandidates: topCandidates.rows,
            skillAnalysis: skillAnalysis.rows
        });

    } catch (error) {
        console.error('Get job analytics error:', error);
        res.status(500).json({ error: 'Failed to fetch job analytics' });
    }
});

// Generate report (GET)
router.get('/reports', authenticate, authorize('admin', 'hr_manager', 'recruiter'), async (req, res) => {
    try {
        const { type, start, end, department } = req.query;

        const endDate = end || new Date().toISOString().split('T')[0];
        const startDate = start || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        let reportData;

        switch (type) {
            case 'hiring':
                reportData = await generateHiringSummaryReport(startDate, endDate, department);
                break;
            case 'pipeline':
                reportData = await generatePipelineReport(startDate, endDate, department);
                break;
            case 'interviews':
                reportData = await generateInterviewReport(startDate, endDate, department);
                break;
            case 'departments':
                reportData = await generateDepartmentReport(startDate, endDate, department);
                break;
            case 'employees':
                reportData = await generateEmployeeReport(startDate, endDate, department);
                break;
            case 'offers':
                reportData = await generateOffersReport(startDate, endDate, department);
                break;
            default:
                reportData = await generateHiringSummaryReport(startDate, endDate, department);
        }

        res.json({
            reportType: type || 'hiring',
            generatedAt: new Date().toISOString(),
            dateRange: { start: startDate, end: endDate },
            ...reportData
        });

    } catch (error) {
        console.error('Generate report error:', error);
        res.status(500).json({ error: 'Failed to generate report' });
    }
});

// Generate report (POST - keep for backward compat)
router.post('/reports/generate', authenticate, authorize('admin', 'hr_manager'), async (req, res) => {
    try {
        const { report_type, start_date, end_date, filters } = req.body;

        let reportData;

        switch (report_type) {
            case 'hiring_summary':
                reportData = await generateHiringSummaryReport(start_date, end_date);
                break;
            case 'candidate_pipeline':
                reportData = await generatePipelineReport(start_date, end_date);
                break;
            case 'time_to_hire':
                reportData = await generateInterviewReport(start_date, end_date);
                break;
            case 'source_effectiveness':
                reportData = await generateOffersReport(start_date, end_date);
                break;
            case 'department_metrics':
                reportData = await generateDepartmentReport(start_date, end_date);
                break;
            default:
                return res.status(400).json({ error: 'Invalid report type' });
        }

        res.json({
            reportType: report_type,
            generatedAt: new Date().toISOString(),
            dateRange: { start_date, end_date },
            data: reportData
        });

    } catch (error) {
        console.error('Generate report error:', error);
        res.status(500).json({ error: 'Failed to generate report' });
    }
});

// AI predictions analytics
router.get('/ai-predictions', authenticate, authorize('admin', 'hr_manager'), async (req, res) => {
    try {
        // Prediction accuracy
        const accuracy = await db.query(`
            SELECT 
                AVG(CASE WHEN hd.still_employed = true AND a.ai_retention_prediction >= 0.7 THEN 1
                         WHEN hd.still_employed = false AND a.ai_retention_prediction < 0.7 THEN 1
                         ELSE 0 END) as retention_accuracy,
                COUNT(*) as sample_size
            FROM hiring_decisions hd
            JOIN applications a ON hd.application_id = a.id
            WHERE hd.hire_date IS NOT NULL AND hd.hire_date < NOW() - INTERVAL '6 months'
        `);

        // Score vs outcome correlation
        const correlation = await db.query(`
            SELECT 
                CASE 
                    WHEN a.ai_overall_score >= 85 THEN 'High (85+)'
                    WHEN a.ai_overall_score >= 70 THEN 'Medium (70-84)'
                    ELSE 'Low (<70)'
                END as score_range,
                COUNT(*) as total_hired,
                AVG(hd.tenure_months) as avg_tenure,
                AVG((hd.performance_ratings->>'latest')::numeric) as avg_performance
            FROM applications a
            JOIN hiring_decisions hd ON a.id = hd.application_id
            WHERE hd.decision = 'hired'
            GROUP BY score_range
        `);

        res.json({
            predictionAccuracy: accuracy.rows[0],
            scoreOutcomeCorrelation: correlation.rows
        });

    } catch (error) {
        console.error('Get AI predictions error:', error);
        res.status(500).json({ error: 'Failed to fetch AI predictions analytics' });
    }
});

// Internal mobility analytics
router.get('/internal-mobility', authenticate, authorize('admin', 'hr_manager'), async (req, res) => {
    try {
        const stats = await db.query(`
            SELECT 
                COUNT(DISTINCT ijm.employee_id) as employees_matched,
                COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN ijm.employee_id END) as employees_applied,
                COUNT(DISTINCT CASE WHEN a.status = 'hired' THEN a.employee_id END) as internal_hires,
                AVG(ijm.overall_match_score) as avg_match_score
            FROM internal_job_matches ijm
            LEFT JOIN applications a ON ijm.job_id = a.job_id AND ijm.employee_id = a.employee_id
        `);

        const topMatches = await db.query(`
            SELECT 
                ep.first_name, ep.last_name, ep.department, ep.job_title,
                j.title as matched_job, ijm.overall_match_score, ijm.skill_gaps
            FROM internal_job_matches ijm
            JOIN employee_profiles ep ON ijm.employee_id = ep.id
            JOIN jobs j ON ijm.job_id = j.id
            WHERE j.status = 'published'
            ORDER BY ijm.overall_match_score DESC
            LIMIT 20
        `);

        res.json({
            overview: stats.rows[0],
            topMatches: topMatches.rows
        });

    } catch (error) {
        console.error('Get internal mobility error:', error);
        res.status(500).json({ error: 'Failed to fetch internal mobility analytics' });
    }
});

// =============================================
// COMPREHENSIVE ANALYTICS PAGE ENDPOINT
// =============================================
router.get('/comprehensive', authenticate, authorize('admin', 'hr_manager', 'recruiter'), async (req, res) => {
    try {
        const { days = 90 } = req.query;
        const daysInt = parseInt(days) || 90;
        const startDate = new Date(Date.now() - daysInt * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const endDateRaw = new Date().toISOString().split('T')[0];
        // Add 1 day to make end date inclusive
        const endDate = new Date(new Date(endDateRaw).getTime() + 24*60*60*1000).toISOString().split('T')[0];

        // Previous period for comparison
        const prevStart = new Date(Date.now() - daysInt * 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const prevEnd = startDate;

        // 1. Overview with period comparison
        const overview = await db.query(`
            SELECT
                (SELECT COUNT(*) FROM jobs WHERE status = 'published') as active_jobs,
                (SELECT COUNT(*) FROM jobs WHERE status IN ('closed', 'filled')) as closed_jobs,
                (SELECT COUNT(*) FROM applications WHERE submitted_at >= $1 AND submitted_at < $2) as total_applications,
                (SELECT COUNT(*) FROM applications WHERE submitted_at >= $3 AND submitted_at < $4) as prev_applications,
                (SELECT COUNT(*) FROM applications WHERE status = 'hired' AND submitted_at >= $1 AND submitted_at < $2) as total_hires,
                (SELECT COUNT(*) FROM applications WHERE status = 'hired' AND submitted_at >= $3 AND submitted_at < $4) as prev_hires,
                (SELECT COUNT(*) FROM applications WHERE status = 'rejected' AND submitted_at >= $1 AND submitted_at < $2) as total_rejections,
                (SELECT COUNT(*) FROM applications WHERE status = 'offer_extended') as offers_pending,
                (SELECT COUNT(*) FROM applications WHERE status = 'offer_accepted' AND submitted_at >= $1 AND submitted_at < $2) as offers_accepted,
                (SELECT COUNT(*) FROM applications WHERE status = 'offer_declined' AND submitted_at >= $1 AND submitted_at < $2) as offers_declined,
                (SELECT COUNT(*) FROM interviews WHERE scheduled_date >= $1 AND scheduled_date < $2) as total_interviews,
                (SELECT COUNT(*) FROM interviews WHERE scheduled_date >= $3 AND scheduled_date < $4) as prev_interviews,
                (SELECT COUNT(DISTINCT COALESCE(candidate_id, employee_id)) FROM applications WHERE submitted_at >= $1 AND submitted_at < $2) as unique_candidates,
                (SELECT ROUND(AVG(ai_overall_score)::numeric, 1) FROM applications WHERE submitted_at >= $1 AND submitted_at < $2 AND ai_overall_score IS NOT NULL) as avg_ai_score,
                (SELECT ROUND(AVG(ai_overall_score)::numeric, 1) FROM applications WHERE submitted_at >= $3 AND submitted_at < $4 AND ai_overall_score IS NOT NULL) as prev_avg_ai_score,
                (SELECT COUNT(*) FROM applications WHERE status = 'shortlisted') as shortlisted,
                (SELECT COUNT(*) FROM employee_profiles) as total_employees,
                (SELECT COUNT(*) FROM employee_profiles WHERE internal_mobility_interest = true) as mobility_interested
        `, [startDate, endDate, prevStart, prevEnd]);

        // 2. Applications by status (current period)
        const statusBreakdown = await db.query(`
            SELECT status, COUNT(*) as count
            FROM applications
            WHERE submitted_at >= $1 AND submitted_at < $2
            GROUP BY status
            ORDER BY count DESC
        `, [startDate, endDate]);

        // 3. Application trend (weekly)
        const weeklyTrend = await db.query(`
            SELECT DATE_TRUNC('week', submitted_at)::date as week,
                   COUNT(*) as applications,
                   COUNT(CASE WHEN status = 'hired' THEN 1 END) as hires,
                   COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejections,
                   ROUND(AVG(ai_overall_score)::numeric, 1) as avg_score
            FROM applications
            WHERE submitted_at >= $1 AND submitted_at < $2
            GROUP BY DATE_TRUNC('week', submitted_at)
            ORDER BY week
        `, [startDate, endDate]);

        // 4. Hiring pipeline with conversion rates
        const pipeline = await db.query(`
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN status = 'submitted' THEN 1 END) as submitted,
                COUNT(CASE WHEN status = 'under_review' THEN 1 END) as under_review,
                COUNT(CASE WHEN status = 'shortlisted' THEN 1 END) as shortlisted,
                COUNT(CASE WHEN status IN ('interview_scheduled', 'interviewed') THEN 1 END) as interviewed,
                COUNT(CASE WHEN status IN ('offer_extended', 'offer_accepted', 'offer_declined') THEN 1 END) as offered,
                COUNT(CASE WHEN status = 'hired' THEN 1 END) as hired,
                COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected,
                COUNT(CASE WHEN status = 'withdrawn' THEN 1 END) as withdrawn
            FROM applications
            WHERE submitted_at >= $1 AND submitted_at < $2
        `, [startDate, endDate]);

        // 5. Department performance
        const departments = await db.query(`
            SELECT j.department,
                   COUNT(DISTINCT j.id) as job_count,
                   COUNT(a.id) as total_apps,
                   COUNT(CASE WHEN a.status = 'hired' THEN 1 END) as hires,
                   COUNT(CASE WHEN a.status IN ('offer_extended','offer_accepted','offer_declined') THEN 1 END) as offers,
                   COUNT(CASE WHEN a.status = 'rejected' THEN 1 END) as rejected,
                   ROUND(AVG(a.ai_overall_score)::numeric, 1) as avg_score,
                   CASE WHEN COUNT(a.id) > 0 
                        THEN ROUND(COUNT(CASE WHEN a.status = 'hired' THEN 1 END)::numeric / COUNT(a.id) * 100, 1)
                        ELSE 0 END as hire_rate
            FROM jobs j
            LEFT JOIN applications a ON j.id = a.job_id AND a.submitted_at >= $1 AND a.submitted_at < $2
            WHERE j.department IS NOT NULL
            GROUP BY j.department
            ORDER BY total_apps DESC
        `, [startDate, endDate]);

        // 6. Top performing jobs
        const topJobs = await db.query(`
            SELECT j.id, j.title, j.department, j.status as job_status,
                   j.positions_available, j.positions_filled,
                   COUNT(a.id) as application_count,
                   ROUND(AVG(a.ai_overall_score)::numeric, 1) as avg_score,
                   COUNT(CASE WHEN a.status = 'hired' THEN 1 END) as hires,
                   COUNT(CASE WHEN a.status IN ('offer_extended','offer_accepted') THEN 1 END) as pending_offers,
                   COUNT(CASE WHEN a.status = 'rejected' THEN 1 END) as rejected,
                   CASE WHEN COUNT(a.id) > 0 
                        THEN ROUND(COUNT(CASE WHEN a.status = 'hired' THEN 1 END)::numeric / COUNT(a.id) * 100, 1)
                        ELSE 0 END as conversion_rate
            FROM jobs j
            LEFT JOIN applications a ON j.id = a.job_id
            WHERE (j.status = 'published' OR (j.status IN ('closed','filled') AND j.updated_at >= $1 AND j.updated_at < $2))
            GROUP BY j.id, j.title, j.department, j.status, j.positions_available, j.positions_filled
            ORDER BY application_count DESC
            LIMIT 15
        `, [startDate, endDate]);

        // 7. AI Score distribution
        const scoreDistribution = await db.query(`
            SELECT 
                CASE 
                    WHEN ai_overall_score >= 90 THEN '90-100'
                    WHEN ai_overall_score >= 80 THEN '80-89'
                    WHEN ai_overall_score >= 70 THEN '70-79'
                    WHEN ai_overall_score >= 60 THEN '60-69'
                    WHEN ai_overall_score >= 50 THEN '50-59'
                    ELSE 'Below 50'
                END as score_range,
                COUNT(*) as count
            FROM applications
            WHERE submitted_at >= $1 AND submitted_at < $2 AND ai_overall_score IS NOT NULL
            GROUP BY score_range
            ORDER BY score_range DESC
        `, [startDate, endDate]);

        // 8. Interview analytics
        const interviewStats = await db.query(`
            SELECT 
                COUNT(*) as total_interviews,
                COUNT(CASE WHEN i.status = 'completed' THEN 1 END) as completed,
                COUNT(CASE WHEN i.status IN ('scheduled', 'confirmed') THEN 1 END) as upcoming,
                COUNT(CASE WHEN i.status = 'cancelled' THEN 1 END) as cancelled,
                COUNT(CASE WHEN i.status = 'no_show' THEN 1 END) as no_shows,
                COUNT(CASE WHEN i.interview_type = 'video' THEN 1 END) as video,
                COUNT(CASE WHEN i.interview_type = 'in_person' THEN 1 END) as in_person,
                COUNT(CASE WHEN i.interview_type = 'technical' THEN 1 END) as technical,
                COUNT(CASE WHEN i.interview_type = 'panel' THEN 1 END) as panel,
                ROUND(AVG(f.overall_rating)::numeric, 2) as avg_rating,
                ROUND(AVG(f.technical_skills_rating)::numeric, 2) as avg_technical,
                ROUND(AVG(f.communication_rating)::numeric, 2) as avg_communication,
                ROUND(AVG(f.cultural_fit_rating)::numeric, 2) as avg_cultural_fit
            FROM interviews i
            LEFT JOIN interview_feedback f ON f.interview_id = i.id
            WHERE i.scheduled_date >= $1 AND i.scheduled_date < $2
        `, [startDate, endDate]);

        // 9. Offer analytics
        const offerAnalytics = await db.query(`
            SELECT
                COUNT(CASE WHEN a.status = 'offer_extended' THEN 1 END) as pending,
                COUNT(CASE WHEN a.status = 'offer_accepted' THEN 1 END) as accepted,
                COUNT(CASE WHEN a.status = 'offer_declined' THEN 1 END) as declined,
                COUNT(CASE WHEN a.status = 'hired' THEN 1 END) as hired,
                COUNT(CASE WHEN a.status IN ('offer_extended','offer_accepted','offer_declined','hired') THEN 1 END) as total_offers,
                CASE WHEN COUNT(CASE WHEN a.status IN ('offer_accepted','hired','offer_declined') THEN 1 END) > 0
                     THEN ROUND(COUNT(CASE WHEN a.status IN ('offer_accepted','hired') THEN 1 END)::numeric /
                          COUNT(CASE WHEN a.status IN ('offer_accepted','hired','offer_declined') THEN 1 END) * 100, 1)
                     ELSE 0 END as acceptance_rate
            FROM applications a
            WHERE a.status IN ('offer_extended', 'offer_accepted', 'offer_declined', 'hired')
        `);

        // 10. Internal mobility
        const internalApps = await db.query(`
            SELECT
                COUNT(*) as total_internal_apps,
                COUNT(CASE WHEN a.status = 'hired' THEN 1 END) as internal_hires,
                COUNT(CASE WHEN a.status IN ('offer_extended','offer_accepted') THEN 1 END) as internal_offers,
                COUNT(CASE WHEN a.status = 'rejected' THEN 1 END) as internal_rejected,
                COUNT(CASE WHEN a.status IN ('interview_scheduled','interviewed') THEN 1 END) as internal_interviewing
            FROM applications a
            WHERE a.employee_id IS NOT NULL AND a.submitted_at >= $1 AND a.submitted_at < $2
        `, [startDate, endDate]);

        // 11. Monthly hires trend (last 6 months)
        const monthlyHires = await db.query(`
            SELECT DATE_TRUNC('month', submitted_at)::date as month,
                   COUNT(*) as applications,
                   COUNT(CASE WHEN status = 'hired' THEN 1 END) as hires
            FROM applications
            WHERE submitted_at >= (CURRENT_DATE - INTERVAL '6 months')
            GROUP BY DATE_TRUNC('month', submitted_at)
            ORDER BY month
        `);

        // 12. Time-based insights (daily application pattern)
        const dailyPattern = await db.query(`
            SELECT EXTRACT(DOW FROM submitted_at)::int as day_of_week,
                   COUNT(*) as count
            FROM applications
            WHERE submitted_at >= $1 AND submitted_at < $2
            GROUP BY day_of_week
            ORDER BY day_of_week
        `, [startDate, endDate]);

        res.json({
            overview: overview.rows[0],
            statusBreakdown: statusBreakdown.rows,
            weeklyTrend: weeklyTrend.rows,
            pipeline: pipeline.rows[0],
            departments: departments.rows,
            topJobs: topJobs.rows,
            scoreDistribution: scoreDistribution.rows,
            interviewStats: interviewStats.rows[0],
            offerAnalytics: offerAnalytics.rows[0],
            internalApps: internalApps.rows[0],
            monthlyHires: monthlyHires.rows,
            dailyPattern: dailyPattern.rows,
            dateRange: { start: startDate, end: endDate },
            period: daysInt,
            generatedAt: new Date().toISOString()
        });

    } catch (error) {
        console.error('Get comprehensive analytics error:', error);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

// =============================================
// REPORT GENERATION HELPER FUNCTIONS
// =============================================

async function generateHiringSummaryReport(startDate, endDateRaw, department) {
    // Add 1 day to end date for inclusive range
    const endDate = new Date(new Date(endDateRaw).getTime() + 24*60*60*1000).toISOString().split('T')[0];
    
    // Summary stats
    const summary = await db.query(`
        SELECT
            (SELECT COUNT(*) FROM jobs WHERE status = 'published') as active_jobs,
            (SELECT COUNT(*) FROM jobs WHERE status IN ('closed', 'filled')) as closed_jobs,
            (SELECT COUNT(*) FROM applications WHERE submitted_at >= $1 AND submitted_at < $2) as total_applications,
            (SELECT COUNT(*) FROM applications WHERE status = 'hired' AND submitted_at >= $1 AND submitted_at < $2) as total_hires,
            (SELECT COUNT(*) FROM applications WHERE status = 'rejected' AND submitted_at >= $1 AND submitted_at < $2) as total_rejections,
            (SELECT COUNT(*) FROM applications WHERE status = 'offer_extended' AND submitted_at >= $1 AND submitted_at < $2) as offers_extended,
            (SELECT COUNT(*) FROM applications WHERE status = 'offer_accepted' AND submitted_at >= $1 AND submitted_at < $2) as offers_accepted,
            (SELECT COUNT(*) FROM applications WHERE status = 'offer_declined' AND submitted_at >= $1 AND submitted_at < $2) as offers_declined,
            (SELECT COUNT(*) FROM applications WHERE status = 'withdrawn' AND submitted_at >= $1 AND submitted_at < $2) as withdrawals,
            (SELECT COUNT(*) FROM interviews WHERE scheduled_date >= $1 AND scheduled_date < $2) as total_interviews,
            (SELECT COUNT(DISTINCT COALESCE(candidate_id, employee_id)) FROM applications WHERE submitted_at >= $1 AND submitted_at < $2) as unique_applicants,
            (SELECT ROUND(AVG(ai_overall_score)::numeric, 1) FROM applications WHERE submitted_at >= $1 AND submitted_at < $2 AND ai_overall_score IS NOT NULL) as avg_ai_score
    `, [startDate, endDate]);

    // Jobs detail - each job's applications and statuses
    let jobsQuery = `
        SELECT j.title as job_title, j.department, j.status as job_status,
               j.positions_available, j.positions_filled,
               COUNT(a.id) as total_apps,
               COUNT(CASE WHEN a.status = 'shortlisted' THEN 1 END) as shortlisted,
               COUNT(CASE WHEN a.status IN ('interview_scheduled', 'interviewed') THEN 1 END) as interviewed,
               COUNT(CASE WHEN a.status = 'offer_extended' THEN 1 END) as offers,
               COUNT(CASE WHEN a.status = 'hired' THEN 1 END) as hired,
               COUNT(CASE WHEN a.status = 'rejected' THEN 1 END) as rejected,
               ROUND(AVG(a.ai_overall_score)::numeric, 1) as avg_score,
               j.created_at::date as posted_date
        FROM jobs j
        LEFT JOIN applications a ON j.id = a.job_id
        WHERE j.created_at >= $1 AND j.created_at < $2 OR j.status = 'published'
    `;
    const params = [startDate, endDate];
    if (department) {
        jobsQuery += ` AND j.department = $3`;
        params.push(department);
    }
    jobsQuery += ` GROUP BY j.id, j.title, j.department, j.status, j.positions_available, j.positions_filled, j.created_at ORDER BY j.created_at DESC`;

    const rows = await db.query(jobsQuery, params);

    // Applications over time (weekly)
    const trend = await db.query(`
        SELECT DATE_TRUNC('week', submitted_at)::date as week, COUNT(*) as applications
        FROM applications
        WHERE submitted_at >= $1 AND submitted_at < $2
        GROUP BY DATE_TRUNC('week', submitted_at)
        ORDER BY week
    `, [startDate, endDate]);

    return { summary: summary.rows[0], rows: rows.rows, trend: trend.rows };
}

async function generatePipelineReport(startDate, endDateRaw, department) {
    // Add 1 day to end date for inclusive range
    const endDate = new Date(new Date(endDateRaw).getTime() + 24*60*60*1000).toISOString().split('T')[0];
    
    // Pipeline funnel
    const funnel = await db.query(`
        SELECT 
            COUNT(*) as total,
            COUNT(CASE WHEN status IN ('submitted') THEN 1 END) as submitted,
            COUNT(CASE WHEN status IN ('under_review') THEN 1 END) as under_review,
            COUNT(CASE WHEN status IN ('shortlisted') THEN 1 END) as shortlisted,
            COUNT(CASE WHEN status IN ('interview_scheduled') THEN 1 END) as interview_scheduled,
            COUNT(CASE WHEN status IN ('interviewed') THEN 1 END) as interviewed,
            COUNT(CASE WHEN status IN ('offer_extended') THEN 1 END) as offer_extended,
            COUNT(CASE WHEN status IN ('offer_accepted') THEN 1 END) as offer_accepted,
            COUNT(CASE WHEN status IN ('offer_declined') THEN 1 END) as offer_declined,
            COUNT(CASE WHEN status IN ('hired') THEN 1 END) as hired,
            COUNT(CASE WHEN status IN ('rejected') THEN 1 END) as rejected,
            COUNT(CASE WHEN status IN ('withdrawn') THEN 1 END) as withdrawn
        FROM applications
        WHERE submitted_at >= $1 AND submitted_at < $2
    `, [startDate, endDate]);

    // Per-job pipeline
    let jobPipelineQuery = `
        SELECT j.title as job_title, j.department,
               COUNT(*) as total,
               COUNT(CASE WHEN a.status = 'submitted' THEN 1 END) as submitted,
               COUNT(CASE WHEN a.status = 'under_review' THEN 1 END) as reviewing,
               COUNT(CASE WHEN a.status = 'shortlisted' THEN 1 END) as shortlisted,
               COUNT(CASE WHEN a.status IN ('interview_scheduled', 'interviewed') THEN 1 END) as interviewing,
               COUNT(CASE WHEN a.status = 'offer_extended' THEN 1 END) as offered,
               COUNT(CASE WHEN a.status = 'hired' THEN 1 END) as hired,
               COUNT(CASE WHEN a.status = 'rejected' THEN 1 END) as rejected
        FROM jobs j
        LEFT JOIN applications a ON j.id = a.job_id AND a.submitted_at >= $1 AND a.submitted_at < $2
        WHERE j.status IN ('published', 'closed', 'filled')
    `;
    const params = [startDate, endDate];
    if (department) {
        jobPipelineQuery += ` AND j.department = $3`;
        params.push(department);
    }
    jobPipelineQuery += ` GROUP BY j.id, j.title, j.department HAVING COUNT(a.id) > 0 ORDER BY COUNT(*) DESC`;

    const rows = await db.query(jobPipelineQuery, params);

    // Conversion rates
    const total = parseInt(funnel.rows[0]?.total || 0);
    const totalOffers = parseInt(funnel.rows[0].offer_extended || 0) + parseInt(funnel.rows[0].offer_accepted || 0) + parseInt(funnel.rows[0].offer_declined || 0);
    const totalHired = parseInt(funnel.rows[0].hired || 0);
    const conversion = {
        application_to_review: total > 0 ? Math.round((total - parseInt(funnel.rows[0].submitted)) / total * 100) : 0,
        review_to_shortlist: total > 0 ? Math.round(parseInt(funnel.rows[0].shortlisted) / total * 100) : 0,
        shortlist_to_interview: parseInt(funnel.rows[0].shortlisted) > 0 ? Math.round((parseInt(funnel.rows[0].interview_scheduled) + parseInt(funnel.rows[0].interviewed)) / parseInt(funnel.rows[0].shortlisted) * 100) : 0,
        interview_to_offer: (parseInt(funnel.rows[0].interviewed) + parseInt(funnel.rows[0].interview_scheduled)) > 0 ? Math.round((totalOffers + totalHired) / (parseInt(funnel.rows[0].interviewed) + parseInt(funnel.rows[0].interview_scheduled)) * 100) : 0,
        offer_to_hire: (totalOffers + totalHired) > 0 ? Math.round(totalHired / (totalOffers + totalHired) * 100) : 0,
        offer_acceptance_rate: (parseInt(funnel.rows[0].offer_accepted || 0) + parseInt(funnel.rows[0].offer_declined || 0) + totalHired) > 0 ? Math.round((parseInt(funnel.rows[0].offer_accepted || 0) + totalHired) / (parseInt(funnel.rows[0].offer_accepted || 0) + parseInt(funnel.rows[0].offer_declined || 0) + totalHired) * 100) : 0,
    };

    return { summary: funnel.rows[0], conversion, rows: rows.rows };
}

async function generateInterviewReport(startDate, endDateRaw, department) {
    // Add 1 day to end date for inclusive range
    const endDate = new Date(new Date(endDateRaw).getTime() + 24*60*60*1000).toISOString().split('T')[0];
    
    // Interview summary
    const summary = await db.query(`
        SELECT
            COUNT(*) as total_interviews,
            COUNT(CASE WHEN i.status = 'completed' THEN 1 END) as completed,
            COUNT(CASE WHEN i.status = 'scheduled' THEN 1 END) as scheduled,
            COUNT(CASE WHEN i.status = 'confirmed' THEN 1 END) as confirmed,
            COUNT(CASE WHEN i.status = 'cancelled' THEN 1 END) as cancelled,
            COUNT(CASE WHEN i.status = 'no_show' THEN 1 END) as no_shows,
            COUNT(CASE WHEN i.interview_type = 'video' THEN 1 END) as video_interviews,
            COUNT(CASE WHEN i.interview_type = 'in_person' THEN 1 END) as in_person_interviews,
            COUNT(CASE WHEN i.interview_type = 'technical' THEN 1 END) as technical_interviews,
            COUNT(CASE WHEN i.interview_type = 'panel' THEN 1 END) as panel_interviews
        FROM interviews i
        WHERE i.scheduled_date >= $1 AND i.scheduled_date < $2
    `, [startDate, endDate]);

    // Feedback averages
    const feedback = await db.query(`
        SELECT
            ROUND(AVG(f.overall_rating)::numeric, 2) as avg_overall,
            ROUND(AVG(f.technical_skills_rating)::numeric, 2) as avg_technical,
            ROUND(AVG(f.communication_rating)::numeric, 2) as avg_communication,
            ROUND(AVG(f.problem_solving_rating)::numeric, 2) as avg_problem_solving,
            ROUND(AVG(f.cultural_fit_rating)::numeric, 2) as avg_cultural_fit,
            ROUND(AVG(f.leadership_rating)::numeric, 2) as avg_leadership,
            COUNT(*) as total_feedback,
            COUNT(CASE WHEN f.hire_recommendation = true THEN 1 END) as recommended_hire,
            COUNT(CASE WHEN f.hire_recommendation = false THEN 1 END) as recommended_reject
        FROM interview_feedback f
        JOIN interviews i ON f.interview_id = i.id
        WHERE i.scheduled_date >= $1 AND i.scheduled_date < $2
    `, [startDate, endDate]);

    // Per-job interview details
    let rowsQuery = `
        SELECT j.title as job_title, j.department,
               COUNT(i.id) as total_interviews,
               COUNT(CASE WHEN i.status = 'completed' THEN 1 END) as completed,
               COUNT(CASE WHEN i.status = 'cancelled' THEN 1 END) as cancelled,
               COUNT(CASE WHEN i.status = 'no_show' THEN 1 END) as no_shows,
               ROUND(AVG(f.overall_rating)::numeric, 2) as avg_rating,
               COUNT(CASE WHEN f.hire_recommendation = true THEN 1 END) as hire_recommended,
               COUNT(f.id) as feedback_count
        FROM interviews i
        JOIN applications a ON i.application_id = a.id
        JOIN jobs j ON a.job_id = j.id
        LEFT JOIN interview_feedback f ON f.interview_id = i.id
        WHERE i.scheduled_date >= $1 AND i.scheduled_date < $2
    `;
    const params = [startDate, endDate];
    if (department) {
        rowsQuery += ` AND j.department = $3`;
        params.push(department);
    }
    rowsQuery += ` GROUP BY j.id, j.title, j.department ORDER BY total_interviews DESC`;

    const rows = await db.query(rowsQuery, params);

    // Individual interview details
    let detailsQuery = `
        SELECT j.title as job_title,
               COALESCE(
                   NULLIF(TRIM(COALESCE(cp.first_name, '') || ' ' || COALESCE(cp.last_name, '')), ''),
                   NULLIF(TRIM(COALESCE(ep.first_name, '') || ' ' || COALESCE(ep.last_name, '')), ''),
                   u.email,
                   'Unknown'
               ) as candidate_name,
               i.interview_type, i.status as interview_status,
               i.scheduled_date::date as interview_date,
               i.start_time,
               f.overall_rating, f.hire_recommendation,
               f.strengths, f.weaknesses,
               a.status as application_status
        FROM interviews i
        JOIN applications a ON i.application_id = a.id
        JOIN jobs j ON a.job_id = j.id
        LEFT JOIN candidate_profiles cp ON a.candidate_id = cp.id
        LEFT JOIN employee_profiles ep ON a.employee_id = ep.id
        LEFT JOIN users u ON u.id = COALESCE(cp.user_id, ep.user_id)
        LEFT JOIN interview_feedback f ON f.interview_id = i.id
        WHERE i.scheduled_date >= $1 AND i.scheduled_date < $2
    `;
    if (department) {
        detailsQuery += ` AND j.department = $3`;
    }
    detailsQuery += ` ORDER BY i.scheduled_date DESC, i.start_time DESC`;

    const details = await db.query(detailsQuery, params);

    return { summary: summary.rows[0], feedback: feedback.rows[0], rows: rows.rows, details: details.rows };
}

async function generateDepartmentReport(startDate, endDateRaw, department) {
    // Add 1 day to end date for inclusive range
    const endDate = new Date(new Date(endDateRaw).getTime() + 24*60*60*1000).toISOString().split('T')[0];
    
    let query = `
        SELECT j.department,
               COUNT(DISTINCT j.id) as total_jobs,
               COUNT(DISTINCT CASE WHEN j.status = 'published' THEN j.id END) as active_jobs,
               SUM(j.positions_available) as total_positions,
               SUM(j.positions_filled) as filled_positions,
               COUNT(a.id) as total_applications,
               COUNT(CASE WHEN a.status = 'hired' THEN 1 END) as hires,
               COUNT(CASE WHEN a.status = 'rejected' THEN 1 END) as rejections,
               COUNT(CASE WHEN a.status = 'offer_extended' THEN 1 END) as pending_offers,
               ROUND(AVG(a.ai_overall_score)::numeric, 1) as avg_candidate_score,
               COUNT(CASE WHEN a.ai_overall_score >= 80 THEN 1 END) as high_quality_candidates,
               COUNT(DISTINCT i.id) as total_interviews,
               COUNT(DISTINCT CASE WHEN i.status = 'completed' THEN i.id END) as completed_interviews
        FROM jobs j
        LEFT JOIN applications a ON j.id = a.job_id AND a.submitted_at >= $1 AND a.submitted_at < $2
        LEFT JOIN interviews i ON i.application_id = a.id
        WHERE j.department IS NOT NULL
    `;
    const params = [startDate, endDate];
    if (department) {
        query += ` AND j.department = $3`;
        params.push(department);
    }
    query += ` GROUP BY j.department ORDER BY total_applications DESC`;

    const rows = await db.query(query, params);

    // Summary across departments
    const summary = await db.query(`
        SELECT
            COUNT(DISTINCT j.department) as total_departments,
            COUNT(DISTINCT j.id) as total_jobs,
            COUNT(a.id) as total_applications,
            COUNT(CASE WHEN a.status = 'hired' THEN 1 END) as total_hires,
            (SELECT j2.department FROM jobs j2 LEFT JOIN applications a2 ON j2.id = a2.job_id
             GROUP BY j2.department ORDER BY COUNT(a2.id) DESC LIMIT 1) as most_active_dept
        FROM jobs j
        LEFT JOIN applications a ON j.id = a.job_id AND a.submitted_at >= $1 AND a.submitted_at < $2
    `, [startDate, endDate]);

    return { summary: summary.rows[0], rows: rows.rows };
}

async function generateEmployeeReport(startDate, endDateRaw, department) {
    // Add 1 day to end date for inclusive range
    const endDate = new Date(new Date(endDateRaw).getTime() + 24*60*60*1000).toISOString().split('T')[0];
    
    // Employee overview
    const summary = await db.query(`
        SELECT
            COUNT(*) as total_employees,
            COUNT(CASE WHEN employment_status = 'full_time' THEN 1 END) as full_time,
            COUNT(CASE WHEN employment_status = 'part_time' THEN 1 END) as part_time,
            COUNT(CASE WHEN employment_status = 'contract' THEN 1 END) as contract,
            COUNT(CASE WHEN employment_status = 'intern' THEN 1 END) as interns,
            COUNT(CASE WHEN internal_mobility_interest = true THEN 1 END) as mobility_interested,
            COUNT(DISTINCT department) as departments
        FROM employee_profiles
    `);

    // Internal applications
    const internalApps = await db.query(`
        SELECT
            COUNT(*) as total_internal_applications,
            COUNT(CASE WHEN a.status = 'offer_extended' THEN 1 END) as offers_pending,
            COUNT(CASE WHEN a.status = 'offer_accepted' THEN 1 END) as offers_accepted,
            COUNT(CASE WHEN a.status = 'offer_declined' THEN 1 END) as offers_declined,
            COUNT(CASE WHEN a.status = 'hired' THEN 1 END) as internal_hires,
            COUNT(CASE WHEN a.status = 'rejected' THEN 1 END) as rejected,
            COUNT(CASE WHEN a.status IN ('interview_scheduled', 'interviewed') THEN 1 END) as in_interviews
        FROM applications a
        WHERE a.employee_id IS NOT NULL AND a.submitted_at >= $1 AND a.submitted_at < $2
    `, [startDate, endDate]);

    // Employees by department
    let depQuery = `
        SELECT department, COUNT(*) as employee_count,
               COUNT(CASE WHEN internal_mobility_interest = true THEN 1 END) as mobility_interested,
               ROUND(AVG(EXTRACT(YEAR FROM AGE(CURRENT_DATE, hire_date)))::numeric, 1) as avg_tenure_years
        FROM employee_profiles
        WHERE department IS NOT NULL
    `;
    const params = [];
    if (department) {
        depQuery += ` AND department = $1`;
        params.push(department);
    }
    depQuery += ` GROUP BY department ORDER BY employee_count DESC`;

    const rows = await db.query(depQuery, params);

    // Employee details
    let detailQuery = `
        SELECT ep.first_name || ' ' || ep.last_name as employee_name,
               ep.employee_id, ep.department, ep.job_title,
               ep.employment_status, ep.hire_date::date,
               ep.performance_rating,
               ep.internal_mobility_interest as mobility_interest,
               (SELECT COUNT(*) FROM applications a WHERE a.employee_id = ep.id) as internal_applications
        FROM employee_profiles ep
    `;
    if (department) {
        detailQuery += ` WHERE ep.department = $1`;
    }
    detailQuery += ` ORDER BY ep.department, ep.last_name`;

    const details = await db.query(detailQuery, params);

    return { summary: summary.rows[0], internalApps: internalApps.rows[0], rows: rows.rows, details: details.rows };
}

async function generateOffersReport(startDate, endDate, department) {
    // Offers summary
    let summaryQuery = `
        SELECT
            COUNT(CASE WHEN a.status = 'offer_extended' THEN 1 END) as pending_offers,
            COUNT(CASE WHEN a.status = 'offer_accepted' THEN 1 END) as accepted_offers,
            COUNT(CASE WHEN a.status = 'offer_declined' THEN 1 END) as declined_offers,
            COUNT(CASE WHEN a.status = 'hired' THEN 1 END) as hires,
            COUNT(CASE WHEN a.status = 'rejected' THEN 1 END) as total_rejections,
            COUNT(CASE WHEN a.status IN ('offer_extended','offer_accepted','offer_declined','hired') THEN 1 END) as total_offer_activity,
            CASE WHEN COUNT(CASE WHEN a.status IN ('offer_accepted','hired','offer_declined') THEN 1 END) > 0
                 THEN ROUND(COUNT(CASE WHEN a.status IN ('offer_accepted','hired') THEN 1 END)::numeric /
                      COUNT(CASE WHEN a.status IN ('offer_accepted','hired','offer_declined') THEN 1 END) * 100, 1)
                 ELSE 0 END as acceptance_rate
        FROM applications a
        JOIN jobs j ON a.job_id = j.id
        WHERE a.status IN ('offer_extended', 'offer_accepted', 'offer_declined', 'hired', 'rejected')
    `;
    const summaryParams = [];
    if (department) {
        summaryQuery += ` AND j.department = $1`;
        summaryParams.push(department);
    }
    const summary = await db.query(summaryQuery, summaryParams);

    // Offer details
    let detailsQuery = `
        SELECT j.title as job_title, j.department,
               COALESCE(
                   NULLIF(TRIM(COALESCE(cp.first_name, '') || ' ' || COALESCE(cp.last_name, '')), ''),
                   NULLIF(TRIM(COALESCE(ep.first_name, '') || ' ' || COALESCE(ep.last_name, '')), ''),
                   u.email,
                   'Unknown'
               ) as candidate_name,
               a.status as application_status,
               a.ai_overall_score as ai_score,
               COALESCE(a.updated_at, a.reviewed_at)::date as decision_date,
               CASE WHEN a.employee_id IS NOT NULL THEN 'Internal' ELSE 'External' END as candidate_type,
               ROUND(AVG(f.overall_rating)::numeric, 2) as avg_interview_rating
        FROM applications a
        JOIN jobs j ON a.job_id = j.id
        LEFT JOIN candidate_profiles cp ON a.candidate_id = cp.id
        LEFT JOIN employee_profiles ep ON a.employee_id = ep.id
        LEFT JOIN users u ON u.id = COALESCE(cp.user_id, ep.user_id)
        LEFT JOIN interviews i ON i.application_id = a.id
        LEFT JOIN interview_feedback f ON f.interview_id = i.id
        WHERE a.status IN ('offer_extended', 'offer_accepted', 'offer_declined', 'hired', 'rejected')
    `;
    const params = [];
    if (department) {
        detailsQuery += ` AND j.department = $1`;
        params.push(department);
    }
    detailsQuery += ` GROUP BY j.title, j.department, candidate_name, a.status, a.ai_overall_score, a.updated_at, a.reviewed_at, a.employee_id, u.email
                      ORDER BY a.updated_at DESC NULLS LAST`;

    const rows = await db.query(detailsQuery, params);

    return { summary: summary.rows[0], rows: rows.rows };
}

module.exports = router;
