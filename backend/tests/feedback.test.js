const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/db');
const { generateAdminToken, generateStudentToken } = require('./helpers/testUtils');

describe('Feedback Endpoints', () => {
  const adminToken = generateAdminToken({ id: 1 });
  const studentToken = generateStudentToken({ id: 30 });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/feedback', () => {
    it('should forbid admins from submitting student feedback (403)', async () => {
      const res = await request(app)
        .post('/api/feedback')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ message: 'Admin feedback' });

      expect(res.status).toBe(403);
    });

    it('should allow student to submit feedback with valid message (201)', async () => {
      vi.spyOn(db, 'query').mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            student_id: 30,
            title: 'Lab Air Conditioning',
            message: 'The lab was too cold during Tuesday practical session.',
            category: 'facilities',
            created_at: new Date().toISOString(),
          },
        ],
      });

      const res = await request(app)
        .post('/api/feedback')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          title: 'Lab Air Conditioning',
          message: 'The lab was too cold during Tuesday practical session.',
          category: 'facilities',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.feedback.id).toBe(1);
      expect(res.body.data.feedback.category).toBe('facilities');
    });

    it('should reject feedback submission with empty message (400)', async () => {
      const res = await request(app)
        .post('/api/feedback')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          title: 'Empty feedback',
          message: '   ',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain("Field 'message' is required");
    });
  });

  describe('GET /api/feedback', () => {
    it('should forbid students from reading all feedback (403)', async () => {
      const res = await request(app)
        .get('/api/feedback')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });

    it('should allow admins to view all feedback entries (200)', async () => {
      vi.spyOn(db, 'query').mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            title: 'Great course',
            message: 'Really enjoyed the Docker hands-on lab.',
            category: 'course',
            student_username: 'student1',
            created_at: new Date().toISOString(),
          },
        ],
      });

      const res = await request(app)
        .get('/api/feedback')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.feedback.length).toBe(1);
    });
  });
});
