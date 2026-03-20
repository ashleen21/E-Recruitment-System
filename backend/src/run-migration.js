// Run migration script
const { pool } = require('./config/database');
const fs = require('fs');
const path = require('path');

async function runMigration() {
    const migrationPath = path.join(__dirname, 'database', 'migrations', 'add_employee_features.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    try {
        console.log('Running migration...');
        const result = await pool.query(sql);
        console.log('Migration completed successfully!');
        console.log(result);
    } catch (error) {
        console.error('Migration error:', error.message);
    } finally {
        await pool.end();
    }
}

runMigration();
