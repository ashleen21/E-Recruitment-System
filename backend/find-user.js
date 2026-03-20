const db = require('./src/config/database');

async function findUser() {
  try {
    const result = await db.query(`
      SELECT u.id, u.email, u.role, cp.id as candidate_id, cp.first_name, cp.last_name 
      FROM users u 
      LEFT JOIN candidate_profiles cp ON u.id = cp.user_id 
      WHERE u.role = 'candidate'
    `);
    console.log('All candidate users:');
    result.rows.forEach(r => {
      console.log(`- ${r.first_name} ${r.last_name} (${r.email}) - user_id: ${r.id}, candidate_id: ${r.candidate_id}`);
    });

    // Check for applications for each candidate
    for (const user of result.rows) {
      if (user.candidate_id) {
        const apps = await db.query(`
          SELECT COUNT(*) as count FROM applications WHERE candidate_id = $1
        `, [user.candidate_id]);
        console.log(`  -> ${apps.rows[0].count} applications`);
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

findUser();
