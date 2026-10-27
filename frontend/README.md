# Student Feedback System – Frontend

Plain HTML / CSS / vanilla JS frontend for a Student Feedback System with **Admin** and **Student** roles. Served by **nginx:alpine**. No frameworks, no build step.

## Features

- **Login** – single page; redirects by role
- **Admin**
  - Dashboard (stats, recent surveys, latest feedback, activity chart)
  - Surveys table (View responses / Edit / Publish / Close / Delete with confirm)
  - Create / Edit survey with dynamic questions (text, multiple choice, rating)
  - Survey responses + per-question statistics
  - All student feedback
- **Student**
  - Dashboard (available surveys, recent responses)
  - Browse & start published surveys
  - Answer questions (text / MC / rating 1–5) with validation
  - Confirmation page after submit
  - Send general feedback + list own feedback & responses
- Modern indigo dashboard UI, responsive sidebar, badges, toasts, loading & empty states
- Role guards, Bearer token auth, 401 → login, 403 → toast

## Demo credentials (mock mode)

| Role    | Email                 | Password   |
|---------|-----------------------|------------|
| Admin   | admin@example.com     | admin123   |
| Student | student@example.com   | student123 |

## Quick start (static)

Open `login.html` in a browser, or serve the folder:

```bash
npx serve .
# or
python -m http.server 8080
```

By default `USE_MOCK = true` in `js/api.js` – no backend needed.

## Docker

```bash
docker build -t sfs-frontend .
docker run -p 8080:80 sfs-frontend
```

Open http://localhost:8080

### With backend (docker-compose example)

```yaml
services:
  frontend:
    build: ./student-feedback-frontend
    ports:
      - "8080:80"
    depends_on:
      - backend
  backend:
    # your Express image
    image: sfs-backend
    ports:
      - "5000:5000"
```

nginx proxies `/api/` → `http://backend:5000/api/`.

## Connect to real API

1. In `js/api.js` set:
   ```js
   const USE_MOCK = false;
   const API_BASE_URL = '/api';   // or 'http://localhost:5000/api'
   ```
2. Ensure CORS / same-origin via the nginx proxy when using Docker.

## Project structure

```
├── index.html              # Redirect by auth
├── login.html
├── css/style.css
├── js/
│   ├── api.js              # Only file that knows URLs & shapes; mock data
│   ├── auth.js             # JWT + role, guards, logout
│   ├── ui.js               # Toasts, loading, empty, modal, badges
│   └── pages/
│       ├── login.js
│       ├── admin-dashboard.js
│       ├── admin-surveys.js
│       ├── admin-create-survey.js
│       ├── admin-responses.js
│       ├── admin-feedback.js
│       ├── student-dashboard.js
│       ├── student-surveys.js
│       ├── student-survey.js
│       └── student-feedback.js
├── admin/
│   ├── dashboard.html
│   ├── surveys.html
│   ├── create-survey.html
│   ├── responses.html
│   └── feedback.html
├── student/
│   ├── dashboard.html
│   ├── surveys.html
│   ├── survey.html
│   ├── confirmation.html
│   └── feedback.html
├── Dockerfile
├── nginx.conf
└── README.md
```

## API endpoints expected

| Method | Path | Notes |
|--------|------|-------|
| POST | /auth/login | `{ email, password }` → `{ token, user }` |
| GET | /auth/me | Current user |
| POST | /auth/logout | |
| GET | /dashboard/admin | Stats, recent surveys, feedback |
| GET | /dashboard/student | Stats, available surveys, responses |
| GET | /surveys | List |
| GET | /surveys/:id | Detail + questions |
| POST | /surveys | Create |
| PATCH | /surveys/:id | Update |
| PATCH | /surveys/:id/status | `{ status }` |
| DELETE | /surveys/:id | |
| POST | /surveys/:id/responses | `{ answers: [{ questionId, value }] }` |
| GET | /surveys/:id/responses | Responses + statistics |
| GET | /responses/mine | Student's responses |
| POST | /feedback | `{ message, rating? }` |
| GET | /feedback | All feedback |
| GET | /health | |
| GET | /health/db | |

All protected routes require `Authorization: Bearer <token>`.

## Notes

- User-supplied data is always set via `textContent` (never `innerHTML`).
- Stats cards are populated only from dashboard endpoints.
- Mock data mirrors the design shown in the reference mockups.
