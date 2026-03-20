const db = require('./src/config/database');

async function testMyApplications() {
  try {
    // User ID for Shazel Revell
    const userId = '1bf59faa-8dbb-4075-970c-7535f7494ce3';
    
    const query = `
      SELECT a.*, j.title as job_title, j.department, j.location,
             (SELECT json_agg(json_build_object('id', i.id, 'type', i.interview_type, 'date', i.scheduled_date, 'time', i.start_time, 'status', i.status))
              FROM interviews i WHERE i.application_id = a.id) as interviews
      FROM applications a
      JOIN jobs j ON a.job_id = j.id
      JOIN candidate_profiles cp ON a.candidate_id = cp.id
      WHERE cp.user_id = $1
      ORDER BY a.submitted_at DESC
    `;
    
    const result = await db.query(query, [userId]);
    console.log('My Applications query result:');
    console.log(JSON.stringify(result.rows, null, 2));
    console.log('\nTotal applications:', result.rows.length);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testMyApplications();
