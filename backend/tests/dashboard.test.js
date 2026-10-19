const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/db');
const { generateAdminToken, generateStudentToken } = require('./helpers/testUtils');

describe('Dashboard Endpoints', () => {
  const adminToken = generateAdminToken({ id: 1 });
  const studentToken = generateStudentToken({ id: 50 });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/dashboard/admin', () => {
    it('should forbid students from accessing admin dashboard (403)', async () => {
      const res = await request(app)
        .get('/api/dashboard/admin')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });

    it('should return admin dashboard metrics derived from database queries (200)', async () => {
      vi.spyOn(db, 'query').mockImplementation(async (sql, params) => {
        if (sql.includes('AS total_surveys')) {
          return {
            rows: [
              {
                total_surveys: 5,
                draft_surveys: 1,
                published_surveys: 3,
                closed_surveys: 1,
                total_students: 45,
                total_responses: 30,
                total_feedback: 12,
                total_views: 60,
              },
            ],
          };
        }
        if (sql.includes('FROM surveys s') && sql.includes('view_to_response_rate_percent')) {
          return {
            rows: [
              {
                id: 1,
                title: 'Midterm Feedback',
                status: 'published',
                total_views: 40,
                unique_viewers: 25,
                completed_responses: 20,
                view_to_response_rate_percent: 50.0,
              },
            ],
          };
        }
        return { rows: [] };
      });

      const res = await request(app)
        .get('/api/dashboard/admin')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.overview.surveys.total).toBe(5);
      expect(res.body.data.overview.surveys.published).toBe(3);
      expect(res.body.data.overview.students_count).toBe(45);
      expect(res.body.data.overview.responses_count).toBe(30);
      expect(res.body.data.surveys_metrics.length).toBe(1);
      expect(res.body.data.surveys_metrics[0].view_to_response_rate_percent).toBe(50.0);
      expect(res.body.data.metrics_documentation).toBeDefined();
    });

    it('should handle zero records gracefully and return structured zeroes', async () => {
      vi.spyOn(db, 'query').mockImplementation(async () => ({ rows: [] }));

      const res = await request(app)
        .get('/api/dashboard/admin')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.overview.surveys.total).toBe(0);
      expect(res.body.data.surveys_metrics).toEqual([]);
    });
  });

  describe('GET /api/dashboard/student', () => {
    it('should forbid admins from accessing student dashboard (403)', async () => {
      const res = await request(app)
        .get('/api/dashboard/student')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(403);
    });

    it('should return personalized student dashboard statistics (200)', async () => {
      vi.spyOn(db, 'query').mockImplementation(async (sql, params) => {
        if (sql.includes('FROM surveys s') && sql.includes("s.status = 'published'")) {
          return {
            rows: [
              {
                id: 1,
                title: 'Cloud Midterm',
                description: 'Midterm feedback',
                status: 'published',
                question_count: 3,
                response_id: 101,
                submitted_at: new Date().toISOString(),
                is_completed: true,
              },
              {
                id: 2,
                title: 'Cloud Lab Evaluation',
                description: 'Lab feedback',
                status: 'published',
                question_count: 5,
                response_id: null,
                submitted_at: null,
                is_completed: false,
              },
            ],
          };
        }
        if (sql.includes('FROM feedback WHERE student_id = $1')) {
          return { rows: [{ count: 2 }] };
        }
        return { rows: [] };
      });

      const res = await request(app)
        .get('/api/dashboard/student')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary.available_surveys_count).toBe(2);
      expect(res.body.data.summary.completed_surveys_count).toBe(1);
      expect(res.body.data.summary.pending_surveys_count).toBe(1);
      expect(res.body.data.summary.feedback_submitted_count).toBe(2);
      expect(res.body.data.surveys.length).toBe(2);
    });
  });
});
