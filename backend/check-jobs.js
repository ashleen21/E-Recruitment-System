const db = require('./src/config/database');

async function updateJobs() {
  try {
    // Update all jobs to have experience years and closes_at if missing
    await db.query(`
      UPDATE jobs 
      SET min_experience_years = COALESCE(min_experience_years, 
        CASE experience_level 
          WHEN 'entry' THEN 1
          WHEN 'mid' THEN 3
          WHEN 'senior' THEN 5
          WHEN 'lead' THEN 7
          ELSE 2
        END
      ),
      closes_at = COALESCE(closes_at, CURRENT_DATE + INTERVAL '30 days')
      WHERE min_experience_years IS NULL OR closes_at IS NULL
    `);
    
    const result = await db.query('SELECT id, title, min_experience_years, closes_at FROM jobs');
    console.log('Updated jobs:');
    console.log(JSON.stringify(result.rows, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

updateJobs();
