const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/db');
const env = require('../src/config/env');
const { generateAdminToken } = require('./helpers/testUtils');

describe('Centralized Error Handling & Security', () => {
  const adminToken = generateAdminToken({ id: 1 });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should return 404 for undefined routes with consistent JSON format', async () => {
    const res = await request(app).get('/api/undefined-endpoint-path');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('Endpoint not found');
  });

  it('should map Postgres 23505 unique constraint violation to 409 ConflictError', async () => {
    vi.spyOn(db, 'query').mockRejectedValueOnce({
      code: '23505',
      message: 'duplicate key value violates unique constraint',
    });

    const res = await request(app)
      .get('/api/surveys')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('already exists');
  });

  it('should map Postgres 23503 foreign key violation to 400 ValidationError', async () => {
    vi.spyOn(db, 'query').mockRejectedValueOnce({
      code: '23503',
      message: 'violates foreign key constraint',
    });

    const res = await request(app)
      .get('/api/surveys')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('Referenced record does not exist');
  });

  it('should mask internal errors and never leak SQL internals or credentials in production', async () => {
    const originalEnv = env.isProduction;
    env.isProduction = true;

    try {
      vi.spyOn(db, 'query').mockRejectedValueOnce(
        new Error('FATAL: password authentication failed for user "postgres"')
      );

      const res = await request(app)
        .get('/api/surveys')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      // In production, internal error details must be masked
      expect(res.body.error.message).toBe('An unexpected server error occurred.');
      expect(res.body.error.stack).toBeUndefined();
    } finally {
      env.isProduction = originalEnv;
    }
  });
});
