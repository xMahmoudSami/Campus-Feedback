# Database Compatibility & Integration Status

## 1. Inspection Results of Existing Database Directory (`database/`)

An audit of the repository outside `backend/` was performed in strict read-only mode:
- **Status of `database/`:** As of the latest check, the `database/` directory contains only `.dockerignore`.
- **Status of Schema Files:** No `database/init.sql` or migration script has been committed yet by the database team member.
- **Root Orchestration (`compose.yaml`):** The file is currently 0 bytes (unpopulated), pending completion by the containerization team member.

Because the database initialization script is not yet present, the backend cannot claim compatibility against an active database implementation. Instead, the backend has implemented the agreed conceptual model and defined a clear, strict contract in [`backend/docs/schema.sql`](./schema.sql) and [`backend/docs/SCHEMA_CONTRACT.md`](./SCHEMA_CONTRACT.md).

---

## 2. Table-by-Table Contract Expected by the Backend

The backend SQL queries are parameterized and strictly expect the following tables, columns, and constraints:

### 1. `users` Table
- `id`: Integer primary key (`SERIAL PRIMARY KEY` or identity).
- `username`: `VARCHAR(50) UNIQUE NOT NULL`.
- `email`: `VARCHAR(255) UNIQUE NOT NULL`.
- `password_hash`: `VARCHAR(255) NOT NULL` (stores 60-character bcrypt hash).
- `role`: `VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'student'))`.
- `full_name`: `VARCHAR(100) NULL`.
- `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`.
- `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`.

### 2. `surveys` Table
- `id`: Integer primary key (`SERIAL PRIMARY KEY`).
- `title`: `VARCHAR(255) NOT NULL`.
- `description`: `TEXT NULL`.
- `status`: `VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed'))`.
- `created_by`: `INTEGER NULL REFERENCES users(id) ON DELETE SET NULL`.
- `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`.
- `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`.

### 3. `questions` Table
- `id`: Integer primary key (`SERIAL PRIMARY KEY`).
- `survey_id`: `INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE`.
- `question_text`: `TEXT NOT NULL`.
- `question_type`: `VARCHAR(20) NOT NULL CHECK (question_type IN ('text', 'single_choice', 'rating'))`.
- `options`: `JSONB DEFAULT '[]'::jsonb` (array of string choices for `single_choice`).
- `is_required`: `BOOLEAN NOT NULL DEFAULT true`.
- `order_index`: `INTEGER NOT NULL DEFAULT 0`.
- `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`.

### 4. `survey_views` Table
- `id`: Integer primary key (`SERIAL PRIMARY KEY`).
- `survey_id`: `INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE`.
- `user_id`: `INTEGER NULL REFERENCES users(id) ON DELETE SET NULL`.
- `ip_address`: `VARCHAR(45) NULL`.
- `user_agent`: `TEXT NULL`.
- `viewed_at`: `TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`.

### 5. `survey_responses` Table
- `id`: Integer primary key (`SERIAL PRIMARY KEY`).
- `survey_id`: `INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE`.
- `student_id`: `INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE`.
- `submitted_at`: `TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`.
- **Constraint:** `CONSTRAINT unique_survey_student_submission UNIQUE (survey_id, student_id)` — mandatory for deduplication.

### 6. `answers` Table
- `id`: Integer primary key (`SERIAL PRIMARY KEY`).
- `response_id`: `INTEGER NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE`.
- `question_id`: `INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE`.
- `answer_text`: `TEXT NULL`.
- `rating_value`: `INTEGER NULL CHECK (rating_value IS NULL OR (rating_value >= 1 AND rating_value <= 5))`.
- `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`.
- **Constraint:** `CONSTRAINT unique_response_question_answer UNIQUE (response_id, question_id)`.

### 7. `feedback` Table
- `id`: Integer primary key (`SERIAL PRIMARY KEY`).
- `student_id`: `INTEGER NULL REFERENCES users(id) ON DELETE SET NULL`.
- `title`: `VARCHAR(255) NULL`.
- `message`: `TEXT NOT NULL`.
- `category`: `VARCHAR(50) DEFAULT 'general'`.
- `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`.

---

## 3. Items Pending Confirmation from Database Team Member

When the database team member prepares `database/init.sql`, they must verify:
1. **Column Naming Alignment:** Ensure `student_id` is used in `survey_responses` and `feedback` (or notify the backend team if named `user_id`).
2. **Options Format:** Ensure `questions.options` is stored as `JSONB` or text JSON.
3. **Rating Constraints:** Ensure the rating scale is `1` through `5` integer values.
4. **Unique Deduplication:** Ensure `UNIQUE (survey_id, student_id)` is defined on `survey_responses`.
5. **Initial Seeding:** The database team member can either include initial seed statements in `database/init.sql` or rely on the backend's `npm run seed` command once containers are linked.
