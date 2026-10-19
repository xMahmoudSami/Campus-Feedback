# Student Feedback System - API Specification

Base URL: `http://localhost:5000/api`

---

## 1. Authentication & Security

All protected endpoints require an HTTP `Authorization` header containing a valid JSON Web Token (JWT):

```http
Authorization: Bearer <jwt_token>
```

### Roles & Access Control
- **`admin`**: Full access to survey management, administrative dashboards, and feedback inspection.
- **`student`**: Access to published surveys, submitting responses, viewing submitted personal responses, submitting feedback, and student dashboard.

---

## 2. Standard Responses & Error Format

### Success Response
```json
{
  "success": true,
  "message": "Optional descriptive message",
  "data": { ... }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "message": "Human-readable error description",
    "details": null
  }
}
```

### Common HTTP Status Codes
| Code | Meaning | Description |
| :--- | :--- | :--- |
| `200` | OK | Request succeeded |
| `201` | Created | New resource created |
| `400` | Bad Request | Validation error or invalid payload format |
| `401` | Unauthorized | Missing, invalid, or expired JWT token, or incorrect login credentials |
| `403` | Forbidden | Authenticated user lacks the required role |
| `404` | Not Found | Resource does not exist |
| `409` | Conflict | Duplicate submission or uniqueness constraint violation |
| `500` | Server Error | Unexpected internal server error (masked in production) |
| `503` | Service Unavailable | Downstream dependency (e.g. PostgreSQL) is unreachable |

---

## 3. Endpoints Reference

### 3.1 Health

#### `GET /health`
Liveness check for the Express HTTP service.
- **Access:** Public
- **Response `200 OK`:**
```json
{
  "status": "ok",
  "service": "student-feedback-backend",
  "timestamp": "2026-10-19T18:00:00.000Z",
  "uptime_seconds": 124
}
```

#### `GET /health/db`
Readiness check testing real PostgreSQL connectivity.
- **Access:** Public
- **Response `200 OK` (Healthy):**
```json
{
  "status": "ok",
  "database": "connected",
  "latency_ms": 4,
  "timestamp": "2026-10-19T18:00:00.000Z"
}
```
- **Response `503 Service Unavailable` (Disconnected):**
```json
{
  "status": "error",
  "database": "disconnected",
  "message": "Database connection failed or database is not reachable.",
  "timestamp": "2026-10-19T18:00:00.000Z"
}
```

---

### 3.2 Authentication

#### `POST /auth/login`
Authenticates a user using pre-created credentials.
- **Access:** Public
- **Request Body:**
```json
{
  "identifier": "student",
  "password": "student123"
}
```
*(Alternatively, `email` or `username` can be supplied instead of `identifier`)*
- **Response `200 OK`:**
```json
{
  "success": true,
  "message": "Login successful.",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsIn...",
    "user": {
      "id": 2,
      "username": "student",
      "email": "student@example.com",
      "role": "student",
      "full_name": "Demo Student",
      "created_at": "2026-10-19T17:00:00.000Z"
    }
  }
}
```

