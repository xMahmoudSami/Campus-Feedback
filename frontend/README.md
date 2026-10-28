# Campus Feedback – Frontend

Modern, responsive web interface for **Campus Feedback**, built with semantic HTML5, modern CSS3, and vanilla ES6+ JavaScript. Served via **nginx:alpine**. Zero dependencies, zero build steps.

---

## 1. Features & User Experience

### 1.1. Authentication & Role-Based Navigation
- Single login screen supporting username or email authentication.
- Automatically routes administrators to `/admin/dashboard.html` and students to `/student/dashboard.html`.
- Protected routes enforce role checks via `frontend/js/auth.js`. Unauthenticated requests redirect to login; unauthorized attempts surface a notification toast.

### 1.2. Survey Expiration & Lifecycle Experience
- **Survey Status Badges:**
  - `Available` (`.badge-published` / green): Published and open for submissions.
  - `Expired` (`.badge-expired` / `.badge-danger` / red): Published survey whose due date has elapsed.
  - `Closed` (`.badge-closed` / red): Manually closed by an administrator.
  - `Completed` (`.badge-completed` / green): Previously completed by the logged-in student.
  - `Draft` (`.badge-draft` / yellow): Visible only to administrators.
- **Student Survey Cards:**
  - Active surveys provide a **Start Survey** button.
  - Expired and closed surveys display an **Expired** / **Closed** badge and provide a read-only **Preview** button instead of "Start Survey".
  - If a student completed an expired survey in the past, it displays both `Expired` and `Completed` badges with a "Preview" button to review their answers.
- **Survey Taking & Read-Only Preview:**
  - When viewing an expired or closed survey, inputs are disabled (`isReadOnly = true`), form submission is blocked, and a warning banner indicates that the survey deadline has passed.
- **Admin Survey Management:**
  - Admins can immediately see whether a published survey is active or expired in the survey table.

### 1.3. Dynamic Survey Activity Chart (Last 7 Days)
- Located on the Admin Dashboard.
- Dynamically displays activity across the last 7 calendar days up to today.
- Dual-column bar display per calendar day:
  - **Views (Blue):** Generated from student visits to published surveys (`survey_views`).
  - **Responses (Purple):** Generated from completed student submissions (`survey_responses`).
- Displays zero activity baselines for inactive days and places activity under the exact weekday it occurred.

### 1.4. Dynamic KPI Growth Cards
- **Total Surveys**, **Total Students**, **Total Responses**, and **Completion Rate** cards calculate live percentage change compared to the previous calendar month.
- Positive change is styled with green accent (`+X% vs. last month`), negative change with red accent (`-X% vs. last month`).
- **Total Students** accurately reflects registered student accounts in the system (`users` where `role = 'student'`), independent of the latest feedback table.

---

## 2. Directory Structure

```text
frontend/
├── index.html              # Role-based landing redirect
├── login.html              # Authentication page
├── signup.html             # Optional registration interface
├── css/
│   └── style.css           # Complete responsive stylesheet & design system
├── js/
│   ├── api.js              # REST API client & response transformers
│   ├── auth.js             # JWT storage, role verification & session guards
│   ├── ui.js               # Badges, toasts, modals, dates, and loaders
│   └── pages/              # Per-page controllers
│       ├── admin-create-survey.js
│       ├── admin-dashboard.js
│       ├── admin-feedback.js
│       ├── admin-responses.js
│       ├── admin-surveys.js
│       ├── login.js
│       ├── student-dashboard.js
│       ├── student-feedback.js
│       ├── student-survey.js
│       └── student-surveys.js
├── admin/                  # Administrator views
│   ├── create-survey.html
│   ├── dashboard.html
│   ├── feedback.html
│   ├── responses.html
│   └── surveys.html
├── student/                # Student views
│   ├── confirmation.html
│   ├── dashboard.html
│   ├── feedback.html
│   ├── survey.html
│   └── surveys.html
├── components/
│   └── sidebar.html        # Reusable navigation sidebar component
├── Dockerfile              # Nginx Alpine container definition
└── nginx.conf              # Reverse proxy configuration (/api/ -> backend)
```

---

## 3. Demo Accounts

| Role | Username / Email | Password | Intended Portal |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin` / `admin@example.com` | `admin123` | `/admin/dashboard.html` |
| **Student** | `student` / `student@example.com` | `student123` | `/student/dashboard.html` |

---

## 4. Local Deployment & Running

### Using Docker Compose (Recommended)

From the project root:

```bash
docker compose up -d frontend
```

Access the interface at [http://localhost:8080](http://localhost:8080).

### Static Server (Standalone)

```bash
npx serve frontend -p 8080
```
