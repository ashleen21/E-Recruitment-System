const db = require('./src/config/database');
async function check() {
  try {
    const r = await db.query(`SELECT a.id, a.candidate_id, a.employee_id, cp.first_name as cp_fn, cp.last_name as cp_ln, ep.first_name as ep_fn, ep.last_name as ep_ln, a.status FROM applications a LEFT JOIN candidate_profiles cp ON a.candidate_id = cp.id LEFT JOIN employee_profiles ep ON a.employee_id = ep.id LIMIT 10`);
    console.table(r.rows);
    const r2 = await db.query(`SELECT a.id, COALESCE(cp.first_name, ep.first_name) || ' ' || COALESCE(cp.last_name, ep.last_name) as name, a.status FROM applications a LEFT JOIN candidate_profiles cp ON a.candidate_id = cp.id LEFT JOIN employee_profiles ep ON a.employee_id = ep.id WHERE a.status IN ('offer_extended','hired','offer_accepted','offer_declined','interviewed') LIMIT 10`);
    console.log('\nConstructed names:');
    console.table(r2.rows);
    const r3 = await db.query(`SELECT id, first_name, last_name FROM candidate_profiles LIMIT 5`);
    console.log('\nCandidate profiles:');
    console.table(r3.rows);
    const r4 = await db.query(`SELECT id, first_name, last_name FROM employee_profiles LIMIT 5`);
    console.log('\nEmployee profiles:');
    console.table(r4.rows);
    process.exit(0);
  } catch(e) { console.error(e); process.exit(1); }
}
check();
