-- Add extracted_references column to resumes table for storing reference information
-- This stores JSON array of references extracted from resumes

ALTER TABLE resumes 
ADD COLUMN IF NOT EXISTS extracted_references JSONB;

-- Add comment for documentation
COMMENT ON COLUMN resumes.extracted_references IS 'JSON array of references extracted from resume, including name, title, company, email, phone, relationship';