#### `GET /auth/me`
Retrieves the safe profile of the currently authenticated user.
- **Access:** Authenticated (`admin` or `student`)
- **Headers:** `Authorization: Bearer <token>`
- **Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 2,
      "username": "student",
      "email": "student@example.com",
      "role": "student",
      "full_name": "Demo Student",
      "created_at": "2026-10-19T17:00:00.000Z"
    }
  }
}
```

#### `POST /auth/logout`
Documents stateless logout semantics. The client application must discard the token from client-side storage.
- **Access:** Public / Authenticated
- **Response `200 OK`:**
```json
{
  "success": true,
  "message": "Logged out successfully. Please remove the authentication token from client storage.",
  "semantics": "Stateless JWT logout: token discarded client-side."
}
```

---

### 3.3 Surveys

#### `GET /surveys`
Returns survey listing:
- Students receive only `published` surveys.
- Admins receive all surveys (or filtered by `?status=draft|published|closed`).
- **Access:** Authenticated
- **Response `200 OK`:**
```json
{
  "success": true,
  "count": 1,
  "data": {
    "surveys": [
      {
        "id": 1,
        "title": "Cloud Computing Mid-Term Feedback",
        "description": "Please share your constructive feedback.",
        "status": "published",
        "created_by": 1,
        "created_at": "2026-10-19T17:10:00.000Z",
        "updated_at": "2026-10-19T17:10:00.000Z",
        "creator_username": "admin",
        "question_count": 3,
        "response_count": 14,
        "view_count": 35,
        "has_submitted": false
      }
    ]
  }
}
```

#### `GET /surveys/:id`
Retrieves survey metadata and all configured questions.
- If accessed by a student, records a view in `survey_views`.
- If survey is in `draft` status, students receive `403 Forbidden`.
- **Access:** Authenticated
- **Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "survey": {
      "id": 1,
      "title": "Cloud Computing Mid-Term Feedback",
      "description": "Please share your feedback.",
      "status": "published",
      "created_by": 1,
      "creator_username": "admin",
      "has_submitted": false,
      "questions": [
        {
          "id": 10,
          "survey_id": 1,
          "question_text": "How would you rate the overall lab exercises? (1-5)",
          "question_type": "rating",
          "options": [],
          "is_required": true,
          "order_index": 1
        },
        {
          "id": 11,
          "survey_id": 1,
          "question_text": "Which topic did you find most engaging?",
          "question_type": "single_choice",
          "options": ["Docker Containers", "Microservices", "Kubernetes"],
          "is_required": true,
          "order_index": 2
        },
        {
          "id": 12,
          "survey_id": 1,
          "question_text": "Any suggestions for improvement?",
          "question_type": "text",
          "options": [],
          "is_required": false,
          "order_index": 3
        }
      ]
    }
  }
}
```

#### `POST /surveys`
Creates a new survey and associated questions in an atomic database transaction.
- **Access:** `admin` only
- **Request Body:**
```json
{
  "title": "Database Systems Course Survey",
  "description": "Evaluation of lectures and SQL assignments.",
  "status": "draft",
  "questions": [
    {
      "question_text": "Rate the SQL assignments difficulty (1-5)",
      "question_type": "rating",
      "is_required": true,
      "order_index": 1
    },
    {
      "question_text": "Which DBMS did you prefer?",
      "question_type": "single_choice",
      "options": ["PostgreSQL", "MySQL", "Oracle"],
      "is_required": true,
      "order_index": 2
    },
    {
      "question_text": "General suggestions",
      "question_type": "text",
      "is_required": false,
      "order_index": 3
    }
  ]
}
```
- **Response `201 Created`**

#### `PATCH /surveys/:id`
Updates survey metadata (title, description).
- **Access:** `admin` only
- **Response `200 OK`**

#### `PATCH /surveys/:id/status`
Updates survey lifecycle status. Closing a survey immediately halts student submissions.
- **Access:** `admin` only
- **Request Body:**
```json
{
  "status": "closed"
}
```
- **Response `200 OK`**

#### `DELETE /surveys/:id`
Deletes a survey along with its child records (questions, views, responses, answers) safely in a transaction.
- **Access:** `admin` only
- **Response `200 OK`**

---

### 3.4 Responses & Answers

