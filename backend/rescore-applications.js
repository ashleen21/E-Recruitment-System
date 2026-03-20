// Re-score all existing applications using the unified GPT-4o-mini scoring
const db = require('./src/config/database');
const aiService = require('./src/services/ai.service');

async function rescoreApplications() {
    try {
        console.log('Fetching all applications...');
        
        const apps = await db.query(`
            SELECT a.id, a.job_id, a.candidate_id, a.employee_id, a.cover_letter,
                   a.ai_overall_score as old_score, a.resume_match_score as old_resume_score
            FROM applications a
            ORDER BY a.id
        `);

        console.log(`Found ${apps.rows.length} applications to re-score.\n`);

        for (const app of apps.rows) {
            try {
                // Get the job
                const jobResult = await db.query('SELECT * FROM jobs WHERE id = $1', [app.job_id]);
                if (jobResult.rows.length === 0) {
                    console.log(`App ${app.id}: Job ${app.job_id} not found, skipping.`);
                    continue;
                }
                const job = jobResult.rows[0];

                // Run unified screening (GPT-4o-mini via resume parser)
                const scores = await aiService.screenApplication(app, job);

                // Save to BOTH columns
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
                    app.id
                ]);

                console.log(`App ${app.id}: ${app.old_score}% → ${scores.overallScore}% (skills: ${scores.skillMatchScore}, exp: ${scores.experienceMatchScore}, edu: ${scores.educationMatchScore})`);
            } catch (err) {
                console.error(`Error re-scoring application ${app.id}:`, err.message);
            }
        }

        console.log('\nDone! All applications re-scored with unified GPT-4o-mini scoring.');
        process.exit(0);
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
}

rescoreApplications();
