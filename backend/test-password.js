const bcrypt = require('bcryptjs');
const db = require('./src/config/database');

async function resetPassword() {
    try {
        const newPassword = 'hr123456';
        const hash = await bcrypt.hash(newPassword, 12);
        
        const result = await db.query(
            "UPDATE users SET password_hash = $1, failed_login_attempts = 0, locked_until = NULL WHERE email = 'hr@company.com' RETURNING email",
            [hash]
        );
        
        console.log('Password reset for:', result.rows[0].email);
        console.log('New password: hr123456');
        
        // Verify it works
        const verifyResult = await db.query("SELECT password_hash FROM users WHERE email = 'hr@company.com'");
        const valid = await bcrypt.compare('hr123456', verifyResult.rows[0].password_hash);
        console.log('Password verification:', valid ? 'SUCCESS' : 'FAILED');
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

resetPassword();