#### `POST /surveys/:id/responses`
Submits a student's completed response for a published survey.
- Validates each answer against question types, allowed choices, and required constraints.
- Transactional insert: if any answer fails, entire submission is rolled back.
- Prevents duplicate submissions per student.
- **Access:** `student` only
- **Request Body:**
```json
{
  "answers": [
    { "question_id": 10, "rating_value": 5 },
    { "question_id": 11, "answer_text": "Docker Containers" },
    { "question_id": 12, "answer_text": "More hands-on examples would be great." }
  ]
}
```
- **Response `201 Created`:**
```json
{
  "success": true,
  "message": "Survey response submitted successfully.",
  "data": {
    "id": 101,
    "survey_id": 1,
    "student_id": 2,
    "submitted_at": "2026-10-19T18:15:00.000Z",
    "survey_title": "Cloud Computing Mid-Term Feedback",
    "answers": [
      { "id": 501, "question_id": 10, "answer_text": "5", "rating_value": 5 },
      { "id": 502, "question_id": 11, "answer_text": "Docker Containers", "rating_value": null },
      { "id": 503, "question_id": 12, "answer_text": "More hands-on examples would be great.", "rating_value": null }
    ]
  }
}
```
- **Response `409 Conflict` (Duplicate Submission):**
```json
{
  "success": false,
  "error": {
    "message": "You have already submitted a response for this survey."
  }
}
```

#### `GET /surveys/:id/responses`
Retrieves all student submissions and answers for a survey.
- **Access:** `admin` only
- **Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "survey": { "id": 1, "title": "Cloud Computing Mid-Term Feedback", "status": "published" },
    "total_responses": 1,
    "responses": [
      {
        "response_id": 101,
        "submitted_at": "2026-10-19T18:15:00.000Z",
        "student_id": 2,
        "student_username": "student1",
        "student_email": "student1@university.edu",
        "student_full_name": "Demo Student",
        "answers": [
          { "question_id": 10, "question_text": "Rate the lab...", "answer_text": "5", "rating_value": 5 }
        ]
      }
    ]
  }
}
```

#### `GET /responses/mine`
Retrieves all surveys and answers submitted by the logged-in student.
- **Access:** `student` only
- **Response `200 OK`**

---

### 3.5 Feedback

#### `POST /feedback`
Submits feedback regarding a course, facility, or general topic.
- **Access:** `student` only
- **Request Body:**
```json
{
  "title": "Lab Workstations",
  "category": "facilities",
  "message": "Workstations in Lab 3 need Docker Desktop updated."
}
```
- **Response `201 Created`**

#### `GET /feedback`
Retrieves all feedback entries submitted across the system.
- **Access:** `admin` only
- **Response `200 OK`**

---

### 3.6 Dashboards

#### `GET /dashboard/admin`
Computes administrator metrics derived strictly from database records.
- **Access:** `admin` only
- **Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "overview": {
      "surveys": {
        "total": 3,
        "draft": 1,
        "published": 1,
        "closed": 1
      },
      "students_count": 50,
      "responses_count": 38,
      "feedback_count": 14,
      "views_count": 80
    },
    "surveys_metrics": [
      {
        "id": 1,
        "title": "Cloud Computing Mid-Term Feedback",
        "status": "published",
        "total_views": 80,
        "unique_viewers": 45,
        "completed_responses": 38,
        "view_to_response_rate_percent": 47.5
      }
    ],
    "recent_activity": {
      "recent_responses": [ ... ],
      "recent_feedback": [ ... ]
    },
    "metrics_documentation": {
      "view_to_response_rate": "Calculated as (completed_responses / total_views) * 100. Measures view conversion rate, not university-wide student enrollment participation."
    }
  }
}
```

#### `GET /dashboard/student`
Returns personalized metrics for the authenticated student.
- **Access:** `student` only
- **Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "available_surveys_count": 2,
      "completed_surveys_count": 1,
      "pending_surveys_count": 1,
      "feedback_submitted_count": 3
    },
    "surveys": [
      {
        "id": 1,
        "title": "Cloud Computing Mid-Term Feedback",
        "question_count": 3,
        "is_completed": true,
        "submitted_at": "2026-10-19T18:15:00.000Z"
      },
      {
        "id": 2,
        "title": "Operating Systems Survey",
        "question_count": 4,
        "is_completed": false,
        "submitted_at": null
      }
    ]
  }
}
```
