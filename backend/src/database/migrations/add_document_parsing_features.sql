-- Migration: Add document parsing and auto-notification features
-- This migration ensures all needed columns exist for auto-extraction and notifications

-- Ensure notifications table exists (it should from schema.sql, but be safe)
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(300) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50),
    link VARCHAR(500),
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, is_read);

-- Add photo_url to employee_profiles if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employee_profiles' AND column_name = 'photo_url') THEN
        ALTER TABLE employee_profiles ADD COLUMN photo_url VARCHAR(500);
    END IF;
END $$;

-- Add resume_url to employee_profiles if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employee_profiles' AND column_name = 'resume_url') THEN
        ALTER TABLE employee_profiles ADD COLUMN resume_url VARCHAR(500);
    END IF;
END $$;

-- Add bio column to employee_profiles if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employee_profiles' AND column_name = 'bio') THEN
        ALTER TABLE employee_profiles ADD COLUMN bio TEXT;
    END IF;
END $$;

-- Add ai_extracted_data to employee_profiles for storing last extraction metadata
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employee_profiles' AND column_name = 'ai_extracted_data') THEN
        ALTER TABLE employee_profiles ADD COLUMN ai_extracted_data JSONB;
    END IF;
END $$;

-- Add last_document_parse to employee_profiles
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employee_profiles' AND column_name = 'last_document_parse') THEN
        ALTER TABLE employee_profiles ADD COLUMN last_document_parse TIMESTAMP;
    END IF;
END $$;
