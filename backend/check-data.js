const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

(async () => {
    try {
        // Check specific application
        const app = await pool.query(`
            SELECT a.*,
                   j.title as job_title,
                   COALESCE(cp.first_name, ep.first_name) as first_name, 
                   COALESCE(cp.last_name, ep.last_name) as last_name, 
                   COALESCE(cp.phone, ep.phone) as phone, 
                   COALESCE(cp.location, ep.location) as candidate_location,
                   u.email as candidate_email,
                   COALESCE(a.resume_url, (SELECT r.file_path FROM resumes r WHERE r.candidate_id = cp.id ORDER BY r.is_primary DESC, r.created_at DESC LIMIT 1)) as resume_url
            FROM applications a
            JOIN jobs j ON a.job_id = j.id
            LEFT JOIN candidate_profiles cp ON a.candidate_id = cp.id
            LEFT JOIN employee_profiles ep ON a.employee_id = ep.id
            LEFT JOIN users u ON COALESCE(cp.user_id, ep.user_id) = u.id
            WHERE a.id = 'f68f18e2-e545-4cf3-8284-8bd31eb66db9'
        `);
        console.log('\n=== APPLICATION DATA ===');
        console.log(JSON.stringify(app.rows[0], null, 2));

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await pool.end();
    }
})();
