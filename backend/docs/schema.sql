-- ==============================================================================
-- Student Feedback System - Database Schema Definition (PostgreSQL)
-- Proposed Contract for Backend-Database Integration
-- Location: backend/docs/schema.sql
-- ==============================================================================

-- Drop tables in reverse order of dependencies (safe for local development / testing)
DROP TABLE IF EXISTS answers CASCADE;
DROP TABLE IF EXISTS survey_responses CASCADE;
DROP TABLE IF EXISTS survey_views CASCADE;
DROP TABLE IF EXISTS questions CASCADE;
DROP TABLE IF EXISTS feedback CASCADE;
DROP TABLE IF EXISTS surveys CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ------------------------------------------------------------------------------
-- 1. Users Table
-- Pre-created accounts for Students and Administrators.
-- No public registration endpoint exists.
-- ------------------------------------------------------------------------------
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'student')),
    full_name VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role);

-- ------------------------------------------------------------------------------
-- 2. Surveys Table
-- Surveys created and managed by administrators.
-- Statuses: 'draft', 'published', 'closed'
-- ------------------------------------------------------------------------------
CREATE TABLE surveys (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed')),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_surveys_status ON surveys(status);
CREATE INDEX idx_surveys_created_by ON surveys(created_by);

-- ------------------------------------------------------------------------------
-- 3. Questions Table
-- Questions belonging to a survey.
-- Supported types: 'text', 'single_choice', 'rating'
-- Options are stored as JSONB for single_choice questions (array of strings).
-- ------------------------------------------------------------------------------
CREATE TABLE questions (
    id SERIAL PRIMARY KEY,
    survey_id INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    question_type VARCHAR(20) NOT NULL CHECK (question_type IN ('text', 'single_choice', 'rating')),
    options JSONB DEFAULT '[]'::jsonb,
    is_required BOOLEAN NOT NULL DEFAULT true,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_questions_survey_id ON questions(survey_id);

-- ------------------------------------------------------------------------------
-- 4. Survey Views Table
-- Tracks genuine views of a survey by users or visitors.
-- Used to calculate survey view metrics and response-to-view ratios.
-- ------------------------------------------------------------------------------
CREATE TABLE survey_views (
    id SERIAL PRIMARY KEY,
    survey_id INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    viewed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_survey_views_survey_id ON survey_views(survey_id);
CREATE INDEX idx_survey_views_user_id ON survey_views(user_id);

-- ------------------------------------------------------------------------------
-- 5. Survey Responses Table
-- Header record for a completed survey response by a student.
-- Enforces a unique constraint to prevent duplicate submissions per student.
-- ------------------------------------------------------------------------------
CREATE TABLE survey_responses (
    id SERIAL PRIMARY KEY,
    survey_id INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_survey_student_submission UNIQUE (survey_id, student_id)
);

CREATE INDEX idx_survey_responses_survey_id ON survey_responses(survey_id);
CREATE INDEX idx_survey_responses_student_id ON survey_responses(student_id);

-- ------------------------------------------------------------------------------
-- 6. Answers Table
-- Individual question answers tied to a survey response header.
-- Rating value is stored as an integer (1-5), and answer_text stores text/choice.
-- ------------------------------------------------------------------------------
CREATE TABLE answers (
    id SERIAL PRIMARY KEY,
    response_id INTEGER NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    answer_text TEXT,
    rating_value INTEGER CHECK (rating_value IS NULL OR (rating_value >= 1 AND rating_value <= 5)),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_response_question_answer UNIQUE (response_id, question_id)
);

CREATE INDEX idx_answers_response_id ON answers(response_id);
CREATE INDEX idx_answers_question_id ON answers(question_id);

-- ------------------------------------------------------------------------------
-- 7. Feedback Table
-- Direct feedback submitted by students regarding courses or the system.
-- ------------------------------------------------------------------------------
CREATE TABLE feedback (
    id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    title VARCHAR(255),
    message TEXT NOT NULL,
    category VARCHAR(50) DEFAULT 'general',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_feedback_student_id ON feedback(student_id);
