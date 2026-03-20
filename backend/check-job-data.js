require('dotenv').config();
const db = require('./src/config/database');

async function main() {
    try {
        const result = await db.query("SELECT * FROM jobs WHERE status='published' LIMIT 1");
        const job = result.rows[0];
        if (!job) { console.log('No published jobs found'); process.exit(0); }
        
        console.log('=== JOB DETAILS ===');
        console.log('Title:', job.title);
        console.log('Department:', job.department);
        console.log('Location:', job.location);
        console.log('Job Type:', job.job_type);
        console.log('Experience:', job.experience_level);
        console.log('Education:', job.education_requirement);
        console.log('Salary:', job.salary_min, '-', job.salary_max, job.salary_currency);
        console.log('Remote:', job.is_remote);
        console.log('\n--- Description ---');
        console.log(job.description?.substring(0, 1000));
        console.log('\n--- Requirements ---');
        console.log(JSON.stringify(job.requirements, null, 2));
        console.log('\n--- Responsibilities ---');
        console.log(JSON.stringify(job.responsibilities, null, 2));
        console.log('\n--- Benefits ---');
        console.log(JSON.stringify(job.benefits, null, 2));
        console.log('\n--- Required Skills ---');
        console.log(JSON.stringify(job.required_skills, null, 2));
        console.log('\n--- Closes At ---');
        console.log(job.closes_at);
        console.log('Positions:', job.positions_available);
        
        // Also get skill names
        const skills = await db.query(
            "SELECT s.name FROM job_skills js JOIN skills s ON js.skill_id = s.id WHERE js.job_id = $1",
            [job.id]
        );
        console.log('\n--- Skill Names ---');
        console.log(skills.rows.map(s => s.name));
        
        process.exit(0);
    } catch (e) {
        console.error('Error:', e.message);
        process.exit(1);
    }
}
main();
