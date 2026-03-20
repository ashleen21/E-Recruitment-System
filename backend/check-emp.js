const db = require('./src/config/database');

async function check() {
  try {
    const r = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'employee_profiles' 
      ORDER BY ordinal_position
    `);
    console.log('Employee Profiles Columns:');
    r.rows.forEach(c => console.log('  -', c.column_name, ':', c.data_type));
    
    const apps = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'applications' 
      ORDER BY ordinal_position
    `);
    console.log('\nApplications Columns:');
    apps.rows.forEach(c => console.log('  -', c.column_name, ':', c.data_type));
    
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}

check();
