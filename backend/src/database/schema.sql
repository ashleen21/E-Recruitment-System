-- Intelligent Recruitment Management System Database Schema
-- PostgreSQL Database Setup

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================
-- USER ROLES AND AUTHENTICATION
-- ============================================

-- User Roles Enum
CREATE TYPE user_role AS ENUM ('admin', 'hr_manager', 'recruiter', 'candidate', 'employee');

-- User Status Enum
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended', 'pending_verification');

-- Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'candidate',
    status user_status NOT NULL DEFAULT 'pending_verification',
    email_verified BOOLEAN DEFAULT FALSE,
    verification_token VARCHAR(255),
    reset_token VARCHAR(255),
    reset_token_expires TIMESTAMP,
    last_login TIMESTAMP,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for email lookups
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- ============================================
-- CANDIDATE PROFILES
-- ============================================

-- Education Level Enum
CREATE TYPE education_level AS ENUM (
    'high_school', 'associate', 'bachelor', 'master', 'doctorate', 'professional', 'other'
);

-- Candidate Profiles Table
CREATE TABLE candidate_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    location VARCHAR(255),
    linkedin_url VARCHAR(500),
    portfolio_url VARCHAR(500),
    summary TEXT,
    years_of_experience DECIMAL(4,1),
    current_job_title VARCHAR(200),
    current_company VARCHAR(200),
    expected_salary_min DECIMAL(12,2),
    expected_salary_max DECIMAL(12,2),
    salary_currency VARCHAR(3) DEFAULT 'USD',
    willing_to_relocate BOOLEAN DEFAULT FALSE,
    preferred_locations TEXT[],
    availability_date DATE,
    notice_period_days INTEGER,
    profile_completeness INTEGER DEFAULT 0,
    ai_profile_summary TEXT,
    ai_skill_assessment JSONB,
    ai_career_trajectory JSONB,
    profile_photo_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_candidate_user ON candidate_profiles(user_id);
CREATE INDEX idx_candidate_location ON candidate_profiles(location);

-- ============================================
-- EMPLOYEE PROFILES
-- ============================================

-- Employment Status Enum
CREATE TYPE employment_status AS ENUM (
    'full_time', 'part_time', 'contract', 'intern', 'terminated', 'resigned', 'retired'
);

-- Employee Profiles Table
CREATE TABLE employee_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    employee_id VARCHAR(50) UNIQUE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    department VARCHAR(100),
    job_title VARCHAR(200),
    manager_id UUID REFERENCES employee_profiles(id),
    hire_date DATE,
    employment_status employment_status DEFAULT 'full_time',
    location VARCHAR(255),
    salary DECIMAL(12,2),
    salary_currency VARCHAR(3) DEFAULT 'USD',
    performance_rating DECIMAL(3,2),
    last_review_date DATE,
    career_aspirations TEXT,
    internal_mobility_interest BOOLEAN DEFAULT FALSE,
    preferred_roles TEXT[],
    ai_career_path_recommendations JSONB,
    ai_skill_gap_analysis JSONB,
    ai_retention_risk_score DECIMAL(3,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_employee_user ON employee_profiles(user_id);
CREATE INDEX idx_employee_department ON employee_profiles(department);
CREATE INDEX idx_employee_manager ON employee_profiles(manager_id);

-- ============================================
-- SKILLS AND COMPETENCIES
-- ============================================

-- Skill Category Enum
CREATE TYPE skill_category AS ENUM (
    'technical', 'soft_skill', 'language', 'certification', 'tool', 'domain', 'other'
);

-- Skill Level Enum
CREATE TYPE skill_level AS ENUM (
    'beginner', 'intermediate', 'advanced', 'expert'
);

-- Skills Master Table
CREATE TABLE skills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    normalized_name VARCHAR(200) NOT NULL,
    category skill_category NOT NULL,
    description TEXT,
    parent_skill_id UUID REFERENCES skills(id),
    aliases TEXT[],
    is_verified BOOLEAN DEFAULT FALSE,
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_skills_normalized ON skills(normalized_name);
CREATE INDEX idx_skills_category ON skills(category);
CREATE INDEX idx_skills_name_trgm ON skills USING gin(name gin_trgm_ops);

-- Candidate Skills Table
CREATE TABLE candidate_skills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id UUID REFERENCES candidate_profiles(id) ON DELETE CASCADE,
    skill_id UUID REFERENCES skills(id) ON DELETE CASCADE,
    proficiency_level skill_level,
    years_of_experience DECIMAL(4,1),
    last_used_date DATE,
    is_primary BOOLEAN DEFAULT FALSE,
    ai_assessed_level skill_level,
    ai_confidence_score DECIMAL(3,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(candidate_id, skill_id)
);

CREATE INDEX idx_candidate_skills ON candidate_skills(candidate_id);

-- Employee Skills Table
CREATE TABLE employee_skills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID REFERENCES employee_profiles(id) ON DELETE CASCADE,
    skill_id UUID REFERENCES skills(id) ON DELETE CASCADE,
    proficiency_level skill_level,
    years_of_experience DECIMAL(4,1),
    verified_by UUID REFERENCES users(id),
    verification_date DATE,
    ai_assessed_level skill_level,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(employee_id, skill_id)
);

