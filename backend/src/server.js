const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const config = require('./config');
const db = require('./config/database');
const jobScheduler = require('./services/jobScheduler.service');
const { runMigrations } = require('./database/runMigrations');

// Import Routes
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const jobRoutes = require('./routes/job.routes');
const applicationRoutes = require('./routes/application.routes');
const candidateRoutes = require('./routes/candidate.routes');
const employeeRoutes = require('./routes/employee.routes');
const resumeRoutes = require('./routes/resume.routes');
const interviewRoutes = require('./routes/interview.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const skillRoutes = require('./routes/skill.routes');
const aiRoutes = require('./routes/ai.routes');
const settingsRoutes = require('./routes/settings.routes');
const notificationRoutes = require('./routes/notification.routes');

const app = express();

// Security Middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors({
    origin: [config.frontendUrl, 'http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'],
    credentials: true
}));

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // limit each IP to 1000 requests per windowMs
    message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Body Parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
if (config.nodeEnv === 'development') {
    app.use(morgan('dev'));
}

// Static Files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health Check
app.get('/api/health', async (req, res) => {
    try {
        await db.query('SELECT 1');
        res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    } catch (error) {
        res.status(500).json({ status: 'unhealthy', error: error.message });
    }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/resumes', resumeRoutes);
app.use('/api/interviews', interviewRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/skills', skillRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/notifications', notificationRoutes);

// Social Share Route - Serves Open Graph meta tags for LinkedIn, Facebook, Twitter
app.get('/share/job/:id', async (req, res) => {
    try {
        const jobId = req.params.id;
        const result = await db.query(`
            SELECT j.*, u.company_name 
            FROM jobs j 
            LEFT JOIN users u ON j.posted_by = u.id 
            WHERE j.id = $1
        `, [jobId]);
        
        if (result.rows.length === 0) {
            return res.redirect(config.frontendUrl + '/jobs');
        }
        
        const job = result.rows[0];
        const companyName = job.company_name || config.companyName || 'Our Company';
        const frontendUrl = config.frontendUrl || 'http://localhost:3000';
        const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
        
        // Build job details
        const location = job.location || 'Remote';
        const jobType = job.job_type || 'Full-time';
        const salary = job.salary_min && job.salary_max 
            ? `$${Number(job.salary_min).toLocaleString()} - $${Number(job.salary_max).toLocaleString()}`
            : job.salary_min ? `From $${Number(job.salary_min).toLocaleString()}` : '';
        
        const title = `${job.title} at ${companyName}`;
        const description = `📍 ${location} | 💼 ${jobType}${salary ? ` | 💰 ${salary}` : ''}\n\n${(job.description || '').substring(0, 200)}...`;
        const jobUrl = `${frontendUrl}/jobs/${jobId}`;
        
        // Serve HTML with Open Graph meta tags
        res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="${jobUrl}">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description.replace(/"/g, '&quot;')}">
    <meta property="og:site_name" content="${companyName}">
    
    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${description.replace(/"/g, '&quot;')}">
    
    <!-- LinkedIn specific -->
    <meta property="og:locale" content="en_US">
    <meta name="author" content="${companyName}">
    
    <title>${title}</title>
    
    <!-- Auto-redirect to actual job page -->
    <meta http-equiv="refresh" content="0;url=${jobUrl}">
    <script>window.location.href = "${jobUrl}";</script>
</head>
<body>
    <p>Redirecting to job listing...</p>
    <p><a href="${jobUrl}">Click here if not redirected</a></p>
</body>
</html>
        `);
    } catch (error) {
        console.error('Share page error:', error);
        res.redirect(config.frontendUrl + '/jobs');
    }
});

// Error Handling Middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    
    if (err.name === 'ValidationError') {
        return res.status(400).json({ error: err.message });
    }
    
    if (err.name === 'UnauthorizedError') {
        return res.status(401).json({ error: 'Invalid token' });
    }
    
    res.status(err.status || 500).json({
        error: config.nodeEnv === 'development' ? err.message : 'Internal server error'
    });
});

// 404 Handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Start Server
const PORT = config.port;
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`
    🚀 Recruitment System API Server
    ================================
    Environment: ${config.nodeEnv}
    Port: ${PORT}
    Database: ${process.env.DB_NAME}@${process.env.DB_HOST}
    Frontend URL: ${config.frontendUrl}
    ================================
    `);

    runMigrations().catch((err) => {
        console.error('Migration warning:', err.message);
    });

    // Initialize job scheduler for automatic deadline handling
    jobScheduler.init();
});

server.on('error', (err) => {
    console.error('Server error:', err);
});

module.exports = app;
