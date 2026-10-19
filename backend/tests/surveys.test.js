const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/db');
const { generateAdminToken, generateStudentToken } = require('./helpers/testUtils');

describe('Surveys Endpoints', () => {
  const adminToken = generateAdminToken({ id: 1 });
  const studentToken = generateStudentToken({ id: 10 });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/surveys', () => {
    it('should return 401 if unauthenticated', async () => {
      const res = await request(app).get('/api/surveys');
      expect(res.status).toBe(401);
    });

    it('should return only published surveys for students', async () => {
      vi.spyOn(db, 'query').mockImplementation(async (sql, params) => {
        // Confirm that the query filters by status = 'published'
        expect(sql).toContain("s.status = 'published'");
        return {
          rows: [
            {
              id: 1,
              title: 'Published Survey 1',
              status: 'published',
              question_count: 3,
              response_count: 5,
              has_submitted: false,
            },
          ],
        };
      });

      const res = await request(app)
        .get('/api/surveys')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.surveys.length).toBe(1);
      expect(res.body.data.surveys[0].status).toBe('published');
    });

    it('should allow admins to view all surveys including drafts and closed', async () => {
      vi.spyOn(db, 'query').mockImplementation(async (sql, params) => {
        // Admin query without status filter should not hardcode status = 'published'
        expect(sql).not.toContain("s.status = 'published'");
        return {
          rows: [
            { id: 1, title: 'Draft Survey', status: 'draft' },
            { id: 2, title: 'Published Survey', status: 'published' },
            { id: 3, title: 'Closed Survey', status: 'closed' },
          ],
        };
      });

      const res = await request(app)
        .get('/api/surveys')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.surveys.length).toBe(3);
    });
  });

  describe('GET /api/surveys/:id', () => {
    it('should forbid a student from accessing a draft survey (403)', async () => {
      vi.spyOn(db, 'query').mockResolvedValueOnce({
        rows: [
          {
            id: 2,
            title: 'Internal Admin Draft',
            status: 'draft',
            created_by: 1,
          },
        ],
      });

      const res = await request(app)
        .get('/api/surveys/2')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('Students are not allowed to view draft surveys');
    });

    it('should allow a student to access a published survey and record a view', async () => {
      let viewLogged = false;

      vi.spyOn(db, 'query').mockImplementation(async (sql, params) => {
        if (sql.includes('FROM surveys s')) {
          return {
            rows: [
              {
                id: 1,
                title: 'Active Feedback Survey',
                status: 'published',
                created_by: 1,
              },
            ],
          };
        }
        if (sql.includes('FROM questions')) {
          return {
            rows: [
              {
                id: 101,
                survey_id: 1,
                question_text: 'Rate the lectures',
                question_type: 'rating',
                options: [],
                is_required: true,
              },
            ],
          };
        }
        if (sql.includes('FROM survey_responses')) {
          return { rows: [] };
        }
        if (sql.includes('INSERT INTO survey_views')) {
          viewLogged = true;
          return { rows: [{ id: 999 }] };
        }
        return { rows: [] };
      });

      const res = await request(app)
        .get('/api/surveys/1')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.survey.title).toBe('Active Feedback Survey');
      expect(res.body.data.survey.questions.length).toBe(1);
      expect(viewLogged).toBe(true);
    });

    it('should return 404 for a non-existent survey ID', async () => {
      vi.spyOn(db, 'query').mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get('/api/surveys/999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });

    it('should return 400 for invalid non-integer survey ID', async () => {
      const res = await request(app)
        .get('/api/surveys/not-a-number')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/surveys', () => {
    it('should forbid students from creating surveys (403)', async () => {
      const res = await request(app)
        .post('/api/surveys')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          title: 'Unauthorized Survey',
          questions: [],
        });

      expect(res.status).toBe(403);
    });

    it('should allow admins to create a survey with questions in a transaction', async () => {
      vi.spyOn(db, 'withTransaction').mockImplementation(async (callback) => {
        const fakeClient = {
          query: vi.fn().mockImplementation(async (sql, params) => {
            if (sql.includes('INSERT INTO surveys')) {
              return {
                rows: [
                  {
                    id: 15,
                    title: 'New Cloud Survey',
                    description: 'Description text',
                    status: 'draft',
                    created_by: 1,
                  },
                ],
              };
            }
            if (sql.includes('INSERT INTO questions')) {
              return {
                rows: [
                  {
                    id: 201,
                    survey_id: 15,
                    question_text: params[1],
                    question_type: params[2],
                    options: params[3],
                    is_required: params[4],
                    order_index: params[5],
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
        .post('/api/surveys')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'New Cloud Survey',
          description: 'Description text',
          status: 'draft',
          questions: [
            {
              question_text: 'Rate the lab material',
              question_type: 'rating',
              is_required: true,
              order_index: 0,
            },
            {
              question_text: 'Choose preferred OS',
              question_type: 'single_choice',
              options: ['Linux', 'Windows', 'macOS'],
              is_required: true,
              order_index: 1,
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.survey.id).toBe(15);
      expect(res.body.data.survey.questions.length).toBe(2);
    });

    it('should reject survey creation with invalid question type (400)', async () => {
      const res = await request(app)
        .post('/api/surveys')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Invalid Survey',
          questions: [
            {
              question_text: 'Question with bad type',
              question_type: 'multi_select', // not supported
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain("invalid 'question_type'");
    });

    it('should reject single_choice question with less than 2 options (400)', async () => {
      const res = await request(app)
        .post('/api/surveys')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Invalid Single Choice Survey',
          questions: [
            {
              question_text: 'Choose option',
              question_type: 'single_choice',
              options: ['Only one choice'],
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('at least 2 choices');
    });
  });

  describe('PATCH /api/surveys/:id/status', () => {
    it('should allow admin to update survey status to closed', async () => {
      vi.spyOn(db, 'query').mockImplementation(async (sql, params) => {
        if (sql.includes('SELECT id, status FROM surveys')) {
          return { rows: [{ id: 5, status: 'published' }] };
        }
        if (sql.includes('UPDATE surveys')) {
          return { rows: [{ id: 5, status: 'closed' }] };
        }
        return { rows: [] };
      });

      const res = await request(app)
        .patch('/api/surveys/5/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'closed' });

      expect(res.status).toBe(200);
      expect(res.body.data.survey.status).toBe('closed');
    });

    it('should reject invalid status value (400)', async () => {
      const res = await request(app)
        .patch('/api/surveys/5/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'archived' }); // not one of draft, published, closed

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/surveys/:id', () => {
    it('should forbid students from deleting surveys (403)', async () => {
      const res = await request(app)
        .delete('/api/surveys/5')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });

    it('should allow admin to delete survey and associated records safely (200)', async () => {
      vi.spyOn(db, 'query').mockResolvedValueOnce({
        rows: [{ id: 5, title: 'Survey To Delete' }],
      });

      vi.spyOn(db, 'withTransaction').mockImplementation(async (callback) => {
        const fakeClient = {
          query: vi.fn().mockResolvedValue({ rowCount: 1 }),
        };
        return await callback(fakeClient);
      });

      const res = await request(app)
        .delete('/api/surveys/5')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(5);
    });
  });
});