CREATE INDEX idx_employee_skills ON employee_skills(employee_id);

-- ============================================
-- EDUCATION AND CERTIFICATIONS
-- ============================================

-- Education Records Table
CREATE TABLE education_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id UUID REFERENCES candidate_profiles(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES employee_profiles(id) ON DELETE CASCADE,
    institution_name VARCHAR(300) NOT NULL,
    degree_type education_level,
    field_of_study VARCHAR(200),
    start_date DATE,
    end_date DATE,
    is_current BOOLEAN DEFAULT FALSE,
    gpa DECIMAL(4,2),
    achievements TEXT,
    ai_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_education_owner CHECK (
        (candidate_id IS NOT NULL AND employee_id IS NULL) OR
        (candidate_id IS NULL AND employee_id IS NOT NULL)
    )
);

CREATE INDEX idx_education_candidate ON education_records(candidate_id);
CREATE INDEX idx_education_employee ON education_records(employee_id);

-- Certifications Table
CREATE TABLE certifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id UUID REFERENCES candidate_profiles(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES employee_profiles(id) ON DELETE CASCADE,
    name VARCHAR(300) NOT NULL,
    issuing_organization VARCHAR(300),
    issue_date DATE,
    expiry_date DATE,
    credential_id VARCHAR(200),
    credential_url VARCHAR(500),
    ai_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_cert_owner CHECK (
        (candidate_id IS NOT NULL AND employee_id IS NULL) OR
        (candidate_id IS NULL AND employee_id IS NOT NULL)
    )
);

CREATE INDEX idx_cert_candidate ON certifications(candidate_id);
CREATE INDEX idx_cert_employee ON certifications(employee_id);

-- ============================================
-- WORK EXPERIENCE
-- ============================================

-- Work Experience Table
CREATE TABLE work_experience (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id UUID REFERENCES candidate_profiles(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES employee_profiles(id) ON DELETE CASCADE,
    company_name VARCHAR(300) NOT NULL,
    job_title VARCHAR(200) NOT NULL,
    location VARCHAR(255),
    start_date DATE,
    end_date DATE,
    is_current BOOLEAN DEFAULT FALSE,
    description TEXT,
    achievements TEXT[],
    skills_used UUID[],
    ai_extracted_skills JSONB,
    ai_job_level_assessment VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_exp_owner CHECK (
        (candidate_id IS NOT NULL AND employee_id IS NULL) OR
        (candidate_id IS NULL AND employee_id IS NOT NULL)
    )
);

CREATE INDEX idx_exp_candidate ON work_experience(candidate_id);
CREATE INDEX idx_exp_employee ON work_experience(employee_id);

-- ============================================
-- JOB POSTINGS
-- ============================================

-- Job Status Enum
CREATE TYPE job_status AS ENUM (
    'draft', 'published', 'paused', 'closed', 'filled', 'cancelled'
);

-- Job Type Enum
CREATE TYPE job_type AS ENUM (
    'full_time', 'part_time', 'contract', 'temporary', 'internship', 'remote'
);

-- Jobs Table
CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(300) NOT NULL,
    slug VARCHAR(350) UNIQUE,
    department VARCHAR(100),
    location VARCHAR(255),
    job_type job_type NOT NULL,
    experience_level VARCHAR(50),
    min_experience_years DECIMAL(4,1),
    max_experience_years DECIMAL(4,1),
    education_requirement education_level,
    salary_min DECIMAL(12,2),
    salary_max DECIMAL(12,2),
    salary_currency VARCHAR(3) DEFAULT 'USD',
    show_salary BOOLEAN DEFAULT FALSE,
    description TEXT NOT NULL,
    responsibilities TEXT[],
    requirements TEXT[],
    benefits TEXT[],
    required_skills JSONB,
    preferred_skills JSONB,
    competency_requirements JSONB,
    status job_status DEFAULT 'draft',
    is_internal_only BOOLEAN DEFAULT FALSE,
    is_remote BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES users(id),
    published_at TIMESTAMP,
    closes_at TIMESTAMP,
    positions_available INTEGER DEFAULT 1,
    positions_filled INTEGER DEFAULT 0,
    application_count INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,
    ai_job_analysis JSONB,
    ai_ideal_candidate_profile JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_department ON jobs(department);
CREATE INDEX idx_jobs_created_by ON jobs(created_by);
CREATE INDEX idx_jobs_title_trgm ON jobs USING gin(title gin_trgm_ops);

-- Job Required Skills Junction Table
CREATE TABLE job_skills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    skill_id UUID REFERENCES skills(id) ON DELETE CASCADE,
    is_required BOOLEAN DEFAULT TRUE,
    min_proficiency skill_level,
    min_years_experience DECIMAL(4,1),
    weight DECIMAL(3,2) DEFAULT 1.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(job_id, skill_id)
);

