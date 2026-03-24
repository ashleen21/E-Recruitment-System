const cron = require('node-cron');
const db = require('../config/database');

class JobSchedulerService {
    constructor() {
        this.isInitialized = false;
    }

    /**
     * Initialize the job scheduler
     * Runs a cron job to automatically close jobs that have reached their deadline
     */
    init() {
        if (this.isInitialized) {
            return;
        }

        // Run every hour at minute 0 to check for expired jobs
        cron.schedule('0 * * * *', async () => {
            console.log('[JobScheduler] Running deadline check...');
            await this.closeExpiredJobs();
        });

        // Also run immediately on startup to catch any jobs that expired while server was down
        this.closeExpiredJobs();

        this.isInitialized = true;
        console.log('[JobScheduler] Initialized - will check for expired jobs every hour');
    }

    /**
     * Close all jobs that have passed their deadline
     * Only closes jobs that are currently 'published' status
     */
    async closeExpiredJobs() {
        try {
            const result = await db.query(`
                UPDATE jobs 
                SET status = 'closed',
                    updated_at = CURRENT_TIMESTAMP
                WHERE status = 'published' 
                  AND closes_at IS NOT NULL 
                  AND closes_at < CURRENT_TIMESTAMP
                RETURNING id, title, closes_at
            `);

            if (result.rows.length > 0) {
                console.log(`[JobScheduler] Automatically closed ${result.rows.length} job(s) that reached their deadline:`);
                result.rows.forEach(job => {
                    console.log(`  - "${job.title}" (ID: ${job.id}) - Deadline was: ${job.closes_at}`);
                });
            } else {
                console.log('[JobScheduler] No jobs to close at this time');
            }

            return result.rows;
        } catch (error) {
            console.error('[JobScheduler] Error closing expired jobs:', error);
            return [];
        }
    }

    /**
     * Manually trigger a deadline check (useful for testing or admin actions)
     */
    async checkDeadlinesNow() {
        console.log('[JobScheduler] Manual deadline check triggered');
        return await this.closeExpiredJobs();
    }

    /**
     * Get all jobs that are approaching their deadline within the specified hours
     * Useful for sending reminder notifications
     */
    async getJobsApproachingDeadline(hoursAhead = 24) {
        try {
            const result = await db.query(`
                SELECT id, title, closes_at, department, created_by
                FROM jobs 
                WHERE status = 'published' 
                  AND closes_at IS NOT NULL 
                  AND closes_at > CURRENT_TIMESTAMP
                  AND closes_at <= CURRENT_TIMESTAMP + INTERVAL '${hoursAhead} hours'
                ORDER BY closes_at ASC
            `);

            return result.rows;
        } catch (error) {
            console.error('[JobScheduler] Error fetching jobs approaching deadline:', error);
            return [];
        }
    }
}

// Export singleton instance
module.exports = new JobSchedulerService();
