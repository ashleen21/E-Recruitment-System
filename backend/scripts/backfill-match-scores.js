/**
 * One-time: fill resume_match_score from ai_overall_score or fast rule-based scoring.
 * Run from backend/: node scripts/backfill-match-scores.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

if (process.argv.includes('--neon')) {
  process.env.DB_HOST = process.env.NEON_DB_HOST;
  process.env.DB_PORT = process.env.NEON_DB_PORT;
  process.env.DB_USER = process.env.NEON_DB_USER;
  process.env.DB_PASSWORD = process.env.NEON_DB_PASSWORD;
  process.env.DB_NAME = process.env.NEON_DB_NAME;
  process.env.DB_SSL = 'true';
}

const db = require('../src/config/database');
const resumeParser = require('../src/services/resumeParser.service');

const hasScore = (v) => v !== null && v !== undefined && v !== '';

async function main() {
  const { rows } = await db.query(`
    SELECT id, job_id, resume_match_score, ai_overall_score, resume_parsed_data
    FROM applications
    WHERE resume_match_score IS NULL OR resume_match_score = 0
  `);

  console.log(`Backfilling ${rows.length} applications...`);
  let updated = 0;

  for (const app of rows) {
    if (hasScore(app.resume_match_score)) continue;

    if (hasScore(app.ai_overall_score)) {
      await db.query(
        'UPDATE applications SET resume_match_score = $1, updated_at = NOW() WHERE id = $2',
        [app.ai_overall_score, app.id]
      );
      updated += 1;
      continue;
    }

    const resumeResult = await db.query(`
      SELECT COALESCE(rc.extracted_skills, re.extracted_skills) as parsed_skills,
        COALESCE(rc.extracted_education, re.extracted_education) as parsed_education,
        COALESCE(rc.extracted_experience, re.extracted_experience) as parsed_experience,
        a.resume_parsed_data
      FROM applications a
      LEFT JOIN candidate_profiles cp ON a.candidate_id = cp.id
      LEFT JOIN employee_profiles ep ON a.employee_id = ep.id
      LEFT JOIN resumes rc ON rc.candidate_id = cp.id
      LEFT JOIN resumes re ON re.employee_id = ep.id
      WHERE a.id = $1
      LIMIT 1
    `, [app.id]);

    const jobResult = await db.query(
      'SELECT required_skills, min_experience_years, education_requirement FROM jobs WHERE id = $1',
      [app.job_id]
    );
    const job = jobResult.rows[0] || {};
    const rd = resumeResult.rows[0] || {};
    let parsed = rd.resume_parsed_data;
    if (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed); } catch { parsed = null; }
    }
    const parsedResume = {
      skills: parsed?.skills || rd.parsed_skills || [],
      education: parsed?.education || rd.parsed_education || [],
      experience: parsed?.experience || rd.parsed_experience || []
    };

    const base = resumeParser.calculateJobMatchScoreBasic(parsedResume, {
      required_skills: job.required_skills || [],
      min_experience_years: job.min_experience_years || 0,
      education_level: job.education_requirement || ''
    });
    const match = resumeParser.applySkillDecay(parsedResume, {
      required_skills: job.required_skills || [],
      min_experience_years: job.min_experience_years || 0,
      education_level: job.education_requirement || ''
    }, base);

    if (match?.overallScore != null) {
      await db.query(
        `UPDATE applications SET resume_match_score = $1, resume_match_details = $2, updated_at = NOW() WHERE id = $3`,
        [match.overallScore, JSON.stringify(match), app.id]
      );
      updated += 1;
    }
  }

  console.log(`Updated ${updated} applications.`);
  await db.pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