CREATE INDEX idx_job_skills ON job_skills(job_id);

-- ============================================
-- JOB DISTRIBUTION
-- ============================================

-- Distribution Platform Enum
CREATE TYPE distribution_platform AS ENUM (
    'linkedin', 'indeed', 'glassdoor', 'twitter', 'facebook', 'company_website', 'other'
);

-- Distribution Status Enum
CREATE TYPE distribution_status AS ENUM (
    'pending', 'published', 'failed', 'removed'
);

-- Job Distribution Table
CREATE TABLE job_distributions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    platform distribution_platform NOT NULL,
    status distribution_status DEFAULT 'pending',
    external_job_id VARCHAR(255),
    external_url VARCHAR(500),
    published_at TIMESTAMP,
    error_message TEXT,
    metrics JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_distribution_job ON job_distributions(job_id);
CREATE INDEX idx_distribution_platform ON job_distributions(platform);

-- ============================================
-- APPLICATIONS
-- ============================================

-- Application Status Enum
CREATE TYPE application_status AS ENUM (
    'submitted', 'under_review', 'shortlisted', 'interview_scheduled',
    'interviewed', 'offer_extended', 'offer_accepted', 'offer_declined',
    'hired', 'rejected', 'withdrawn'
);

-- Applications Table
CREATE TABLE applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
    candidate_id UUID REFERENCES candidate_profiles(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES employee_profiles(id),
    status application_status DEFAULT 'submitted',
    cover_letter TEXT,
    resume_url VARCHAR(500),
    resume_parsed_data JSONB,
    additional_documents JSONB,
    referral_source VARCHAR(100),
    referrer_id UUID REFERENCES users(id),
    
    -- AI Scoring
    ai_overall_score DECIMAL(5,2),
    ai_skill_match_score DECIMAL(5,2),
    ai_experience_match_score DECIMAL(5,2),
    ai_education_match_score DECIMAL(5,2),
    ai_cultural_fit_score DECIMAL(5,2),
    ai_skill_gap_analysis JSONB,
    ai_strengths JSONB,
    ai_concerns JSONB,
    ai_interview_questions JSONB,
    ai_success_prediction DECIMAL(3,2),
    ai_retention_prediction DECIMAL(3,2),
    ai_recommendation TEXT,
    ai_ranking INTEGER,
    
    -- Screening
    screening_questions_answers JSONB,
    screening_score DECIMAL(5,2),
    is_auto_rejected BOOLEAN DEFAULT FALSE,
    auto_reject_reason TEXT,
    
    -- HR Actions
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP,
    notes TEXT,
    
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(job_id, candidate_id)
);

CREATE INDEX idx_application_job ON applications(job_id);
CREATE INDEX idx_application_candidate ON applications(candidate_id);
CREATE INDEX idx_application_status ON applications(status);
CREATE INDEX idx_application_score ON applications(ai_overall_score DESC);

-- ============================================
-- RESUMES
-- ============================================

-- Resume Status Enum
CREATE TYPE resume_status AS ENUM (
    'uploaded', 'processing', 'parsed', 'failed'
);

