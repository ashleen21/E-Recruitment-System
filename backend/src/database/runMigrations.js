const fs = require('fs');
const path = require('path');
const db = require('../config/database');

const MIGRATION_FILES = [
    'add_rejection_reason.sql'
];

async function runMigrations() {
    const migrationsDir = path.join(__dirname, 'migrations');

    for (const file of MIGRATION_FILES) {
        const filePath = path.join(migrationsDir, file);
        if (!fs.existsSync(filePath)) continue;
        const sql = fs.readFileSync(filePath, 'utf8');
        await db.query(sql);
        console.log(`✅ Migration applied: ${file}`);
    }
}

module.exports = { runMigrations };
