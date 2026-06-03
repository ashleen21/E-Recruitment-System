const path = require('path');
const fs = require('fs');
const db = require('../config/database');
const aiService = require('./ai.service');
const resumeParser = require('./resumeParser.service');

const parseJsonField = (value, fallback = null) => {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'object') return value;
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch {
            return fallback;
        }
    }
    return fallback;
};

const buildResumeSnapshot = (row) => {
    const parsed = parseJsonField(row?.resume_parsed_data);
    if (parsed && typeof parsed === 'object') {
        return {
            skills: parsed.skills || row?.parsed_skills || [],
            experience: parsed.experience || row?.parsed_experience || [],
            education: parsed.education || row?.parsed_education || [],
            certifications: parsed.certifications || row?.parsed_certifications || []
        };
    }
    return {
        skills: row?.parsed_skills || [],
        experience: row?.parsed_experience || [],
        education: row?.parsed_education || [],
        certifications: row?.parsed_certifications || []
    };
};

const hasResumeMatchScore = (application) => {
    const score = application?.resume_match_score;
    return score !== null && score !== undefined && score !== '';
};

const persistMatchScore = async (applicationId, matchScore) => {
    const overallScore = matchScore?.overallScore ?? matchScore;
    if (overallScore === null || overallScore === undefined) return null;

    await db.query(
        `UPDATE applications
         SET resume_match_score = $1,
             resume_match_details = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [
            overallScore,
            JSON.stringify(typeof matchScore === 'object' ? matchScore : { overallScore }),
            applicationId
        ]
    );
    return overallScore;
};

const autoCalculateMatchScore = async (applicationId, jobId, existing = {}) => {
    if (hasResumeMatchScore(existing)) {
        return existing.resume_match_score;
    }

    if (existing.ai_overall_score !== null && existing.ai_overall_score !== undefined) {
        return persistMatchScore(applicationId, { overallScore: existing.ai_overall_score });
    }

    try {
        const resumeResult = await db.query(`
            SELECT COALESCE(rc.extracted_skills, re.extracted_skills) as parsed_skills,
                COALESCE(rc.extracted_education, re.extracted_education) as parsed_education,
                COALESCE(rc.extracted_experience, re.extracted_experience) as parsed_experience,
                COALESCE(rc.extracted_certifications, re.extracted_certifications) as parsed_certifications,
                COALESCE(rc.raw_text, re.raw_text) as resume_text,
                a.resume_parsed_data, a.resume_url
            FROM applications a
            LEFT JOIN candidate_profiles cp ON a.candidate_id = cp.id
            LEFT JOIN employee_profiles ep ON a.employee_id = ep.id
            LEFT JOIN resumes rc ON rc.candidate_id = cp.id
            LEFT JOIN resumes re ON re.employee_id = ep.id
            WHERE a.id = $1
            ORDER BY COALESCE(rc.is_primary, re.is_primary) DESC,
                     COALESCE(rc.created_at, re.created_at) DESC
            LIMIT 1
        `, [applicationId]);

        const jobResult = await db.query(
            'SELECT required_skills, min_experience_years, education_requirement, description, requirements FROM jobs WHERE id = $1',
            [jobId]
        );
        const job = jobResult.rows[0] || {};
        const jobRequirements = {
            required_skills: job.required_skills || [],
            min_experience_years: job.min_experience_years || 0,
            education_level: job.education_requirement || '',
            job_description: job.description || '',
            job_requirements_text: job.requirements || ''
        };

        const rd = resumeResult.rows[0] || {};
        const parsedResume = buildResumeSnapshot(rd);
        const hasParsedData = (parsedResume.skills?.length || 0) > 0
            || (parsedResume.experience?.length || 0) > 0
            || (parsedResume.education?.length || 0) > 0;

        let effectiveResume = parsedResume;
        const resumeUrl = existing.resume_url || rd.resume_url;
        if (!rd.resume_text && !hasParsedData && resumeUrl) {
            const diskPath = path.join(__dirname, '../..', resumeUrl.replace(/^\//, ''));
            if (fs.existsSync(diskPath)) {
                try {
                    const parsed = await resumeParser.parseResume(diskPath);
                    effectiveResume = {
                        skills: parsed.skills || [],
                        experience: parsed.experience || [],
                        education: parsed.education || [],
                        certifications: parsed.certifications || []
                    };
                    await db.query(
                        `UPDATE applications SET resume_parsed_data = $1 WHERE id = $2`,
                        [JSON.stringify(effectiveResume), applicationId]
                    );
                } catch (parseErr) {
                    console.error(`Resume parse from file failed for ${applicationId}:`, parseErr.message);
                }
            }
        }

        const hasEffective = (effectiveResume.skills?.length || 0) > 0
            || (effectiveResume.experience?.length || 0) > 0
            || (effectiveResume.education?.length || 0) > 0
            || rd.resume_text;

        if (!hasEffective) {
            return null;
        }

        const baseScore = resumeParser.calculateJobMatchScoreBasic(effectiveResume, jobRequirements);
        const matchScore = resumeParser.applySkillDecay(effectiveResume, jobRequirements, baseScore);
        return persistMatchScore(applicationId, matchScore);
    } catch (err) {
        console.error(`Auto match score error for ${applicationId}:`, err.message);
        return null;
    }
};

const persistScreeningScores = async (applicationId, scores) => {
    if (!scores || scores.overallScore === null || scores.overallScore === undefined) return;
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
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $14
    `, [
        scores.overallScore, scores.skillMatchScore, scores.experienceMatchScore,
        scores.educationMatchScore, scores.culturalFitScore,
        JSON.stringify(scores.skillGapAnalysis), JSON.stringify(scores.strengths),
        JSON.stringify(scores.concerns), JSON.stringify(scores.interviewQuestions),
        scores.successPrediction, scores.retentionPrediction, scores.recommendation,
        JSON.stringify(scores._resumeMatchDetails || {}),
        applicationId
    ]);
};

