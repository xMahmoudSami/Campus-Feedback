# Student Feedback System

## 1. Project Overview

A simple web application where students can view and complete published surveys, while an administrator can create and manage surveys and review submitted feedback.

## 2. User Roles

- **Admin:** Accesses the admin dashboard, creates and manages surveys, views feedback, and reviews survey statistics.
- **Student:** Accesses the student dashboard, views available surveys, completes surveys, and submits responses.

User accounts are pre-created. There is no public registration page.

## 3. Core Features

### Authentication

- A single login page using email/username and password.
- Users are redirected to the appropriate dashboard based on their role.
- The backend enforces role-based access; hiding UI elements alone is not sufficient.

### Student

- View a simple dashboard summary.
- Browse published surveys.
- Open and complete a survey.
- Submit responses and view confirmation.
- Access the feedback section.

### Admin

- View survey statistics, such as views, responses, and completion rate, when supported by recorded data.
- Create and publish surveys.
- View and manage existing surveys.
- View submitted feedback and responses.
- Close a survey so students can no longer submit responses.

## 4. Application Behaviour

- Surveys and responses are stored in the database.
- After an admin publishes a survey, students can see it when they open or refresh the surveys page.
- Real-time updates are not required.
- Statistics should be calculated from actual stored data rather than hardcoded sample values.

## 5. Technology Stack

- **Frontend:** HTML, CSS, and JavaScript.
- **Backend:** Node.js and Express.
- **Database:** PostgreSQL.
- **Containerization:** Docker and Docker Compose.

## 6. Docker Architecture

The application contains three separate services, each with its own image and container:

1. **Frontend:** Serves the web interface.
2. **Backend:** Provides the API, authentication, authorization, and application logic.
3. **Database:** Runs PostgreSQL and stores users, surveys, questions, and responses.

A Docker Volume is attached to PostgreSQL to persist database data when the database container is recreated.

The repository structure is:

```text
student-feedback-system/
├── frontend/
│   ├── Dockerfile
│   └── .dockerignore
├── backend/
│   ├── Dockerfile
│   └── .dockerignore
├── database/
│   ├── Dockerfile
│   ├── .dockerignore
│   └── init.sql
├── compose.yaml
├── .gitignore
└── README.md
```

The database image can be built from the official PostgreSQL image, with `init.sql` used for initial database setup if needed.

## 7. Scope Limitations

- No public registration or password-reset workflow.
- No email verification.
- No real-time updates or notifications.
- No complex user roles.
- No external university-system integration.

## 8. Main Project Goal

The primary goal is to build a small, functional web application and practise Dockerfiles, Docker images, containers, Docker Compose networking, environment variables, and persistent database volumes.
