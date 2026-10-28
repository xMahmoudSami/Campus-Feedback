# Campus Feedback

A production-grade, containerized web application for universities and educational institutions where students complete surveys and submit feedback, while administrators design surveys, monitor real-time participation metrics, and review responses.

---

## 1. Project Overview

Campus Feedback provides a complete feedback and survey lifecycle:
- **Administrators** create, publish, and manage surveys, configure questions with deadlines (`due_date`), review student feedback, inspect per-question statistical distributions, and analyze dynamic dashboard metrics.
- **Students** view available surveys, answer questions (ratings, multiple choice, and open text), preview submitted answers in read-only mode, and submit general course feedback.

---

## 2. User Roles & Access Control

- **Admin (`role = 'admin'`):**
  - Full access to admin dashboard, survey designer, lifecycle management (draft, publish, close), survey activity timeseries, and student feedback.
- **Student (`role = 'student'`):**
  - Access to student dashboard, survey completion, submission history, and general feedback submission.
  - Role-based authorization is strictly verified on every backend API endpoint via JSON Web Tokens (JWT). Client-side UI guards complement backend security.

---

## 3. Core Business Logic & Recent Enhancements

### 3.1. Survey Expiration & Lifecycle Rules
- **Due Date Enforcement:** Each survey can have a deadline (`due_date`).
- **Backend-Enforced Expiration:** If a survey's deadline has passed, the backend strictly rejects any new submissions with an actionable `400 Bad Request` error (`"Cannot submit response. This survey has expired past its due date and is no longer accepting submissions."`), even if sent directly to the API.
- **Distinction Between Closed and Expired:**
  - **Closed (`status = 'closed'`):** Manually closed by an administrator at any point in time (`closed_at` recorded).
  - **Expired (`is_expired = true`):** A published survey whose `due_date` has elapsed. The database status remains `'published'` to maintain schema integrity, while the API computes `is_expired: true` and `effective_status: 'expired'`.
- **Preservation of Historical Data:** When a survey expires, all existing completed submissions, answer records, and view logs remain fully preserved and accessible for historical reporting.
- **Safe Timezone & Date-Only Boundaries:** Date-only due dates (e.g., `2026-10-28`) remain valid throughout the entire day of October 28 and expire at the beginning of October 29. Timezone offsets are respected via client-time headers (`x-client-time`) preventing off-by-one errors across global timezones.
- **Frontend Expiration Experience:**
  - Expired surveys show an `Expired` badge.
  - The "Start Survey" action is replaced with a "Preview" button.
  - Form fields are rendered read-only, and an informative warning banner explains that the survey deadline has passed.

### 3.2. Dynamic Survey Activity Chart (Last 7 Days)
- **Zero Mock / Hardcoded Data:** The **Survey Activity** chart on the admin dashboard dynamically queries the database for the last 7 calendar days up to and including today.
- **True Calendar-Day Aggregation:** Activity is grouped by the actual event dates:
  - **Survey Views:** Aggregated from `survey_views.viewed_at`.
  - **Survey Responses:** Aggregated from `survey_responses.completed_at`.
- **Chronological Weekday Display:** Events appear under the exact weekday they occurred (e.g., Wednesday activity appears under `Wed`, not hardcoded onto `Sun`). Days with zero activity display clean zero baselines.

### 3.3. Dynamic KPI Growth & Accurate Student Metrics
- **Month-over-Month KPI Changes:**
  - All 4 dashboard KPI cards calculate dynamic percentage changes comparing the current calendar month to the prior calendar month (`+X% vs. last month` or `-X% vs. last month`).
- **Accurate "Total Students" Metric:**
  - Strictly counts registered student accounts (`SELECT COUNT(*) FROM users WHERE role = 'student'`), completely independent of recent feedback entries or submission counts.

### 3.4. Multi-Developer Database Seed Merging & Synchronization
- Version-controlled seed files support safe multi-developer workflows without requiring a shared online database.
- Developers can export their local database state (`npm run seed:export`) and teammates can merge it into their local database (`npm run seed:import`).
- Merging is safe and non-destructive: IDs are remapped dynamically, foreign keys are preserved across all 7 entities (`users`, `surveys`, `questions`, `survey_responses`, `answers`, `feedback`, `survey_views`), and existing local records are never overwritten.

---

## 4. Technology Stack

- **Frontend:** Plain semantic HTML5, CSS3 (modern responsive dashboard styling), vanilla ES6+ JavaScript. Served via Nginx on Alpine Linux.
- **Backend API:** Node.js v24 (Alpine Linux), Express.js, `pg` connection pool with transaction isolation (`withTransaction`).
- **Database:** PostgreSQL 16 (Alpine Linux) with 3NF relational schema, check constraints, foreign keys with cascade rules, and dedicated indexes.
- **Containerization:** Docker & Docker Compose with isolated internal networking, healthchecks, and persistent volume storage.
- **Testing:** Automated test suite powered by Vitest (97 unit and integration tests).

---

## 5. Docker Architecture

The application comprises three independent microservices defined in `compose.yaml`:

```text
Campus_Feedback/
├── frontend/               # Nginx Alpine web server (port 8080)
│   ├── css/
│   ├── js/
│   ├── admin/
│   ├── student/
│   ├── Dockerfile
│   └── nginx.conf
├── backend/                # Express REST API (port 5000)
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── scripts/
│   │   ├── services/
│   │   └── utils/
│   ├── tests/
│   ├── Dockerfile
│   └── package.json
├── database/               # PostgreSQL 16 server (port 5432)
│   ├── seeds/              # Canonical shared seed data (dev_seed.json)
│   ├── init.sql            # Idempotent DDL schema initialization
│   └── Dockerfile
├── compose.yaml            # Docker Compose multi-service definition
└── README.md
```

### Running with Docker Compose:

```bash
# 1. Start all containers in the background
docker compose up -d

# 2. Verify container health
docker compose ps

# 3. Check logs
docker compose logs -f backend
```

- **Frontend:** [http://localhost:8080](http://localhost:8080)
- **Backend API:** [http://localhost:5000/api](http://localhost:5000/api)
- **Health Checks:** [http://localhost:5000/api/health](http://localhost:5000/api/health) and [http://localhost:5000/api/health/db](http://localhost:5000/api/health/db)

---

## 6. Official Development Demo Credentials

| Role | Username | Email | Password | Access Area |
| :--- | :--- | :--- | :--- | :--- |
| **Admin** | `admin` | `admin@example.com` | `admin123` | Admin Dashboard & Survey Management |
| **Student** | `student` | `student@example.com` | `student123` | Student Dashboard & Surveys |

---

## 7. Automated Testing

To run the automated Vitest test suite:

```bash
npm --prefix backend test
```

All 9 test suites and 97 tests verify authentication, authorization, survey expiration, response validation, 7-day activity metrics, seed merging idempotency, and error handling.
