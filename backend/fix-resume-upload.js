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
        // 1. Add resume_url column to employee_profiles (from migration)
        await pool.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'employee_profiles' AND column_name = 'resume_url'
                ) THEN
                    ALTER TABLE employee_profiles ADD COLUMN resume_url VARCHAR(500);
                    RAISE NOTICE 'Added resume_url column';
                END IF;

                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'employee_profiles' AND column_name = 'photo_url'
                ) THEN
                    ALTER TABLE employee_profiles ADD COLUMN photo_url VARCHAR(500);
                    RAISE NOTICE 'Added photo_url column';
                END IF;
            END $$;
        `);
        console.log('1. employee_profiles columns ensured (resume_url, photo_url)');

        // 2. Create saved_jobs table if not exists
        await pool.query(`
            CREATE TABLE IF NOT EXISTS saved_jobs (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                employee_id UUID REFERENCES employee_profiles(id) ON DELETE CASCADE,
                job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(employee_id, job_id)
            );
            CREATE INDEX IF NOT EXISTS idx_saved_jobs_employee ON saved_jobs(employee_id);
            CREATE INDEX IF NOT EXISTS idx_saved_jobs_job ON saved_jobs(job_id);
        `);
        console.log('2. saved_jobs table ensured');

        // 3. Add unique partial index on resumes.employee_id for ON CONFLICT
        await pool.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_resumes_employee_unique 
            ON resumes(employee_id) WHERE employee_id IS NOT NULL;
        `);
        console.log('3. Unique partial index on resumes(employee_id) created');

        // Verify
        const r1 = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='employee_profiles' AND column_name IN ('resume_url','photo_url')");
        console.log('Verified columns:', r1.rows.map(r => r.column_name));
        
        const r2 = await pool.query("SELECT indexname FROM pg_indexes WHERE tablename='resumes' AND indexname='idx_resumes_employee_unique'");
        console.log('Verified unique index:', r2.rows.length > 0 ? 'EXISTS' : 'MISSING');

        console.log('\nAll fixes applied successfully!');
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        pool.end();
    }
})();
