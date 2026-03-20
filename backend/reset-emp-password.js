const db = require('./src/config/database');
const bcrypt = require('bcrypt');

async function resetEmployeePassword() {
  try {
    const password = 'employee123';
    const passwordHash = await bcrypt.hash(password, 10);
    
    const result = await db.query(`
      UPDATE users 
      SET password_hash = $1
      WHERE email = 'employee@company.com'
      RETURNING email
    `, [passwordHash]);
    
    if (result.rows.length > 0) {
      console.log(`Password reset for ${result.rows[0].email}`);
      console.log(`New password: ${password}`);
    } else {
      console.log('User not found');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

resetEmployeePassword();
