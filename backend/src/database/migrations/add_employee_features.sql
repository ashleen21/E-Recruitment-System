-- Migration: Add employee features
-- Date: 2024
-- Description: Adds photo_url, resume_url to employee_profiles and creates saved_jobs table

-- Add photo_url and resume_url columns to employee_profiles if they don't exist
DO $$
BEGIN
    -- Add photo_url column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'employee_profiles' AND column_name = 'photo_url'
    ) THEN
        ALTER TABLE employee_profiles ADD COLUMN photo_url VARCHAR(500);
    END IF;

    -- Add resume_url column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'employee_profiles' AND column_name = 'resume_url'
    ) THEN
        ALTER TABLE employee_profiles ADD COLUMN resume_url VARCHAR(500);
    END IF;
END $$;

-- Create saved_jobs table for employees to bookmark/save job opportunities
CREATE TABLE IF NOT EXISTS saved_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID REFERENCES employee_profiles(id) ON DELETE CASCADE,
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(employee_id, job_id)
);

-- Create index for saved_jobs
CREATE INDEX IF NOT EXISTS idx_saved_jobs_employee ON saved_jobs(employee_id);
CREATE INDEX IF NOT EXISTS idx_saved_jobs_job ON saved_jobs(job_id);

-- Add index on training_records for faster queries
CREATE INDEX IF NOT EXISTS idx_training_status ON training_records(status);

-- Success message
SELECT 'Migration completed successfully' AS result;
