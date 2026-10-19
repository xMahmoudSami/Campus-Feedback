# Database – Student Feedback System

PostgreSQL database for the Student Feedback System. The schema and seed data live in `init.sql`, which runs automatically the first time the database container starts with an empty volume.

## ERD

```mermaid
erDiagram
    users ||--o{ surveys : "creates"
    surveys ||--o{ questions : "contains"
    users ||--o{ survey_responses : "starts"
    surveys ||--o{ survey_responses : "receives"
    survey_responses ||--o{ answers : "has"
    questions ||--o{ answers : "answered in"
    users ||--o{ feedback : "sends"
    surveys |o--o{ feedback : "optionally about"
    users ||--o{ survey_views : "makes"
    surveys ||--o{ survey_views : "gets"

    users {
        int id PK
        varchar full_name
        varchar email UK
        varchar username UK
        text password_hash
        varchar role "admin | student"
        timestamptz created_at
    }
    surveys {
        int id PK
        varchar title
        text description
        varchar status "draft | published | closed"
        int created_by FK
        timestamptz created_at
        timestamptz published_at
        timestamptz closed_at
    }
    questions {
        int id PK
        int survey_id FK
        text question_text
        varchar question_type "rating | text | multiple_choice"
        jsonb options
        int position
        boolean is_required
    }
    survey_responses {
        int id PK
        int survey_id FK
        int student_id FK
        varchar status "in_progress | completed"
        timestamptz started_at
        timestamptz completed_at
    }
    answers {
        int id PK
        int response_id FK
        int question_id FK
        text answer_text
        int rating
    }
    feedback {
        int id PK
        int student_id FK
        int survey_id FK "nullable"
        text message
        timestamptz created_at
    }
    survey_views {
        int id PK
        int survey_id FK
        int student_id FK
        timestamptz viewed_at
    }
```

## Tables

| Table | Purpose |
|---|---|
| `users` | Accounts and roles (admin / student) |
| `surveys` | Survey title, description, status and publish/close dates |
| `questions` | Questions, their types and order |
| `survey_responses` | A student's attempt and its completion status |
| `answers` | Answers to each question |
| `feedback` | General comments sent by students |
| `survey_views` | Survey views, used to calculate statistics |

## Notes

- `init.sql` runs only when the volume is empty. After editing it, recreate the volume: `docker compose down -v`.
- Statistics (views, attempts, completion rate) are computed from stored data with queries, not stored.
- Seed accounts are for development only; change their passwords before real use.
