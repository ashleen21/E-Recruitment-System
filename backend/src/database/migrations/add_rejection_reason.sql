ALTER TABLE applications
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
