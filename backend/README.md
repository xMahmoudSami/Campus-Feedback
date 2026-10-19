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
    ├── DATABASE_COMPATIBILITY.md # Database audit & pending schema items
    ├── INTEGRATION.md          # Multi-container & Compose guidelines
    ├── SCHEMA_CONTRACT.md      # Conceptual schema rules & assumptions
    └── schema.sql              # Proposed DDL schema definition
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

## 5. Mandatory Demo Accounts & Seeding

The application does **not** expose a public registration endpoint. All accounts are pre-created.

### Agreed Coursework Demo Credentials:
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

### How to Seed Accounts:
To initialize or update the demo accounts and seed sample surveys into the database, run from within `backend/`:

```bash
# Seed users and sample surveys into existing database
npm run seed

# Or initialize schema tables and seed accounts
npm run seed -- --init-schema
```

> **Idempotency:** The seeding script [`src/scripts/seed.js`](./src/scripts/seed.js) uses transactional `upsertUser` queries. Rerunning `npm run seed` multiple times is safe and will update existing records without creating duplicates or failing unique constraints.

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
- **Database Schema Definition:** [`docs/schema.sql`](./docs/schema.sql)
- **Database Compatibility Status:** [`docs/DATABASE_COMPATIBILITY.md`](./docs/DATABASE_COMPATIBILITY.md)
- **Multi-Container Integration Guidance:** [`docs/INTEGRATION.md`](./docs/INTEGRATION.md)

---

## 9. Remaining Database & Docker Compose Integration Requirements

1. **Database Schema:** The database team member is preparing `database/init.sql`. They should verify column names against [`docs/DATABASE_COMPATIBILITY.md`](./docs/DATABASE_COMPATIBILITY.md).
2. **Container Orchestration:** The containerization team member will populate `compose.yaml`, configuring the database container with service name `database` on network bridge to match `DB_HOST=database`.