-- Resumes Table
CREATE TABLE resumes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id UUID REFERENCES candidate_profiles(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES employee_profiles(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_type VARCHAR(50),
    file_size INTEGER,
    status resume_status DEFAULT 'uploaded',
    is_primary BOOLEAN DEFAULT FALSE,
    
    -- Parsed Data
    raw_text TEXT,
    parsed_data JSONB,
    extracted_contact JSONB,
    extracted_summary TEXT,
    extracted_skills JSONB,
    extracted_experience JSONB,
    extracted_education JSONB,
    extracted_certifications JSONB,
    extraction_confidence DECIMAL(5,2),
    
    -- AI Analysis
    ai_analysis JSONB,
    ai_improvement_suggestions TEXT[],
    
    parsing_error TEXT,
    parsed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_resume_owner CHECK (
        (candidate_id IS NOT NULL AND employee_id IS NULL) OR
        (candidate_id IS NULL AND employee_id IS NOT NULL)
    )
);

CREATE INDEX idx_resume_candidate ON resumes(candidate_id);
CREATE INDEX idx_resume_employee ON resumes(employee_id);

-- ============================================
-- INTERVIEWS
-- ============================================

-- Interview Type Enum
CREATE TYPE interview_type AS ENUM (
    'phone_screen', 'video', 'in_person', 'technical', 'panel', 'final'
);

-- Interview Status Enum
CREATE TYPE interview_status AS ENUM (
    'scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show', 'rescheduled'
);

-- Interviews Table
CREATE TABLE interviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID REFERENCES applications(id) ON DELETE CASCADE,
    interview_type interview_type NOT NULL,
    status interview_status DEFAULT 'scheduled',
    scheduled_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    timezone VARCHAR(50) DEFAULT 'UTC',
    location VARCHAR(500),
    meeting_link VARCHAR(500),
    
    -- Participants
    interviewers UUID[],
    organizer_id UUID REFERENCES users(id),
    
    -- Calendar Integration
    google_event_id VARCHAR(255),
    outlook_event_id VARCHAR(255),
    calendar_synced BOOLEAN DEFAULT FALSE,
    
    -- Communication
    invitation_sent BOOLEAN DEFAULT FALSE,
    invitation_sent_at TIMESTAMP,
    reminder_sent BOOLEAN DEFAULT FALSE,
    reminder_sent_at TIMESTAMP,
    
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_interview_application ON interviews(application_id);
CREATE INDEX idx_interview_date ON interviews(scheduled_date);
CREATE INDEX idx_interview_status ON interviews(status);

-- Interview Feedback Table
CREATE TABLE interview_feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    interview_id UUID REFERENCES interviews(id) ON DELETE CASCADE,
    interviewer_id UUID REFERENCES users(id),
    
    -- Ratings (1-5 scale)
    technical_skills_rating INTEGER CHECK (technical_skills_rating BETWEEN 1 AND 5),
    communication_rating INTEGER CHECK (communication_rating BETWEEN 1 AND 5),
    problem_solving_rating INTEGER CHECK (problem_solving_rating BETWEEN 1 AND 5),
    cultural_fit_rating INTEGER CHECK (cultural_fit_rating BETWEEN 1 AND 5),
    leadership_rating INTEGER CHECK (leadership_rating BETWEEN 1 AND 5),
    overall_rating INTEGER CHECK (overall_rating BETWEEN 1 AND 5),
    
    -- Feedback
    strengths TEXT,
    weaknesses TEXT,
    detailed_feedback TEXT,
    recommendation VARCHAR(50),
    hire_recommendation BOOLEAN,
    
    -- AI Analysis
    ai_sentiment_analysis JSONB,
    
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_feedback_interview ON interview_feedback(interview_id);
CREATE INDEX idx_feedback_interviewer ON interview_feedback(interviewer_id);

-- ============================================
-- INTERNAL MOBILITY
-- ============================================

-- Internal Job Matches Table
CREATE TABLE internal_job_matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES employee_profiles(id) ON DELETE CASCADE,
    
    -- AI Matching Scores
    overall_match_score DECIMAL(5,2),
    skill_match_score DECIMAL(5,2),
    experience_match_score DECIMAL(5,2),
    career_alignment_score DECIMAL(5,2),
    readiness_score DECIMAL(5,2),
    
    -- Analysis
    skill_gaps JSONB,
    development_recommendations JSONB,
    transition_difficulty VARCHAR(50),
    estimated_ramp_up_months INTEGER,
    
    -- Status
    notified BOOLEAN DEFAULT FALSE,
    notified_at TIMESTAMP,
    employee_interest VARCHAR(50),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(job_id, employee_id)
);

CREATE INDEX idx_internal_match_job ON internal_job_matches(job_id);
CREATE INDEX idx_internal_match_employee ON internal_job_matches(employee_id);
CREATE INDEX idx_internal_match_score ON internal_job_matches(overall_match_score DESC);

-- ============================================
-- TRAINING AND DEVELOPMENT
-- ============================================

