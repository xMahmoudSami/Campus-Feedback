const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/db');

describe('Health Endpoints', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/health', () => {
    it('should return 200 and report HTTP service as ok', async () => {
      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('student-feedback-backend');
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe('GET /api/health/db', () => {
    it('should return 200 when database connectivity check succeeds', async () => {
      vi.spyOn(db, 'testConnection').mockResolvedValueOnce({
        ok: true,
        latencyMs: 12,
      });

      const res = await request(app).get('/api/health/db');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.database).toBe('connected');
      expect(res.body.latency_ms).toBe(12);
    });

    it('should return 503 when database connectivity check fails', async () => {
      vi.spyOn(db, 'testConnection').mockResolvedValueOnce({
        ok: false,
        error: 'ECONNREFUSED 127.0.0.1:5432',
      });

      const res = await request(app).get('/api/health/db');

      expect(res.status).toBe(503);
      expect(res.body.status).toBe('error');
      expect(res.body.database).toBe('disconnected');
      expect(res.body.message).toContain('Database connection failed');
    });
  });
});
