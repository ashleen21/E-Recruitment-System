const db = require('./src/config/database');

async function checkColumns() {
  try {
    const result = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'employee_profiles'
    `);
    console.log('employee_profiles columns:', result.rows.map(c => c.column_name));
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkColumns();
