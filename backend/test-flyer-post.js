require('dotenv').config();
const { TwitterApi } = require('twitter-api-v2');
const db = require('./src/config/database');
const jobFlyerService = require('./src/services/jobFlyer.service');
const fs = require('fs');

async function testFlyerPost() {
    try {
        // Get a published job with all details
        const jobResult = await db.query('SELECT * FROM jobs WHERE status = $1 LIMIT 1', ['published']);
        if (jobResult.rows.length === 0) {
            console.log('No published jobs found');
            process.exit(1);
        }
        
        const job = jobResult.rows[0];
        console.log('=== Job Details ===');
        console.log('Title:', job.title);
        console.log('Department:', job.department);
        console.log('Location:', job.location);
        console.log('Job Type:', job.job_type);
        console.log('Salary:', job.salary_min, '-', job.salary_max, job.salary_currency);
        console.log('Description:', job.description?.substring(0, 100) + '...');
        console.log('Requirements:', job.requirements);
        console.log('Benefits:', job.benefits);
        console.log('Responsibilities:', job.responsibilities);
        console.log('Required Skills:', job.required_skills);
        
        // Get skills from junction table
        const skillsResult = await db.query(`
            SELECT s.name 
            FROM job_skills js 
            JOIN skills s ON js.skill_id = s.id 
            WHERE js.job_id = $1
        `, [job.id]);
        
        const skillNames = skillsResult.rows.map(s => s.name);
        console.log('Skill Names from DB:', skillNames);
        
        // Add skill names to job
        job.skill_names = skillNames;
        
        // Generate flyer
        console.log('\n=== Generating Flyer ===');
        const { filePath } = await jobFlyerService.getFlyerBuffer(job, 'E-Recruitment Systems');
        console.log('Flyer generated:', filePath);
        
        // Post to X with flyer
        console.log('\n=== Posting to X ===');
        const client = new TwitterApi({
            appKey: process.env.TWITTER_API_KEY,
            appSecret: process.env.TWITTER_API_SECRET,
            accessToken: process.env.TWITTER_ACCESS_TOKEN,
            accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET
        });
        
        // Upload media
        const mediaId = await client.v1.uploadMedia(filePath, { mimeType: 'image/png' });
        console.log('Media uploaded, ID:', mediaId);
        
        // Post tweet with image
        const tweetText = `🚀 We're Hiring: ${job.title}!\n📍 ${job.location || 'Remote'}\n\nApply now! #hiring #jobs #career`;
        const tweet = await client.v2.tweet({
            text: tweetText,
            media: { media_ids: [mediaId] }
        });
        
        console.log('\n✅ SUCCESS!');
        console.log('Tweet ID:', tweet.data.id);
        console.log('View at: https://x.com/i/web/status/' + tweet.data.id);
        
        // Clean up
        fs.unlinkSync(filePath);
        
        process.exit(0);
    } catch (error) {
        console.error('ERROR:', error.message);
        if (error.data) console.error('Details:', JSON.stringify(error.data, null, 2));
        process.exit(1);
    }
}

testFlyerPost();
