-- Add extracted_personal_info column to resumes table for storing personal information
-- This stores JSON object with date of birth, nationality, gender, marital status, address, website, github, visa status, driving license

ALTER TABLE resumes 
ADD COLUMN IF NOT EXISTS extracted_personal_info JSONB;

-- Add comment for documentation
COMMENT ON COLUMN resumes.extracted_personal_info IS 'JSON object of personal information extracted from resume, including dateOfBirth, nationality, gender, maritalStatus, address, website, github, visaStatus, drivingLicense';
