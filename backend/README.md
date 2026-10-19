# Student Feedback System - Backend API

A robust, production-ready Node.js & Express REST API for the **Student Feedback System**, providing role-based survey management, response submissions, student feedback, and database-backed analytics.

---

## 1. Prerequisites & Runtime Environment

- **Node.js:** Node.js v24 (v24.x LTS) — matching the project Dockerfile (`node:24-alpine`).
- **npm:** v10+ or v11+
- **Database:** PostgreSQL (v14+ recommended)

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
│   │   ├── db.js               # PostgreSQL pool & transaction manager
│   │   └── env.js              # Environment variable parsing & defaults
│   ├── controllers/            # Request handlers
│   │   ├── authController.js
│   │   ├── dashboardController.js
│   │   ├── feedbackController.js
│   │   ├── healthController.js
│   │   ├── responseController.js
│   │   └── surveyController.js
│   ├── middleware/             # Interceptors & validation
│   │   ├── authMiddleware.js   # JWT verification & role authorization
│   │   ├── errorHandler.js     # Centralized error handler & status codes
│   │   └── validateRequest.js  # Input payload & param validation
│   ├── routes/                 # API endpoint definitions
│   │   ├── authRoutes.js
│   │   ├── dashboardRoutes.js
│   │   ├── feedbackRoutes.js
│   │   ├── healthRoutes.js
│   │   ├── responseRoutes.js
│   │   ├── surveyRoutes.js
│   │   └── index.js
│   ├── scripts/
│   │   └── seed.js             # Idempotent demo account & survey seeder
│   └── services/               # Core business & data access logic
│       ├── authService.js
│       ├── dashboardService.js
│       ├── feedbackService.js
│       ├── responseService.js
│       └── surveyService.js
├── tests/                      # Automated test suites (61 tests)
│   ├── auth.test.js
│   ├── dashboard.test.js
│   ├── demo_accounts.test.js
│   ├── errors.test.js
│   ├── feedback.test.js
│   ├── health.test.js
│   ├── responses.test.js
│   ├── surveys.test.js
│   └── helpers/
│       └── testUtils.js
└── docs/                       # Specifications & Integration Contracts
    ├── API.md                  # Comprehensive endpoint specifications
    ├── DATABASE_COMPATIBILITY.md # Database schema audit & column mappings
    ├── INTEGRATION.md          # Multi-container & Compose guidelines
    └── SCHEMA_CONTRACT.md      # Conceptual schema rules & assumptions
```

---

## 3. Dependency Installation

From within the `backend/` directory:

```bash
npm install
```

---

## 4. Environment Variables Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

### Key Configuration Variables:

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | Listening HTTP port | `5000` |
| `NODE_ENV` | Environment (`development` or `production`) | `development` |
| `DB_HOST` | PostgreSQL Host (`database` in Docker Compose; `localhost` on host) | `database` (prod) / `localhost` (dev) |
| `DB_PORT` | PostgreSQL Port | `5432` |
| `DB_USER` | PostgreSQL Username | `feedback_user` |
| `DB_PASSWORD`| PostgreSQL Password | `feedback_password` |
| `DB_NAME` | PostgreSQL Database name | `student_feedback_db` |
| `JWT_SECRET` | Secret key used to sign and verify JWT tokens | *(configured in .env)* |
| `JWT_EXPIRES_IN` | Token validity duration | `24h` |
| `CORS_ORIGIN`| Allowed origins (comma-separated or `*`) | `*` |

---

## 5. Official Demo Accounts & Seeding Strategy

The application does **not** expose a public registration endpoint. All user accounts are pre-created.

### Separation of Responsibilities:
- **Database (`database/init.sql`):** Purely responsible for initializing the database schema, table definitions, foreign-key constraints, and indexes. It contains no legacy demo users or hardcoded sample application data.
- **Backend (`src/scripts/seed.js`):** Responsible for creating or recognizing the two official demo accounts inside a managed database transaction.
- **Application Logic:** Surveys, questions, responses, and feedback are created through normal application workflows (e.g. Admin REST endpoints).

### Official Coursework Demo Credentials:
- **Administrator:**
  - **Email:** `admin@example.com`
  - **Username:** `admin`
  - **Password:** `admin123`
  - **Role:** `admin`
- **Student:**
  - **Email:** `student@example.com`
  - **Username:** `student`
  - **Password:** `student123`
  - **Role:** `student`

> [!WARNING]
> **Production Safety:** Known demo credentials are provided strictly for local development, grading, and demonstration. They must **never** be provisioned in production environments.

### How to Run Seeding:
To provision or safely recognize the demo accounts, run from within `backend/`:

```bash
# Seed or recognize official demo accounts
npm run seed
```

> **Idempotency & Safety:** The seeding script [`src/scripts/seed.js`](./src/scripts/seed.js) runs inside a database transaction (`withTransaction`). If an account already exists with matching credentials, it is recognized without resetting passwords or overwriting data. If a username or email conflicts with an unexpected existing account, the script halts with a clear, actionable error.

---

## 6. Local Backend Startup

```bash
# Start in production mode
npm start

# Start in development mode (with hot reloading via nodemon)
npm run dev
```

The application binds to `0.0.0.0` on the configured `PORT` (default `5000`):
- **HTTP Liveness:** `GET http://localhost:5000/api/health`
- **Database Readiness:** `GET http://localhost:5000/api/health/db`

---

## 7. Running Automated Tests

The test suite runs with **Vitest** and **Supertest**. Tests run completely offline with test doubles and mocks, without requiring a live PostgreSQL instance:

```bash
# Run all 61 automated tests
npm test

# Run tests in watch mode
npm run test:watch
```

---

## 8. API Documentation & Integration Contracts

Comprehensive documentation is available inside [`backend/docs/`](./docs/):
- **Endpoint Reference & Examples:** [`docs/API.md`](./docs/API.md)
- **Database Schema (Source of Truth):** `database/init.sql`
- **Database Compatibility Status:** [`docs/DATABASE_COMPATIBILITY.md`](./docs/DATABASE_COMPATIBILITY.md)
- **Multi-Container Integration Guidance:** [`docs/INTEGRATION.md`](./docs/INTEGRATION.md)

---

## 9. Database & Multi-Container Integration Status

1. **Database Schema Integration:** Completed. The backend has been comprehensively audited and aligned with `database/init.sql` (all column names, types, foreign keys, and constraints match).
2. **Demo Accounts:** Admin (`admin@example.com` / `admin123`) and Student (`student@example.com` / `student123`) are provisioned via idempotent backend seeding (`npm run seed`) and authenticated against real bcrypt hashes.
3. **Container Orchestration Handover:** The containerization team member can run `compose.yaml` with service name `database` on the shared bridge network to match `DB_HOST=database`.
