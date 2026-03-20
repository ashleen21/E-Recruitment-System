require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

(async () => {
    try {
        // Check if resume_url column exists in employee_profiles
        const r1 = await pool.query(
            "SELECT column_name FROM information_schema.columns WHERE table_name='employee_profiles' AND column_name='resume_url'"
        );
        console.log('1. resume_url column in employee_profiles:', r1.rows.length > 0 ? 'EXISTS' : 'MISSING');

        // Check unique indexes on resumes table for employee_id
        const r2 = await pool.query(
            "SELECT indexname, indexdef FROM pg_indexes WHERE tablename='resumes'"
        );
        console.log('2. Resumes indexes:', JSON.stringify(r2.rows, null, 2));

        // Check constraints on resumes table
        const r3 = await pool.query(
            "SELECT conname, contype, pg_get_constraintdef(oid) as def FROM pg_constraint WHERE conrelid='resumes'::regclass"
        );
        console.log('3. Resumes constraints:', JSON.stringify(r3.rows, null, 2));

        // Check if there's a unique partial index on employee_id
        const r4 = await pool.query(
            "SELECT indexname, indexdef FROM pg_indexes WHERE tablename='resumes' AND indexdef LIKE '%employee_id%' AND indexdef LIKE '%UNIQUE%'"
        );
        console.log('4. Unique index on employee_id:', r4.rows.length > 0 ? JSON.stringify(r4.rows) : 'NONE - THIS IS THE PROBLEM');

    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        pool.end();
    }
})();
