const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

async function seedDatabase() {
    const client = await pool.connect();
    
    try {
        console.log('🌱 Starting database seeding...\n');
        
        await client.query('BEGIN');

        // Create Admin User
        console.log('👤 Creating admin user...');
        const adminPasswordHash = await bcrypt.hash('admin123', 12);
        const adminResult = await client.query(`
            INSERT INTO users (email, password_hash, role, status, email_verified)
            VALUES ($1, $2, 'admin', 'active', true)
            ON CONFLICT (email) DO UPDATE SET password_hash = $2
            RETURNING id
        `, ['admin@company.com', adminPasswordHash]);
        const adminId = adminResult.rows[0].id;

        // Create HR Manager User
        console.log('👤 Creating HR manager user...');
        const hrPasswordHash = await bcrypt.hash('hr123456', 12);
        const hrResult = await client.query(`
            INSERT INTO users (email, password_hash, role, status, email_verified)
            VALUES ($1, $2, 'hr_manager', 'active', true)
            ON CONFLICT (email) DO UPDATE SET password_hash = $2
            RETURNING id
        `, ['hr@company.com', hrPasswordHash]);
        const hrId = hrResult.rows[0].id;

        // Create Sample Employee User
        console.log('👤 Creating sample employee...');
        const empPasswordHash = await bcrypt.hash('emp123456', 12);
        const empResult = await client.query(`
            INSERT INTO users (email, password_hash, role, status, email_verified)
            VALUES ($1, $2, 'employee', 'active', true)
            ON CONFLICT (email) DO UPDATE SET password_hash = $2
            RETURNING id
        `, ['employee@company.com', empPasswordHash]);
        const empId = empResult.rows[0].id;

        // Create Employee Profile
        await client.query(`
            INSERT INTO employee_profiles (user_id, employee_id, first_name, last_name, department, job_title, hire_date, employment_status, location)
            VALUES ($1, 'EMP001', 'John', 'Smith', 'Engineering', 'Senior Software Engineer', '2022-01-15', 'full_time', 'New York, NY')
            ON CONFLICT (employee_id) DO NOTHING
        `, [empId]);

        // Create Sample Candidate Users
        console.log('👤 Creating sample candidates...');
        const candidatePassHash = await bcrypt.hash('candidate123', 12);
        
        const candidates = [
            { email: 'jane.doe@email.com', firstName: 'Jane', lastName: 'Doe', phone: '+1-555-0101', location: 'San Francisco, CA', title: 'Full Stack Developer', experience: 5 },
            { email: 'mike.johnson@email.com', firstName: 'Mike', lastName: 'Johnson', phone: '+1-555-0102', location: 'Austin, TX', title: 'Data Scientist', experience: 4 },
            { email: 'sarah.wilson@email.com', firstName: 'Sarah', lastName: 'Wilson', phone: '+1-555-0103', location: 'Seattle, WA', title: 'Product Manager', experience: 6 }
        ];

        for (const candidate of candidates) {
            const userRes = await client.query(`
                INSERT INTO users (email, password_hash, role, status, email_verified)
                VALUES ($1, $2, 'candidate', 'active', true)
                ON CONFLICT (email) DO UPDATE SET password_hash = $2
                RETURNING id
            `, [candidate.email, candidatePassHash]);
            
            // Check if profile already exists
            const existingProfile = await client.query(
                'SELECT id FROM candidate_profiles WHERE user_id = $1',
                [userRes.rows[0].id]
            );
            if (existingProfile.rows.length === 0) {
                await client.query(`
                    INSERT INTO candidate_profiles (user_id, first_name, last_name, phone, location, current_job_title, years_of_experience)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                `, [userRes.rows[0].id, candidate.firstName, candidate.lastName, candidate.phone, candidate.location, candidate.title, candidate.experience]);
            }
        }

        // Seed Skills
        console.log('🛠️  Seeding skills...');
        const skills = [
            // Technical Skills
            { name: 'JavaScript', category: 'technical', aliases: ['JS', 'ECMAScript'] },
            { name: 'TypeScript', category: 'technical', aliases: ['TS'] },
            { name: 'Python', category: 'technical', aliases: [] },
            { name: 'Java', category: 'technical', aliases: [] },
            { name: 'React', category: 'technical', aliases: ['ReactJS', 'React.js'] },
            { name: 'Node.js', category: 'technical', aliases: ['NodeJS', 'Node'] },
            { name: 'PostgreSQL', category: 'technical', aliases: ['Postgres', 'PG'] },
            { name: 'MongoDB', category: 'technical', aliases: ['Mongo'] },
            { name: 'AWS', category: 'technical', aliases: ['Amazon Web Services'] },
            { name: 'Docker', category: 'technical', aliases: [] },
            { name: 'Kubernetes', category: 'technical', aliases: ['K8s'] },
            { name: 'Machine Learning', category: 'technical', aliases: ['ML'] },
            { name: 'Data Analysis', category: 'technical', aliases: ['Data Analytics'] },
            { name: 'SQL', category: 'technical', aliases: ['Structured Query Language'] },
            { name: 'Git', category: 'tool', aliases: ['GitHub', 'GitLab'] },
            { name: 'Agile', category: 'domain', aliases: ['Scrum', 'Kanban'] },
            
            // Soft Skills
            { name: 'Communication', category: 'soft_skill', aliases: [] },
            { name: 'Leadership', category: 'soft_skill', aliases: [] },
            { name: 'Problem Solving', category: 'soft_skill', aliases: ['Analytical Thinking'] },
            { name: 'Teamwork', category: 'soft_skill', aliases: ['Collaboration'] },
            { name: 'Time Management', category: 'soft_skill', aliases: [] },
            { name: 'Project Management', category: 'soft_skill', aliases: ['PM'] },
            
            // Languages
            { name: 'English', category: 'language', aliases: [] },
            { name: 'Spanish', category: 'language', aliases: [] },
            { name: 'French', category: 'language', aliases: [] },
            { name: 'Mandarin', category: 'language', aliases: ['Chinese'] },
            
            // Certifications
            { name: 'AWS Certified Solutions Architect', category: 'certification', aliases: ['AWS SA'] },
            { name: 'PMP', category: 'certification', aliases: ['Project Management Professional'] },
            { name: 'Scrum Master', category: 'certification', aliases: ['CSM'] },
            { name: 'Google Cloud Professional', category: 'certification', aliases: ['GCP Certified'] }
        ];

        for (const skill of skills) {
            await client.query(`
                INSERT INTO skills (name, normalized_name, category, aliases, is_verified)
                VALUES ($1, $2, $3, $4, true)
                ON CONFLICT (normalized_name) DO NOTHING
            `, [skill.name, skill.name.toLowerCase().replace(/[^a-z0-9]/g, '_'), skill.category, skill.aliases]);
        }

        // Seed Sample Jobs
        console.log('💼 Creating sample job postings...');
        const jobs = [
            {
                title: 'Senior Full Stack Developer',
                department: 'Engineering',
                location: 'San Francisco, CA',
                job_type: 'full_time',
                experience_level: 'Senior',
                min_experience: 5,
                max_experience: 10,
                salary_min: 150000,
                salary_max: 200000,
                description: 'We are looking for a talented Senior Full Stack Developer to join our growing engineering team. You will be responsible for building scalable web applications and leading technical initiatives.',
                responsibilities: ['Design and implement scalable web applications', 'Lead technical discussions and code reviews', 'Mentor junior developers', 'Collaborate with product team on feature development'],
                requirements: ['5+ years of experience in full stack development', 'Strong proficiency in React and Node.js', 'Experience with PostgreSQL or similar databases', 'Excellent problem-solving skills'],
                status: 'published'
            },
            {
                title: 'Data Scientist',
                department: 'Data Science',
                location: 'New York, NY',
                job_type: 'full_time',
                experience_level: 'Mid',
                min_experience: 3,
                max_experience: 6,
                salary_min: 120000,
                salary_max: 160000,
                description: 'Join our data science team to build machine learning models and derive insights from complex datasets. You will work on predictive analytics and recommendation systems.',
                responsibilities: ['Build and deploy machine learning models', 'Analyze large datasets to extract actionable insights', 'Collaborate with engineering teams', 'Present findings to stakeholders'],
                requirements: ['3+ years experience in data science', 'Strong Python skills', 'Experience with ML frameworks', 'Statistical analysis expertise'],
                status: 'published'
            },
            {
                title: 'Product Manager',
                department: 'Product',
                location: 'Remote',
                job_type: 'remote',
                experience_level: 'Senior',
                min_experience: 5,
                max_experience: 8,
                salary_min: 140000,
                salary_max: 180000,
                description: 'Lead product strategy and roadmap for our core platform. Work closely with engineering, design, and business teams to deliver exceptional user experiences.',
                responsibilities: ['Define product strategy and roadmap', 'Gather and prioritize requirements', 'Work with UX team on designs', 'Track product metrics'],
                requirements: ['5+ years of product management experience', 'Experience with B2B SaaS products', 'Strong analytical skills', 'Excellent communication'],
                status: 'published'
            },
            {
                title: 'DevOps Engineer',
                department: 'Engineering',
                location: 'Austin, TX',
                job_type: 'full_time',
                experience_level: 'Mid',
                min_experience: 3,
                max_experience: 6,
                salary_min: 110000,
                salary_max: 150000,
                description: 'Help us build and maintain our cloud infrastructure. You will work on CI/CD pipelines, container orchestration, and infrastructure automation.',
                responsibilities: ['Manage cloud infrastructure on AWS', 'Build CI/CD pipelines', 'Implement monitoring and alerting', 'Optimize system performance'],
                requirements: ['3+ years DevOps experience', 'Strong AWS knowledge', 'Experience with Docker and Kubernetes', 'Infrastructure as Code skills'],
                status: 'published'
            },
            {
                title: 'Junior Software Engineer (Internal)',
                department: 'Engineering',
                location: 'San Francisco, CA',
                job_type: 'full_time',
                experience_level: 'Junior',
                min_experience: 0,
                max_experience: 2,
                salary_min: 80000,
                salary_max: 100000,
                description: 'Internal opportunity for employees looking to transition into software engineering. Training and mentorship provided.',
                responsibilities: ['Learn software development best practices', 'Contribute to team projects', 'Participate in code reviews', 'Attend training sessions'],
                requirements: ['Basic programming knowledge', 'Eagerness to learn', 'Problem-solving mindset', 'Team player'],
                status: 'published',
                is_internal: true
            }
        ];

        for (const job of jobs) {
            await client.query(`
                INSERT INTO jobs (
                    title, department, location, job_type, experience_level,
                    min_experience_years, max_experience_years, salary_min, salary_max,
                    description, responsibilities, requirements, status, created_by,
                    is_internal_only, published_at, is_remote
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP, $16)
            `, [
                job.title, job.department, job.location, job.job_type, job.experience_level,
                job.min_experience, job.max_experience, job.salary_min, job.salary_max,
                job.description, job.responsibilities, job.requirements, job.status, hrId,
                job.is_internal || false, job.job_type === 'remote'
            ]);
        }

        await client.query('COMMIT');
        
        console.log('\n✅ Database seeding completed successfully!');
        console.log('\n📋 Test Accounts Created:');
        console.log('   Admin: admin@company.com / admin123');
        console.log('   HR Manager: hr@company.com / hr123456');
        console.log('   Employee: employee@company.com / emp123456');
        console.log('   Candidate: jane.doe@email.com / candidate123');
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Seeding failed:', error.message);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

seedDatabase().catch(console.error);
