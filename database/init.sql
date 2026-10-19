-- Student Feedback System - initial schema
-- Runs automatically ONLY the first time the database volume is empty.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ========== Tables ==========

-- users: accounts and roles
CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    full_name     VARCHAR(100) NOT NULL,
    email         VARCHAR(150) NOT NULL UNIQUE,
    username      VARCHAR(50)  NOT NULL UNIQUE,
    password_hash TEXT         NOT NULL,
    role          VARCHAR(10)  NOT NULL CHECK (role IN ('admin', 'student')),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- surveys: title, description, status, publish/close dates
CREATE TABLE surveys (
    id           SERIAL PRIMARY KEY,
    title        VARCHAR(200) NOT NULL,
    description  TEXT,
    status       VARCHAR(10)  NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft', 'published', 'closed')),
    created_by   INT NOT NULL REFERENCES users(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    closed_at    TIMESTAMPTZ
);

-- questions: text, type, order
CREATE TABLE questions (
    id            SERIAL PRIMARY KEY,
    survey_id     INT NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    question_type VARCHAR(20) NOT NULL
                  CHECK (question_type IN ('rating', 'text', 'multiple_choice')),
    options       JSONB,                     -- e.g. ["Good","Average","Bad"]
    position      INT NOT NULL DEFAULT 1,
    is_required   BOOLEAN NOT NULL DEFAULT TRUE
);

-- survey_responses: a student's attempt + overall completion status
CREATE TABLE survey_responses (
    id           SERIAL PRIMARY KEY,
    survey_id    INT NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    student_id   INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status       VARCHAR(15) NOT NULL DEFAULT 'in_progress'
                 CHECK (status IN ('in_progress', 'completed')),
    started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    UNIQUE (survey_id, student_id)           -- one attempt per student per survey
);

-- answers: answers to each question
CREATE TABLE answers (
    id          SERIAL PRIMARY KEY,
    response_id INT NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
    question_id INT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    answer_text TEXT,
    rating      INT CHECK (rating BETWEEN 1 AND 5),
    UNIQUE (response_id, question_id)
);

-- feedback: general comments sent by students
CREATE TABLE feedback (
    id         SERIAL PRIMARY KEY,
    student_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    survey_id  INT REFERENCES surveys(id) ON DELETE SET NULL,  -- optional link to a survey
    message    TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- survey_views: survey views, used for statistics
CREATE TABLE survey_views (
    id         SERIAL PRIMARY KEY,
    survey_id  INT NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    student_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    viewed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========== Indexes ==========
CREATE INDEX idx_surveys_status     ON surveys(status);
CREATE INDEX idx_questions_survey   ON questions(survey_id);
CREATE INDEX idx_sresponses_survey  ON survey_responses(survey_id);
CREATE INDEX idx_answers_response   ON answers(response_id);
CREATE INDEX idx_feedback_student   ON feedback(student_id);
CREATE INDEX idx_views_survey       ON survey_views(survey_id);

-- ========== Example statistics query (admin dashboard reference) ==========
-- SELECT s.id, s.title,
--        (SELECT COUNT(*) FROM survey_views v WHERE v.survey_id = s.id)                         AS views,
--        COUNT(r.id)                                                                            AS attempts,
--        COUNT(r.id) FILTER (WHERE r.status = 'completed')                                      AS completed,
--        ROUND(100.0 * COUNT(r.id) FILTER (WHERE r.status = 'completed')
--              / NULLIF(COUNT(r.id), 0), 1)                                                     AS completion_rate
-- FROM surveys s
-- LEFT JOIN survey_responses r ON r.survey_id = s.id
-- GROUP BY s.id;
