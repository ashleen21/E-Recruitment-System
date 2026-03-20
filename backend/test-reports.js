const db = require('./src/config/database');
async function test() {
  try {
    // Test interview details
    const r = await db.query(`
      SELECT j.title as job_title,
             COALESCE(cp.first_name, ep.first_name) || ' ' || COALESCE(cp.last_name, ep.last_name) as candidate_name,
             i.interview_type, i.status as interview_status,
             i.scheduled_date::date as interview_date,
             i.start_time, f.overall_rating, f.hire_recommendation
      FROM interviews i
      JOIN applications a ON i.application_id = a.id
      JOIN jobs j ON a.job_id = j.id
      LEFT JOIN candidate_profiles cp ON a.candidate_id = cp.id
      LEFT JOIN employee_profiles ep ON a.employee_id = ep.id
      LEFT JOIN interview_feedback f ON f.interview_id = i.id
      ORDER BY i.scheduled_date DESC LIMIT 5
    `);
    console.log('=== Interview details ===');
    console.log(JSON.stringify(r.rows, null, 2));

    // Test offer details
    const r2 = await db.query(`
      SELECT j.title as job_title, j.department,
             COALESCE(cp.first_name, ep.first_name) || ' ' || COALESCE(cp.last_name, ep.last_name) as candidate_name,
             a.status as application_status,
             a.ai_overall_score as ai_score,
             a.reviewed_at::date as decision_date,
             CASE WHEN a.employee_id IS NOT NULL THEN 'Internal' ELSE 'External' END as candidate_type
      FROM applications a
      JOIN jobs j ON a.job_id = j.id
      LEFT JOIN candidate_profiles cp ON a.candidate_id = cp.id
      LEFT JOIN employee_profiles ep ON a.employee_id = ep.id
      WHERE a.status IN ('offer_extended','offer_accepted','offer_declined','hired','rejected')
      ORDER BY a.updated_at DESC LIMIT 10
    `);
    console.log('\n=== Offers details ===');
    console.log(JSON.stringify(r2.rows, null, 2));

    process.exit(0);
  } catch(e) { console.error(e); process.exit(1); }
}
test();