-- Training Records Table
CREATE TABLE training_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID REFERENCES employee_profiles(id) ON DELETE CASCADE,
    training_name VARCHAR(300) NOT NULL,
    provider VARCHAR(200),
    training_type VARCHAR(100),
    description TEXT,
    start_date DATE,
    completion_date DATE,
    status VARCHAR(50),
    score DECIMAL(5,2),
    certificate_url VARCHAR(500),
    skills_gained UUID[],
    ai_recommended BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_training_employee ON training_records(employee_id);

-- Career Path Recommendations Table
CREATE TABLE career_path_recommendations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID REFERENCES employee_profiles(id) ON DELETE CASCADE,
    recommended_role VARCHAR(200),
    department VARCHAR(100),
    timeline_months INTEGER,
    readiness_percentage DECIMAL(5,2),
    required_skills JSONB,
    skill_gaps JSONB,
    recommended_training JSONB,
    success_probability DECIMAL(3,2),
    ai_reasoning TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_career_path_employee ON career_path_recommendations(employee_id);

-- ============================================
-- ANALYTICS AND REPORTING
-- ============================================

-- Recruitment Metrics Table
CREATE TABLE recruitment_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    views INTEGER DEFAULT 0,
    applications INTEGER DEFAULT 0,
    qualified_applications INTEGER DEFAULT 0,
    interviews_scheduled INTEGER DEFAULT 0,
    interviews_completed INTEGER DEFAULT 0,
    offers_extended INTEGER DEFAULT 0,
    offers_accepted INTEGER DEFAULT 0,
    time_to_fill_days INTEGER,
    cost_per_hire DECIMAL(10,2),
    source_breakdown JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(job_id, date)
);

CREATE INDEX idx_metrics_job ON recruitment_metrics(job_id);
CREATE INDEX idx_metrics_date ON recruitment_metrics(date);

-- Hiring Decisions (for AI learning)
CREATE TABLE hiring_decisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID REFERENCES applications(id) ON DELETE CASCADE,
    decision VARCHAR(50) NOT NULL,
    decision_date DATE NOT NULL,
    decision_maker_id UUID REFERENCES users(id),
    
    -- Actual Outcomes (updated over time)
    hire_date DATE,
    still_employed BOOLEAN,
    tenure_months INTEGER,
    performance_ratings JSONB,
    promotions INTEGER DEFAULT 0,
    termination_date DATE,
    termination_reason TEXT,
    
    -- For AI Learning
    ai_prediction_accuracy JSONB,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_hiring_decision_application ON hiring_decisions(application_id);

-- ============================================
-- NOTIFICATIONS AND AUDIT
-- ============================================

-- Notifications Table
CREATE TABLE notifications (
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

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(user_id, is_read);

-- Email Queue Table
CREATE TABLE email_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    to_email VARCHAR(255) NOT NULL,
    to_name VARCHAR(200),
    subject VARCHAR(500) NOT NULL,
    html_body TEXT NOT NULL,
    text_body TEXT,
    template_name VARCHAR(100),
    template_data JSONB,
    status VARCHAR(50) DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    last_attempt_at TIMESTAMP,
    sent_at TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_email_queue_status ON email_queue(status);

-- Audit Log Table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100),
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);

-- ============================================
-- FUNCTIONS AND TRIGGERS
-- ============================================

-- Update timestamp function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update trigger to relevant tables
CREATE TRIGGER update_users_timestamp BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_candidate_profiles_timestamp BEFORE UPDATE ON candidate_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_employee_profiles_timestamp BEFORE UPDATE ON employee_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_jobs_timestamp BEFORE UPDATE ON jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_applications_timestamp BEFORE UPDATE ON applications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_interviews_timestamp BEFORE UPDATE ON interviews
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update application count
CREATE OR REPLACE FUNCTION update_job_application_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE jobs SET application_count = application_count + 1 WHERE id = NEW.job_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE jobs SET application_count = application_count - 1 WHERE id = OLD.job_id;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_application_count
AFTER INSERT OR DELETE ON applications
    FOR EACH ROW EXECUTE FUNCTION update_job_application_count();

-- Function to generate job slug
CREATE OR REPLACE FUNCTION generate_job_slug()
RETURNS TRIGGER AS $$
BEGIN
    NEW.slug = LOWER(REGEXP_REPLACE(NEW.title, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || SUBSTRING(NEW.id::text, 1, 8);
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER generate_slug_trigger
BEFORE INSERT ON jobs
    FOR EACH ROW EXECUTE FUNCTION generate_job_slug();
