const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const aiService = require('../services/ai.service');

// AI Screen candidates for a job
router.post('/screen/:jobId', authenticate, authorize('admin', 'hr_manager'), async (req, res) => {
    try {
        const { jobId } = req.params;
        const { min_score = 60 } = req.body;

        const job = await db.query('SELECT * FROM jobs WHERE id = $1', [jobId]);
        if (job.rows.length === 0) {
            return res.status(404).json({ error: 'Job not found' });
        }

        // Get unscreened applications
        const applications = await db.query(`
            SELECT a.*, cp.*, u.email,
                   (SELECT json_agg(json_build_object('name', s.name, 'proficiency', cs.proficiency_level, 'years', cs.years_of_experience))
                    FROM candidate_skills cs JOIN skills s ON cs.skill_id = s.id WHERE cs.candidate_id = cp.id) as skills
            FROM applications a
            JOIN candidate_profiles cp ON a.candidate_id = cp.id
            JOIN users u ON cp.user_id = u.id
            WHERE a.job_id = $1 AND a.ai_overall_score IS NULL
        `, [jobId]);

        const results = [];
        for (const application of applications.rows) {
            try {
                const scores = await aiService.screenApplication(application, job.rows[0]);
                
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
                        resume_match_details = $13,
                        status = CASE WHEN $1 >= $14 THEN 'shortlisted' ELSE status END
                    WHERE id = $15
                `, [
                    scores.overallScore, scores.skillMatchScore, scores.experienceMatchScore,
                    scores.educationMatchScore, scores.culturalFitScore,
                    JSON.stringify(scores.skillGapAnalysis), JSON.stringify(scores.strengths),
                    JSON.stringify(scores.concerns), JSON.stringify(scores.interviewQuestions),
                    scores.successPrediction, scores.retentionPrediction, scores.recommendation,
                    JSON.stringify(scores._resumeMatchDetails || {}),
                    min_score, application.id
                ]);

                results.push({
                    applicationId: application.id,
                    candidateName: `${application.first_name} ${application.last_name}`,
                    score: scores.overallScore,
                    recommendation: scores.recommendation
                });
            } catch (err) {
                console.error(`Error screening application ${application.id}:`, err);
                results.push({
                    applicationId: application.id,
                    error: err.message
                });
            }
        }

        res.json({
            message: `Screened ${results.length} applications`,
            results
        });

    } catch (error) {
        console.error('AI screen error:', error);
        res.status(500).json({ error: 'Failed to screen candidates' });
    }
});

// AI Match employees to internal opportunities
router.post('/match-internal/:jobId', authenticate, authorize('admin', 'hr_manager'), async (req, res) => {
    try {
        const { jobId } = req.params;

        const job = await db.query('SELECT * FROM jobs WHERE id = $1', [jobId]);
        if (job.rows.length === 0) {
            return res.status(404).json({ error: 'Job not found' });
        }

        // Get all employees with their skills
        const employees = await db.query(`
            SELECT ep.*,
                   (SELECT json_agg(json_build_object('name', s.name, 'proficiency', es.proficiency_level, 'years', es.years_of_experience))
                    FROM employee_skills es JOIN skills s ON es.skill_id = s.id WHERE es.employee_id = ep.id) as skills
            FROM employee_profiles ep
            WHERE ep.employment_status = 'full_time' AND ep.internal_mobility_interest = true
        `);

        const matches = await aiService.matchInternalCandidates(job.rows[0], employees.rows);

        // Save matches
        for (const match of matches) {
            await db.query(`
                INSERT INTO internal_job_matches (
                    job_id, employee_id, overall_match_score, skill_match_score,
                    experience_match_score, career_alignment_score, readiness_score,
                    skill_gaps, development_recommendations, transition_difficulty, estimated_ramp_up_months
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                ON CONFLICT (job_id, employee_id) DO UPDATE SET
                    overall_match_score = $3, skill_match_score = $4,
                    experience_match_score = $5, career_alignment_score = $6,
                    readiness_score = $7, skill_gaps = $8, development_recommendations = $9,
                    transition_difficulty = $10, estimated_ramp_up_months = $11,
                    updated_at = CURRENT_TIMESTAMP
            `, [
                jobId, match.employeeId, match.overallScore, match.skillMatchScore,
                match.experienceScore, match.careerAlignmentScore, match.readinessScore,
                JSON.stringify(match.skillGaps), JSON.stringify(match.recommendations),
                match.transitionDifficulty, match.rampUpMonths
            ]);
        }

        res.json({
            message: `Found ${matches.length} potential internal candidates`,
            matches: matches.slice(0, 10) // Return top 10
        });

    } catch (error) {
        console.error('AI match internal error:', error);
        res.status(500).json({ error: 'Failed to match internal candidates' });
    }
});

// Generate career path recommendations
router.post('/career-paths/:employeeId', authenticate, authorize('admin', 'hr_manager'), async (req, res) => {
    try {
        const { employeeId } = req.params;

        const employee = await db.query(`
            SELECT ep.*,
                   (SELECT json_agg(json_build_object('name', s.name, 'proficiency', es.proficiency_level, 'years', es.years_of_experience))
                    FROM employee_skills es JOIN skills s ON es.skill_id = s.id WHERE es.employee_id = ep.id) as skills,
                   (SELECT json_agg(json_build_object('name', t.training_name, 'date', t.completion_date))
                    FROM training_records t WHERE t.employee_id = ep.id AND t.status = 'completed') as training
            FROM employee_profiles ep
            WHERE ep.id = $1
        `, [employeeId]);

        if (employee.rows.length === 0) {
            return res.status(404).json({ error: 'Employee not found' });
        }

        const recommendations = await aiService.generateCareerPaths(employee.rows[0]);

        // Save recommendations
        await db.query('DELETE FROM career_path_recommendations WHERE employee_id = $1', [employeeId]);
        
        for (const rec of recommendations) {
            await db.query(`
                INSERT INTO career_path_recommendations (
                    employee_id, recommended_role, department, timeline_months,
                    readiness_percentage, required_skills, skill_gaps,
                    recommended_training, success_probability, ai_reasoning
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            `, [
                employeeId, rec.role, rec.department, rec.timelineMonths,
                rec.readinessPercentage, JSON.stringify(rec.requiredSkills),
                JSON.stringify(rec.skillGaps), JSON.stringify(rec.recommendedTraining),
                rec.successProbability, rec.reasoning
            ]);
        }

        // Update employee profile with AI analysis
        await db.query(`
            UPDATE employee_profiles SET
                ai_career_path_recommendations = $1,
                ai_skill_gap_analysis = $2
            WHERE id = $3
        `, [JSON.stringify(recommendations), JSON.stringify(recommendations[0]?.skillGaps || []), employeeId]);

        res.json({
            message: 'Career paths generated',
            recommendations
        });

    } catch (error) {
        console.error('Generate career paths error:', error);
        res.status(500).json({ error: 'Failed to generate career paths' });
    }
});

// Predictive analysis for hiring decision
router.post('/predict/:applicationId', authenticate, authorize('admin', 'hr_manager'), async (req, res) => {
    try {
        const { applicationId } = req.params;

        const application = await db.query(`
            SELECT a.*, j.*, cp.*,
                   (SELECT json_agg(json_build_object('name', s.name, 'proficiency', cs.proficiency_level))
                    FROM candidate_skills cs JOIN skills s ON cs.skill_id = s.id WHERE cs.candidate_id = cp.id) as skills
            FROM applications a
            JOIN jobs j ON a.job_id = j.id
            JOIN candidate_profiles cp ON a.candidate_id = cp.id
            WHERE a.id = $1
        `, [applicationId]);

        if (application.rows.length === 0) {
            return res.status(404).json({ error: 'Application not found' });
        }

        const prediction = await aiService.predictHiringOutcome(application.rows[0]);

        // Update application with predictions
        await db.query(`
            UPDATE applications SET
                ai_success_prediction = $1,
                ai_retention_prediction = $2
            WHERE id = $3
        `, [prediction.successProbability, prediction.retentionProbability, applicationId]);

        res.json(prediction);

    } catch (error) {
        console.error('Predict hiring error:', error);
        res.status(500).json({ error: 'Failed to generate prediction' });
    }
});

// Analyze job posting
router.post('/analyze-job', authenticate, authorize('admin', 'hr_manager'), async (req, res) => {
    try {
        const { title, description, requirements } = req.body;

        const analysis = await aiService.analyzeJobPosting({ title, description, requirements });

        res.json(analysis);

    } catch (error) {
        console.error('Analyze job error:', error);
        res.status(500).json({ error: 'Failed to analyze job posting' });
    }
});

// Generate interview questions
router.post('/interview-questions/:applicationId', authenticate, authorize('admin', 'hr_manager', 'recruiter'), async (req, res) => {
    try {
        const { applicationId } = req.params;
        const { focus_areas } = req.body;

        const application = await db.query(`
            SELECT a.*, j.title, j.description, j.requirements, j.required_skills,
                   cp.first_name, cp.last_name, cp.years_of_experience, cp.current_job_title,
                   a.ai_skill_gap_analysis, a.ai_strengths, a.ai_concerns
            FROM applications a
            JOIN jobs j ON a.job_id = j.id
            JOIN candidate_profiles cp ON a.candidate_id = cp.id
            WHERE a.id = $1
        `, [applicationId]);

        if (application.rows.length === 0) {
            return res.status(404).json({ error: 'Application not found' });
        }

        const questions = await aiService.generateInterviewQuestions(application.rows[0], focus_areas);

        // Save questions
        await db.query(`
            UPDATE applications SET ai_interview_questions = $1 WHERE id = $2
        `, [JSON.stringify(questions), applicationId]);

        res.json(questions);

    } catch (error) {
        console.error('Generate questions error:', error);
        res.status(500).json({ error: 'Failed to generate interview questions' });
    }
});

// Skill gap analysis
router.post('/skill-gap', authenticate, async (req, res) => {
    try {
        const { current_skills, target_role, target_skills } = req.body;

        const analysis = await aiService.analyzeSkillGap(current_skills, target_role, target_skills);

        res.json(analysis);

    } catch (error) {
        console.error('Skill gap analysis error:', error);
        res.status(500).json({ error: 'Failed to analyze skill gap' });
    }
});

// ============================================================================
// PREDICTIVE MODELS ENDPOINTS
// ============================================================================

// Get predictive analysis for a specific application
router.get('/predictions/:applicationId', authenticate, authorize('admin', 'hr_manager'), async (req, res) => {
    try {
        const { applicationId } = req.params;

        const analysis = await aiService.generatePredictiveAnalysis(applicationId);

        res.json(analysis);

    } catch (error) {
        console.error('Predictive analysis error:', error);
        res.status(500).json({ error: 'Failed to generate predictive analysis' });
    }
});

// Bulk prediction analysis for multiple applications (e.g., for a job posting)
router.post('/predictions/bulk', authenticate, authorize('admin', 'hr_manager'), async (req, res) => {
    try {
        const { applicationIds, jobId } = req.body;

        let idsToProcess = applicationIds || [];

        // If jobId provided, get all applications for that job
        if (jobId && !applicationIds) {
            const apps = await db.query(
                'SELECT id FROM applications WHERE job_id = $1',
                [jobId]
            );
            idsToProcess = apps.rows.map(a => a.id);
        }

        if (idsToProcess.length === 0) {
            return res.json({ results: [], message: 'No applications to analyze' });
        }

        const results = [];
        for (const appId of idsToProcess) {
            try {
                const analysis = await aiService.generatePredictiveAnalysis(appId);
                results.push({
                    applicationId: appId,
                    success: true,
                    ...analysis
                });
            } catch (err) {
                results.push({
                    applicationId: appId,
                    success: false,
                    error: err.message
                });
            }
        }

        // Summary statistics
        const successful = results.filter(r => r.success);
        const avgSuccessPrediction = successful.length > 0
            ? successful.reduce((sum, r) => sum + r.predictions.success.successProbability, 0) / successful.length
            : 0;
        const avgRetentionPrediction = successful.length > 0
            ? successful.reduce((sum, r) => sum + r.predictions.retention.retentionProbability, 0) / successful.length
            : 0;

        res.json({
            summary: {
                totalProcessed: results.length,
                successful: successful.length,
                averageSuccessPrediction: Math.round(avgSuccessPrediction * 100) / 100,
                averageRetentionPrediction: Math.round(avgRetentionPrediction * 100) / 100,
                strongCandidates: successful.filter(r => r.overallAssessment?.hiringScore >= 0.7).length,
                riskyCandidates: successful.filter(r => r.predictions?.retention?.retentionRisk === 'High').length
            },
            results
        });

    } catch (error) {
        console.error('Bulk prediction error:', error);
        res.status(500).json({ error: 'Failed to process bulk predictions' });
    }
});

// Get prediction model insights (for analytics/reporting)
router.get('/predictions/insights', authenticate, authorize('admin', 'hr_manager'), async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        // Get prediction accuracy based on hired candidates
        const accuracyData = await db.query(`
            SELECT 
                COUNT(*) as total_hires,
                AVG(a.ai_success_prediction) as avg_predicted_success,
                AVG(a.ai_retention_prediction) as avg_predicted_retention,
                AVG(CASE WHEN hd.still_employed = true THEN 1 ELSE 0 END) as actual_retention_rate,
                AVG(CASE WHEN hd.performance_rating IS NOT NULL THEN hd.performance_rating ELSE 0 END) as avg_performance
            FROM applications a
            JOIN hire_data hd ON a.id = hd.application_id
            WHERE a.status = 'hired'
            ${startDate ? "AND a.created_at >= $1" : ""}
            ${endDate ? `AND a.created_at <= $${startDate ? 2 : 1}` : ""}
        `, startDate && endDate ? [startDate, endDate] : startDate ? [startDate] : endDate ? [endDate] : []);

        // Get prediction distribution
        const distributionData = await db.query(`
            SELECT 
                CASE 
                    WHEN ai_success_prediction >= 0.8 THEN 'High (80%+)'
                    WHEN ai_success_prediction >= 0.6 THEN 'Medium (60-79%)'
                    WHEN ai_success_prediction >= 0.4 THEN 'Low (40-59%)'
                    ELSE 'Very Low (<40%)'
                END as success_tier,
                COUNT(*) as count,
                AVG(ai_success_prediction) as avg_score
            FROM applications
            WHERE ai_success_prediction IS NOT NULL
            GROUP BY success_tier
            ORDER BY avg_score DESC
        `);

        // Retention risk distribution
        const retentionDistribution = await db.query(`
            SELECT 
                CASE 
                    WHEN ai_retention_prediction >= 0.7 THEN 'Low Risk'
                    WHEN ai_retention_prediction >= 0.5 THEN 'Medium Risk'
                    ELSE 'High Risk'
                END as risk_level,
                COUNT(*) as count
            FROM applications
            WHERE ai_retention_prediction IS NOT NULL
            GROUP BY risk_level
        `);

        res.json({
            accuracy: accuracyData.rows[0] || {},
            successDistribution: distributionData.rows,
            retentionDistribution: retentionDistribution.rows,
            modelVersion: '2.0',
            lastUpdated: new Date().toISOString()
        });

    } catch (error) {
        console.error('Prediction insights error:', error);
        res.status(500).json({ error: 'Failed to get prediction insights' });
    }
});

module.exports = router;
