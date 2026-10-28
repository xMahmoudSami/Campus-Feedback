# Campus Feedback - Backend API

A production-ready Node.js & Express REST API for **Campus Feedback**, providing secure role-based survey management, response submissions, student feedback, database-backed analytics, and non-destructive seed synchronization.

---

## 1. Prerequisites & Runtime Environment

- **Node.js:** Node.js v24 (v24.x LTS) — matching the project Dockerfile (`node:24-alpine`).
- **npm:** v10+ or v11+
- **Database:** PostgreSQL (v14+ recommended; v16 used in Docker Compose)
- **Containerization:** Docker & Docker Compose

---

## 2. Directory Structure

```text
backend/
├── Dockerfile                  # Production Alpine container (node:24-alpine)
├── .dockerignore               # Clean Docker build exclusions
├── .env.example                # Template for environment variables
├── package.json                # Dependencies and npm scripts
├── vitest.config.js            # Vitest testing configuration
├── src/
│   ├── app.js                  # Express application setup & middleware
│   ├── server.js               # HTTP listener on 0.0.0.0 & graceful shutdown
│   ├── config/
│   │   ├── db.js               # PostgreSQL pool & transaction manager (withTransaction)
│   │   └── env.js              # Environment variable parsing & validation
│   ├── controllers/            # HTTP request controllers
│   │   ├── authController.js
│   │   ├── dashboardController.js
│   │   ├── feedbackController.js
│   │   ├── healthController.js
│   │   ├── responseController.js
│   │   └── surveyController.js
│   ├── middleware/             # Interceptors & error handlers
│   │   ├── authMiddleware.js   # JWT verification & role authorization
│   │   ├── errorHandler.js     # Centralized error handler & status codes
│   │   └── validateRequest.js  # Input payload & param validation
│   ├── routes/                 # API route definitions
│   │   ├── authRoutes.js
│   │   ├── dashboardRoutes.js
│   │   ├── feedbackRoutes.js
│   │   ├── healthRoutes.js
│   │   ├── responseRoutes.js
│   │   ├── surveyRoutes.js
│   │   └── index.js
│   ├── scripts/                # Database utilities & seed tools
│   │   ├── seed.js             # Demo account seeder
│   │   ├── exportSeed.js       # Complete database seed exporter
│   │   └── importSeed.js       # Safe multi-developer seed merge importer
│   ├── services/               # Core business & data access services
│   │   ├── authService.js
│   │   ├── dashboardService.js # Analytics, timeseries & KPI calculations
│   │   ├── feedbackService.js
│   │   ├── responseService.js  # Submission processing & deadline validation
│   │   └── surveyService.js    # Survey CRUD & expiration evaluation
│   └── utils/
│       └── dateUtils.js        # Survey expiration & lifecycle utilities
└── tests/                      # Automated Vitest test suite (97 tests)
    ├── auth.test.js
    ├── dashboard.test.js
    ├── demo_accounts.test.js
    ├── errors.test.js
    ├── feedback.test.js
    ├── health.test.js
    ├── responses.test.js
    ├── seed_sync.test.js
    ├── surveys.test.js
    └── helpers/
        └── testUtils.js
```

---

## 3. Key Business Logic Implementations

### 3.1. Survey Expiration Logic
Survey expiration is evaluated and enforced centrally in `backend/src/utils/dateUtils.js`:
- `isSurveyExpired(dueDate, [referenceTime])`:
  - Returns `false` if `dueDate` is not set (indefinite validity).
  - Recognizes date-only values (midnight UTC, e.g., `2026-10-28T00:00:00.000Z`) as extending through the very end of that calendar day (`23:59:59.999 UTC`). On October 29, the October 28 deadline is strictly expired.
  - Recognizes specific timestamps with non-zero time (e.g., `2026-10-28T18:00:00.000Z`) expiring at that exact second.
  - Supports client timezone awareness via the `x-client-time` request header.
- `getEffectiveStatus(status, dueDate, [referenceTime])`:
  - Returns `'closed'` if manually closed by an admin (`closed_at` set).
  - Returns `'expired'` if status is `'published'` and the due date has passed.
  - Returns `'published'` if published and active.
  - Returns `'draft'` if draft.
- **Backend Rejection on Submission:**
  `responseService.submitResponse` checks `isSurveyExpired(survey.due_date)` before accepting answers. If expired, it halts and throws a `400 Bad Request` `ValidationError` without modifying database state.

### 3.2. Dynamic Admin Dashboard & Survey Activity Timeseries
`dashboardService.getAdminDashboard()` computes all metrics dynamically from PostgreSQL records:
- **Last 7 Calendar Days Activity:**
  - Queries `survey_views` (`viewed_at`) and `survey_responses` (`completed_at`).
  - Uses `generate_series` to return an exact 7-day chronological timeseries ending on today's calendar date:
    `activity: { labels: ['Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed'], dates: [...], views: [...], responses: [...] }`.
  - Activity is assigned to the exact weekday it occurred rather than lumped onto Sunday.
- **Month-over-Month KPI Growth:**
  - Compares records created this month (`created_at >= date_trunc('month', NOW())`) against records from the prior month (`date_trunc('month', NOW() - INTERVAL '1 month')`).
  - Returns percentage changes:
    `changes: { surveys_change, students_change, responses_change, completion_change }`.
- **Accurate Registered Student Count:**
  - `overview.students_count`: Derived from `SELECT COUNT(*) FROM users WHERE role = 'student'`, guaranteeing accurate registered student counts rather than feedback entries.

---

## 4. Multi-Developer Seed Export & Merge Workflow

To collaborate across independent PostgreSQL instances without data loss:

```bash
# Export local database records to database/seeds/dev_seed.json
npm run seed:export

# Merge an incoming seed file into local PostgreSQL database
npm run seed:import
# Or specify a custom seed file path:
npm run seed:import -- path/to/teammate_seed.json
```

**Supported Entities:**
- `users` (preserving passwords and roles)
- `surveys` (remapping IDs safely if numeric ID conflicts arise)
- `questions` (maintaining position, options, types, and remapped survey foreign keys)
- `survey_responses` (preserving attempt history and timestamps)
- `answers` (preserving student responses and ratings)
- `feedback` (preserving ratings, comments, and survey associations)
- `survey_views` (preserving audit view logs)

---

## 5. Environment Variables

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | HTTP port | `5000` |
| `NODE_ENV` | Environment mode (`development`, `production`, `test`) | `development` |
| `DB_HOST` | PostgreSQL host (`database` in Docker, `localhost` on host) | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_USER` | PostgreSQL username | `feedback_user` |
| `DB_PASSWORD` | PostgreSQL password | `feedback_password` |
| `DB_NAME` | PostgreSQL database name | `student_feedback_db` |
| `JWT_SECRET` | Secret key for signing JSON Web Tokens | *(configured in .env)* |
| `JWT_EXPIRES_IN` | Token validity duration | `24h` |
| `CORS_ORIGIN` | Allowed cross-origin origins | `*` |

---

## 6. Running Tests

```bash
npm test
```

Executes Vitest covering authentication, authorization, survey expiration, deadline boundaries, response submission transactions, 7-day activity timeseries, and seed sync idempotency (97 tests).