const ingestApplicationResume = async ({ file, candidateId, employeeId, applicationId }) => {
    if (!file) return null;

    const ownerColumn = candidateId ? 'candidate_id' : 'employee_id';
    const ownerId = candidateId || employeeId;
    const publicPath = `/uploads/resumes/${file.filename}`;

    const resumeResult = await db.query(`
        INSERT INTO resumes (${ownerColumn}, file_name, file_path, file_type, file_size, is_primary, status)
        VALUES ($1, $2, $3, $4, $5, true, 'processing')
        RETURNING id
    `, [ownerId, file.originalname, publicPath, file.mimetype, file.size]);

    const resumeId = resumeResult.rows[0].id;

    try {
        const parsedData = await resumeParser.parseResume(file.path, file.mimetype);
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
            JSON.stringify(parsedData.contact || {}),
            parsedData.summary || '',
            JSON.stringify(parsedData.skills || []),
            JSON.stringify(parsedData.experience || []),
            JSON.stringify(parsedData.education || []),
            JSON.stringify(parsedData.certifications || []),
            JSON.stringify(parsedData.references || []),
            JSON.stringify(parsedData.personalInfo || {}),
            parsedData.confidence || parsedData.confidenceScore || 0.5,
            resumeId
        ]);

        const snapshot = {
            skills: parsedData.skills || [],
            experience: parsedData.experience || [],
            education: parsedData.education || [],
            certifications: parsedData.certifications || []
        };
        await db.query(
            `UPDATE applications SET resume_url = $1, resume_parsed_data = $2 WHERE id = $3`,
            [publicPath, JSON.stringify(snapshot), applicationId]
        );
        return snapshot;
    } catch (error) {
        console.error('Application resume parse error:', error.message);
        await db.query(
            `UPDATE resumes SET status = 'failed', parsing_error = $1 WHERE id = $2`,
            [error.message, resumeId]
        );
        return null;
    }
};

const attachProfileResumeToApplication = async (applicationId, candidateId, employeeId) => {
    const ownerFilter = candidateId
        ? 'candidate_id = $1'
        : 'employee_id = $1';
    const ownerId = candidateId || employeeId;
    if (!ownerId) return null;

    const resumeResult = await db.query(`
        SELECT file_path
        FROM resumes
        WHERE ${ownerFilter}
        ORDER BY is_primary DESC NULLS LAST, created_at DESC
        LIMIT 1
    `, [ownerId]);

    const filePath = resumeResult.rows[0]?.file_path;
    if (!filePath) return null;

    await db.query(
        'UPDATE applications SET resume_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [filePath, applicationId]
    );
    return filePath;
};

/** Always writes a score using profile/resume data (no OpenAI). */
const runApplicationScoringFast = async (application, job) => {
    const scores = await aiService.screenApplicationFast(application, job);
    await persistScreeningScores(application.id, scores);
    console.log(`Baseline score for application ${application.id}: ${scores.overallScore}%`);
    return scores.overallScore;
};

const runApplicationScoring = async (application, job) => {
    try {
        await runApplicationScoringFast(application, job);

        const refined = await autoCalculateMatchScore(application.id, job.id, application);
        if (refined != null) {
            console.log(`Refined match score for application ${application.id}: ${refined}%`);
        }

        aiService.screenApplication(application, job)
            .then((scores) => persistScreeningScores(application.id, scores))
            .catch((err) => console.error(`Background AI screening error for ${application.id}:`, err.message));
    } catch (err) {
        console.error(`Application scoring error for ${application.id}:`, err.message);
        try {
            await runApplicationScoringFast(application, job);
        } catch (fallbackErr) {
            console.error(`Fallback scoring failed for ${application.id}:`, fallbackErr.message);
        }
    }
};

const scoreApplicationsWithoutMatch = async (applications) => {
    for (const app of applications) {
        if (hasResumeMatchScore(app)) continue;
        try {
            const jobResult = await db.query('SELECT * FROM jobs WHERE id = $1', [app.job_id]);
            if (jobResult.rows.length === 0) continue;
            const job = jobResult.rows[0];
            const appWithResume = { ...app };
            if (!appWithResume.resume_url) {
                const url = await attachProfileResumeToApplication(app.id, app.candidate_id, app.employee_id);
                if (url) appWithResume.resume_url = url;
            }
            await runApplicationScoringFast(appWithResume, job);
            autoCalculateMatchScore(app.id, app.job_id, appWithResume).catch(() => {});
        } catch (err) {
            console.error(`List score backfill failed for ${app.id}:`, err.message);
        }
    }
};

module.exports = {
    hasResumeMatchScore,
    autoCalculateMatchScore,
    ingestApplicationResume,
    runApplicationScoring,
    runApplicationScoringFast,
    scoreApplicationsWithoutMatch,
    attachProfileResumeToApplication,
    persistMatchScore,
    buildResumeSnapshot,
    parseJsonField
};
