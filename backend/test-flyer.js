const db = require('./src/config/database');
const flyer = require('./src/services/jobFlyer.service');

(async () => {
    try {
        const r = await db.query(`
            SELECT j.*, array_agg(DISTINCT s.name) as skill_names 
            FROM jobs j 
            LEFT JOIN job_skills js ON j.id = js.job_id 
            LEFT JOIN skills s ON js.skill_id = s.id 
            WHERE j.status = 'published' 
            GROUP BY j.id LIMIT 1
        `);

        if (r.rows.length === 0) {
            console.log('No published jobs found');
            process.exit();
        }

        const job = r.rows[0];

        // Parse JSON fields
        if (job.requirements && typeof job.requirements === 'string') job.requirements = JSON.parse(job.requirements);
        if (job.benefits && typeof job.benefits === 'string') job.benefits = JSON.parse(job.benefits);
        if (job.responsibilities && typeof job.responsibilities === 'string') job.responsibilities = JSON.parse(job.responsibilities);

        console.log('Generating flyer for:', job.title);
        console.log('Description length:', (job.description || '').length);
        console.log('Requirements:', job.requirements);
        console.log('Skills:', job.skill_names);

        const filePath = await flyer.generateFlyer(job, 'Chamboko Investments');
        console.log('SUCCESS! Flyer saved at:', filePath);
        process.exit();
    } catch (e) {
        console.error('ERROR:', e.message);
        console.error(e.stack);
        process.exit(1);
    }
})();
