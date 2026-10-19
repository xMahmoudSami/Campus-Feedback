# Database Schema Contract & Assumptions

This document outlines the database schema contract implemented by the backend and assumed from the project requirements.

## Overview of Conceptual Tables

| Table | Purpose | Primary Key | Foreign Keys |
| :--- | :--- | :--- | :--- |
| `users` | Pre-created accounts for admins and students | `id` (SERIAL) | None |
| `surveys` | Survey metadata and lifecycle status | `id` (SERIAL) | `created_by` -> `users(id)` |
| `questions` | Questions within a survey | `id` (SERIAL) | `survey_id` -> `surveys(id)` |
| `survey_views` | Genuine survey view logs | `id` (SERIAL) | `survey_id` -> `surveys(id)`, `user_id` -> `users(id)` |
| `survey_responses` | Submissions header per student | `id` (SERIAL) | `survey_id` -> `surveys(id)`, `student_id` -> `users(id)` |
| `answers` | Answers per question for each response | `id` (SERIAL) | `response_id` -> `survey_responses(id)`, `question_id` -> `questions(id)` |
| `feedback` | Direct student feedback entries | `id` (SERIAL) | `student_id` -> `users(id)` |

## Key Rules & Constraints

1. **User Accounts & Authentication**:
   - Accounts have roles `admin` or `student`.
   - Passwords must be hashed using `bcrypt`.
   - Login supports either `username` or `email` as the identifier.
   - No public registration endpoint is exposed.

2. **Survey Status Lifecycle**:
   - Status must be one of: `'draft'`, `'published'`, `'closed'`.
   - Only `published` surveys are visible to students.
   - Once a survey is `'closed'`, no new responses can be submitted.

3. **Question Types & Options**:
   - `question_type` must be one of: `'text'`, `'single_choice'`, `'rating'`.
   - `options` is stored as `JSONB` array of strings (e.g. `["Excellent", "Good", "Fair", "Poor"]`) for `single_choice`.
   - Rating questions expect an integer from `1` to `5`.

4. **Response Integrity & Deduplication**:
   - A unique constraint `(survey_id, student_id)` on `survey_responses` guarantees that a student can only submit a completed response once per survey.
   - Multi-step writes (`survey_responses` and `answers`) are wrapped in PostgreSQL transactions (`BEGIN ... COMMIT`).
   - Partial submissions are strictly rolled back if any answer validation or insertion fails.

5. **Survey Views & Metrics**:
   - When a student fetches a published survey (`GET /api/surveys/:id`), a record is inserted into `survey_views` (tracking `user_id`, `ip_address`, and timestamp).
   - Metrics distinguish between:
     - **Unique Views**: Distinct students who opened the survey.
     - **Total Views**: Raw view count.
     - **Completed Responses**: Count of finished submissions.
     - **View-to-Response Rate**: `(completed responses / unique views) * 100%`. Note: This measures the conversion of students who viewed the survey to completed submissions, not the percentage of all enrolled university students.
