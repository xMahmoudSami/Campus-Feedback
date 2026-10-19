const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/db');
const { generateAdminToken, generateStudentToken } = require('./helpers/testUtils');

describe('Survey Responses & Answers Endpoints', () => {
  const adminToken = generateAdminToken({ id: 1 });
  const studentToken = generateStudentToken({ id: 25 });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/surveys/:id/responses', () => {
    it('should forbid admins from submitting student responses (403)', async () => {
      const res = await request(app)
        .post('/api/surveys/1/responses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ answers: [{ question_id: 1, answer_text: 'Test' }] });

      expect(res.status).toBe(403);
    });

    it('should reject submissions for closed surveys (400)', async () => {
      vi.spyOn(db, 'query').mockResolvedValueOnce({
        rows: [{ id: 1, title: 'Closed Survey', status: 'closed' }],
      });

      const res = await request(app)
        .post('/api/surveys/1/responses')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ answers: [{ question_id: 1, answer_text: 'Late answer' }] });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain("Submissions are only accepted for 'published' surveys");
    });

    it('should reject submissions for draft surveys (400)', async () => {
      vi.spyOn(db, 'query').mockResolvedValueOnce({
        rows: [{ id: 2, title: 'Draft Survey', status: 'draft' }],
      });

      const res = await request(app)
        .post('/api/surveys/2/responses')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ answers: [{ question_id: 1, answer_text: 'Draft answer' }] });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain("Submissions are only accepted for 'published' surveys");
    });

    it('should prevent duplicate completed submissions by the same student (409)', async () => {
      vi.spyOn(db, 'query').mockImplementation(async (sql, params) => {
        if (sql.includes('SELECT id, title, status FROM surveys')) {
          return { rows: [{ id: 1, title: 'Active Survey', status: 'published' }] };
        }
        if (sql.includes('SELECT id FROM survey_responses WHERE survey_id = $1 AND student_id = $2')) {
          // Existing response found!
          return { rows: [{ id: 888 }] };
        }
        return { rows: [] };
      });

      const res = await request(app)
        .post('/api/surveys/1/responses')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ answers: [{ question_id: 10, answer_text: 'Another answer' }] });

      expect(res.status).toBe(409);
      expect(res.body.error.message).toContain('You have already submitted a response for this survey');
    });

    it('should reject submission if a required question is unanswered (400)', async () => {
      vi.spyOn(db, 'query').mockImplementation(async (sql, params) => {
        if (sql.includes('SELECT id, title, status FROM surveys')) {
          return { rows: [{ id: 1, title: 'Active Survey', status: 'published' }] };
        }
        if (sql.includes('SELECT id FROM survey_responses WHERE survey_id = $1 AND student_id = $2')) {
          return { rows: [] };
        }
        if (sql.includes('FROM questions')) {
          return {
            rows: [
              {
                id: 10,
                question_text: 'Mandatory Text Question',
                question_type: 'text',
                options: [],
                is_required: true,
              },
            ],
          };
        }
        return { rows: [] };
      });

      const res = await request(app)
        .post('/api/surveys/1/responses')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          answers: [
            // Empty answer for required text question
            { question_id: 10, answer_text: '   ' },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('requires a non-empty text response');
    });

    it('should reject invalid rating values (e.g. 6 or non-integer) (400)', async () => {
      vi.spyOn(db, 'query').mockImplementation(async (sql, params) => {
        if (sql.includes('SELECT id, title, status FROM surveys')) {
          return { rows: [{ id: 1, title: 'Active Survey', status: 'published' }] };
        }
        if (sql.includes('SELECT id FROM survey_responses WHERE survey_id = $1 AND student_id = $2')) {
          return { rows: [] };
        }
        if (sql.includes('FROM questions')) {
          return {
            rows: [
              {
                id: 11,
                question_text: 'Course Satisfaction',
                question_type: 'rating',
                options: [],
                is_required: true,
              },
            ],
          };
        }
        return { rows: [] };
      });

      const res = await request(app)
        .post('/api/surveys/1/responses')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          answers: [{ question_id: 11, rating_value: 6 }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('rating value between 1 and 5');
    });

    it('should reject single choice selection not in question options (400)', async () => {
      vi.spyOn(db, 'query').mockImplementation(async (sql, params) => {
        if (sql.includes('SELECT id, title, status FROM surveys')) {
          return { rows: [{ id: 1, title: 'Active Survey', status: 'published' }] };
        }
        if (sql.includes('SELECT id FROM survey_responses WHERE survey_id = $1 AND student_id = $2')) {
          return { rows: [] };
        }
        if (sql.includes('FROM questions')) {
          return {
            rows: [
              {
                id: 12,
                question_text: 'Select your preferred lab slot',
                question_type: 'single_choice',
                options: ['Monday 9AM', 'Wednesday 2PM'],
                is_required: true,
              },
            ],
          };
        }
        return { rows: [] };
      });

      const res = await request(app)
        .post('/api/surveys/1/responses')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          answers: [{ question_id: 12, answer_text: 'Friday 8PM' }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain("Invalid option 'Friday 8PM'");
    });

    it('should successfully submit valid answers in a transaction (201)', async () => {
      vi.spyOn(db, 'query').mockImplementation(async (sql, params) => {
        if (sql.includes('SELECT id, title, status FROM surveys')) {
          return { rows: [{ id: 1, title: 'Active Survey', status: 'published' }] };
        }
        if (sql.includes('SELECT id FROM survey_responses WHERE survey_id = $1 AND student_id = $2')) {
          return { rows: [] };
        }
        if (sql.includes('FROM questions')) {
          return {
            rows: [
              {
                id: 10,
                question_text: 'Text Feedback',
                question_type: 'text',
                options: [],
                is_required: false,
              },
              {
                id: 11,
                question_text: 'Course Satisfaction',
                question_type: 'rating',
                options: [],
                is_required: true,
              },
            ],
          };
        }
        return { rows: [] };
      });

      vi.spyOn(db, 'withTransaction').mockImplementation(async (callback) => {
        const fakeClient = {
          query: vi.fn().mockImplementation(async (sql, params) => {
            if (sql.includes('SELECT id FROM survey_responses WHERE survey_id = $1 AND student_id = $2 FOR UPDATE')) {
              return { rows: [] };
            }
            if (sql.includes('INSERT INTO survey_responses')) {
              return {
                rows: [
                  {
                    id: 77,
                    survey_id: 1,
                    student_id: 25,
                    submitted_at: new Date().toISOString(),
                  },
                ],
              };
            }
            if (sql.includes('INSERT INTO answers')) {
              return {
                rows: [
                  {
                    id: 1001,
                    question_id: params[1],
                    answer_text: params[2],
                    rating: params[3],
                  },
                ],
              };
            }
            return { rows: [] };
          }),
        };
        return await callback(fakeClient);
      });

      const res = await request(app)
        .post('/api/surveys/1/responses')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          answers: [
            { question_id: 10, answer_text: 'Great course' },
            { question_id: 11, rating_value: 5 },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(77);
      expect(res.body.data.answers.length).toBe(2);
    });
  });

  describe('GET /api/surveys/:id/responses', () => {
    it('should forbid students from viewing all responses (403)', async () => {
      const res = await request(app)
        .get('/api/surveys/1/responses')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });

    it('should allow admin to view all responses for a survey (200)', async () => {
      vi.spyOn(db, 'query').mockImplementation(async (sql, params) => {
        if (sql.includes('SELECT id, title, status FROM surveys')) {
          return { rows: [{ id: 1, title: 'Active Survey', status: 'published' }] };
        }
        if (sql.includes('FROM survey_responses sr')) {
          return {
            rows: [
              {
                response_id: 77,
                student_id: 25,
                student_username: 'student1',
                submitted_at: new Date().toISOString(),
                answers: [
                  { question_id: 11, question_text: 'Rating', rating_value: 5 },
                ],
              },
            ],
          };
        }
        return { rows: [] };
      });

      const res = await request(app)
        .get('/api/surveys/1/responses')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.total_responses).toBe(1);
    });
  });

  describe('GET /api/responses/mine', () => {
    it('should allow students to view their submitted responses (200)', async () => {
      vi.spyOn(db, 'query').mockResolvedValueOnce({
        rows: [
          {
            response_id: 77,
            survey_id: 1,
            survey_title: 'Active Survey',
            submitted_at: new Date().toISOString(),
            answers: [],
          },
        ],
      });

      const res = await request(app)
        .get('/api/responses/mine')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.responses.length).toBe(1);
    });
  });
});
