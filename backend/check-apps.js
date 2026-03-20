const db = require('./src/config/database');

async function checkApps() {
  try {
    // Get candidate profiles
    const candidates = await db.query(`
      SELECT cp.id as candidate_id, cp.user_id, u.email 
      FROM candidate_profiles cp 
      JOIN users u ON cp.user_id = u.id
    `);
    console.log('Candidate profiles:');
    console.log(candidates.rows);

    // Get applications with candidate info
    const apps = await db.query(`
      SELECT a.id, a.status, a.candidate_id, a.submitted_at,
             j.title as job_title, j.department, j.location,
             cp.user_id
      FROM applications a
      JOIN jobs j ON a.job_id = j.id
      JOIN candidate_profiles cp ON a.candidate_id = cp.id
    `);
    console.log('\nApplications:');
    console.log(apps.rows);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkApps();
