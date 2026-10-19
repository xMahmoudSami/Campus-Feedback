# Database Schema Compatibility & Integration Report

## 1. Source of Truth
The database schema defined in [`database/init.sql`](file:///c:/_Nero/_University%20Work/Cloud%20Computing/Section%20Eng.%20Naser%20Abdellatif/Student_Feedback_System/database/init.sql) and documented in [`database/README.md`](file:///c:/_Nero/_University%20Work/Cloud%20Computing/Section%20Eng.%20Naser%20Abdellatif/Student_Feedback_System/database/README.md) is the authoritative source of truth. The backend implementation has been updated to align 100% with this schema.

---

## 2. Table-by-Table Alignment Summary

| Table | Database Schema (`database/init.sql`) | Backend Query Status | Notes & Fixes Applied |
| :--- | :--- | :--- | :--- |
| **`users`** | `id`, `full_name`, `email` (UK), `username` (UK), `password_hash`, `role` (`admin`/`student`), `created_at` | Fully Aligned | `full_name` is non-null. Passwords hashed with bcrypt (compatible with `pgcrypto` crypt function). |
| **`surveys`** | `id`, `title`, `description`, `status` (`draft`/`published`/`closed`), `created_by` (FK), `created_at`, `published_at`, `closed_at` | Fully Aligned | Replaced non-existent `updated_at` with lifecycle timestamps (`published_at`, `closed_at`). |
| **`questions`** | `id`, `survey_id` (FK), `question_text`, `question_type` (`rating`/`text`/`multiple_choice`), `options` (JSONB), `position`, `is_required` | Fully Aligned | Replaced `order_index` with schema column `position`. Supported canonical type `multiple_choice` (transparently accepting `single_choice` and mapping to `multiple_choice`). |
| **`survey_responses`** | `id`, `survey_id` (FK), `student_id` (FK), `status` (`in_progress`/`completed`), `started_at`, `completed_at`, `UNIQUE(survey_id, student_id)` | Fully Aligned | Completed submissions record `status = 'completed'`, `started_at = NOW()`, `completed_at = NOW()`. Enforces single attempt per student. |
| **`answers`** | `id`, `response_id` (FK), `question_id` (FK), `answer_text`, `rating` (1-5), `UNIQUE(response_id, question_id)` | Fully Aligned | Replaced `rating_value` with schema column `rating`. Check constraint `1 <= rating <= 5` verified. |
| **`feedback`** | `id`, `student_id` (FK), `survey_id` (FK, nullable), `message`, `created_at` | Fully Aligned | Replaced hypothetical `title`/`category` columns with actual schema columns `student_id, survey_id, message, created_at`. |
| **`survey_views`** | `id`, `survey_id` (FK), `student_id` (FK), `viewed_at` | Fully Aligned | Replaced `user_id/ip_address` with schema columns `survey_id, student_id, viewed_at`. |

---

## 3. Metrics Calculation Alignment

The backend admin dashboard adopts the exact non-duplicating SQL subquery pattern specified in `database/init.sql`:
- **Views**: `(SELECT COUNT(*)::int FROM survey_views v WHERE v.survey_id = s.id)`
- **Attempts**: `COUNT(r.id)`
- **Completed Responses**: `COUNT(r.id) FILTER (WHERE r.status = 'completed')`
- **Completion Rate**: `ROUND(100.0 * COUNT(r.id) FILTER (WHERE r.status = 'completed') / NULLIF(COUNT(r.id), 0), 1)`
- **View-to-Response Rate**: `ROUND(100.0 * COUNT(r.id) FILTER (WHERE r.status = 'completed') / NULLIF((SELECT COUNT(*) FROM survey_views v WHERE v.survey_id = s.id), 0), 1)`

---

## 4. Provisioning of the Official Demo Accounts

`database/init.sql` serves as a clean DDL file responsible solely for table definitions, constraints, and indexes. It contains no legacy demo accounts or sample surveys.

The backend seed script [`backend/src/scripts/seed.js`](file:///c:/_Nero/_University%20Work/Cloud%20Computing/Section%20Eng.%20Naser%20Abdellatif/Student_Feedback_System/backend/src/scripts/seed.js) establishes the two official demo accounts inside a managed transaction:
- **Admin (`admin@example.com` / `admin123` / role: `admin`):**
  Created or recognized with username `admin` and email `admin@example.com`.
- **Student (`student@example.com` / `student123` / role: `student`):**
  Created or recognized with username `student` and email `student@example.com`.

All surveys, questions, responses, and feedback are created dynamically through normal application REST endpoints.
