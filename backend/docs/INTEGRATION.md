# Integration Guidelines for Team Members

This document outlines the integration instructions and contracts for team members working on:
1. **Database Service** (`database/`)
2. **Container Orchestration** (`compose.yaml`)
3. **Frontend Application** (`frontend/`)

---

## 1. Instructions for the Database Team Member (`database/`)

The database schema source of truth is established in `database/init.sql`.

### Guidance for Database Team:
- The backend queries follow the finalized SQL schema defined in `database/init.sql` and documented in [`backend/docs/DATABASE_COMPATIBILITY.md`](./DATABASE_COMPATIBILITY.md).
- The database team member has full ownership over `database/`.
- **PostgreSQL Configuration Settings**:
  - Default Database Name: `student_feedback_db`
  - Default User: `feedback_user`
  - Default Password: `feedback_password`
  - Default Port: `5432`
- **Initial Demo Accounts**:
  - `database/init.sql` focuses solely on schema creation without hardcoded seed users or sample surveys.
  - The backend provides `npm run seed` to provision or recognize the two official demo accounts (`admin` and `student`) within a managed transaction once PostgreSQL is up.

---

## 2. Instructions for Docker Compose (`compose.yaml`)

The root `compose.yaml` file was previously empty. Below is the recommended multi-service Compose configuration for the team member maintaining container orchestration:

```yaml
services:
  database:
    build:
      context: ./database
    container_name: feedback-database
    restart: unless-stopped
    environment:
      POSTGRES_DB: student_feedback_db
      POSTGRES_USER: feedback_user
      POSTGRES_PASSWORD: feedback_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U feedback_user -d student_feedback_db"]
      interval: 5s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: ./backend
    container_name: feedback-backend
    restart: unless-stopped
    depends_on:
      database:
        condition: service_healthy
    environment:
      PORT: 5000
      NODE_ENV: production
      CORS_ORIGIN: "*"
      DB_HOST: database
      DB_PORT: 5432
      DB_USER: feedback_user
      DB_PASSWORD: feedback_password
      DB_NAME: student_feedback_db
      JWT_SECRET: your_secure_jwt_secret_change_me
    ports:
      - "5000:5000"

  frontend:
    build:
      context: ./frontend
    container_name: feedback-frontend
    restart: unless-stopped
    ports:
      - "8080:80"

volumes:
  postgres_data:
```

---

## 3. Instructions for the Frontend Team Member (`frontend/`)

1. **Base URL**:
   The backend API is served at `http://localhost:5000/api`.

2. **Authentication Flow**:
   - Call `POST /api/auth/login` with `{ identifier, password }`.
   - On success, store `data.token` in `localStorage` or `sessionStorage`.
   - Read `data.user.role`:
     - If `role === 'admin'`, redirect to the Admin Dashboard.
     - If `role === 'student'`, redirect to the Student Dashboard.
   - Include the header `Authorization: Bearer <token>` on all subsequent API calls.

3. **Role Enforcement**:
   - The backend enforces roles strictly on every endpoint.
   - Students attempting admin routes receive `403 Forbidden`.
   - Draft surveys will return `403 Forbidden` if accessed by students.

4. **Error Handling**:
   - Check `response.ok`. If false, read `res.json()`.
   - Display `error.message` to the user.
