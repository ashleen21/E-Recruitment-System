const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

async function setupDatabase() {
    // First connect to default postgres database to create our database
    const adminPool = new Pool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: 'postgres'
    });

    try {
        console.log('🔄 Connecting to PostgreSQL...');
        
        // Check if database exists
        const dbCheckResult = await adminPool.query(
            "SELECT 1 FROM pg_database WHERE datname = $1",
            [process.env.DB_NAME]
        );

        if (dbCheckResult.rows.length === 0) {
            console.log(`📦 Creating database: ${process.env.DB_NAME}`);
            await adminPool.query(`CREATE DATABASE ${process.env.DB_NAME}`);
            console.log('✅ Database created successfully');
        } else {
            console.log(`📦 Database ${process.env.DB_NAME} already exists`);
        }

        await adminPool.end();

        // Now connect to our database and run schema
        const appPool = new Pool({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        console.log('🔄 Running database schema...');
        
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        
        await appPool.query(schema);
        
        console.log('✅ Database schema applied successfully');
        
        await appPool.end();
        
        console.log('\n🎉 Database setup complete!');
        console.log(`   Database: ${process.env.DB_NAME}`);
        console.log(`   Host: ${process.env.DB_HOST}:${process.env.DB_PORT}`);
        
    } catch (error) {
        console.error('❌ Database setup failed:', error.message);
        process.exit(1);
    }
}

setupDatabase();
