const db = require('./src/config/database');

async function findEmployees() {
  try {
    const result = await db.query(`
      SELECT u.id, u.email, u.role, ep.id as employee_profile_id, ep.first_name, ep.last_name, ep.employee_id, ep.department
      FROM users u 
      LEFT JOIN employee_profiles ep ON u.id = ep.user_id 
      WHERE u.role = 'employee'
    `);
    console.log('All employee users:');
    if (result.rows.length === 0) {
      console.log('No employees found in the system.');
    } else {
      result.rows.forEach(r => {
        console.log(`- ${r.first_name || 'No name'} ${r.last_name || ''} (${r.email}) - user_id: ${r.id}, employee_id: ${r.employee_id}, dept: ${r.department}`);
      });
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

findEmployees();
