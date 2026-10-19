const request = require('supertest');
let bcrypt;
try {
  bcrypt = require('bcrypt');
} catch (e) {
  bcrypt = require('bcryptjs');
}

const app = require('../src/app');
const db = require('../src/config/db');
const env = require('../src/config/env');
const { seedDatabase, upsertUser } = require('../src/scripts/seed');

describe('Mandatory Demo Accounts & Seeding Verification', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Demo Accounts Credentials & Roles', () => {
    it('should verify configured default demo credentials match requirements', () => {
      expect(env.seed.adminUsername).toBe('admin');
      expect(env.seed.adminEmail).toBe('admin@example.com');
      expect(env.seed.adminPassword).toBe('admin123');

      expect(env.seed.studentUsername).toBe('student');
      expect(env.seed.studentEmail).toBe('student@example.com');
      expect(env.seed.studentPassword).toBe('student123');
    });

    it('should authenticate Admin via username "admin" and password "admin123"', async () => {
      const adminHash = await bcrypt.hash('admin123', 10);

      vi.spyOn(db, 'query').mockImplementation(async (sql, params) => {
        if (sql.includes('FROM users') && sql.includes('LOWER(username) = LOWER($1)')) {
          expect(params[0].toLowerCase()).toBe('admin');
          return {
            rows: [
              {
                id: 1,
                username: 'admin',
                email: 'admin@example.com',
                password_hash: adminHash,
                role: 'admin',
                full_name: 'System Administrator',
                created_at: new Date().toISOString(),
              },
            ],
          };
        }
        return { rows: [] };
      });

      const res = await request(app).post('/api/auth/login').send({
        identifier: 'admin',
        password: 'admin123',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.role).toBe('admin');
      expect(res.body.data.user.username).toBe('admin');
      expect(res.body.data.user.email).toBe('admin@example.com');
      expect(res.body.data.user.password_hash).toBeUndefined();
    });

    it('should authenticate Admin via email "admin@example.com"', async () => {
      const adminHash = await bcrypt.hash('admin123', 10);

      vi.spyOn(db, 'query').mockImplementation(async (sql, params) => {
        if (sql.includes('FROM users')) {
          return {
            rows: [
              {
                id: 1,
                username: 'admin',
                email: 'admin@example.com',
                password_hash: adminHash,
                role: 'admin',
                full_name: 'System Administrator',
              },
            ],
          };
        }
        return { rows: [] };
      });

      const res = await request(app).post('/api/auth/login').send({
        email: 'admin@example.com',
        password: 'admin123',
      });

      expect(res.status).toBe(200);
      expect(res.body.data.user.role).toBe('admin');
    });

    it('should authenticate Student via username "student" and password "student123"', async () => {
      const studentHash = await bcrypt.hash('student123', 10);

      vi.spyOn(db, 'query').mockImplementation(async (sql, params) => {
        if (sql.includes('FROM users')) {
          return {
            rows: [
              {
                id: 2,
                username: 'student',
                email: 'student@example.com',
                password_hash: studentHash,
                role: 'student',
                full_name: 'Demo Student',
                created_at: new Date().toISOString(),
              },
            ],
          };
        }
        return { rows: [] };
      });

      const res = await request(app).post('/api/auth/login').send({
        identifier: 'student',
        password: 'student123',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.role).toBe('student');
      expect(res.body.data.user.username).toBe('student');
      expect(res.body.data.user.email).toBe('student@example.com');
      expect(res.body.data.user.password_hash).toBeUndefined();
    });

    it('should authenticate Student via email "student@example.com"', async () => {
      const studentHash = await bcrypt.hash('student123', 10);

      vi.spyOn(db, 'query').mockImplementation(async (sql, params) => {
        if (sql.includes('FROM users')) {
          return {
            rows: [
              {
                id: 2,
                username: 'student',
                email: 'student@example.com',
                password_hash: studentHash,
                role: 'student',
                full_name: 'Demo Student',
              },
            ],
          };
        }
        return { rows: [] };
      });

      const res = await request(app).post('/api/auth/login').send({
        email: 'student@example.com',
        password: 'student123',
      });

      expect(res.status).toBe(200);
      expect(res.body.data.user.role).toBe('student');
    });
  });

  describe('Seeding Idempotency & Conflict Handling', () => {
    it('should insert user when user does not exist yet', async () => {
      const fakeClient = {
        query: vi.fn().mockImplementation(async (sql, params) => {
          if (sql.includes('SELECT id, username, email FROM users')) {
            return { rows: [] }; // Not found
          }
          if (sql.includes('INSERT INTO users')) {
            return {
              rows: [
                {
                  id: 1,
                  username: params[0],
                  email: params[1],
                  role: params[3],
                  full_name: params[4],
                },
              ],
            };
          }
          return { rows: [] };
        }),
      };

      const result = await upsertUser(fakeClient, {
        username: 'admin',
        email: 'admin@example.com',
        password: 'admin123',
        role: 'admin',
        fullName: 'System Administrator',
      });

      expect(result.created).toBe(true);
      expect(result.user.username).toBe('admin');
      expect(result.user.email).toBe('admin@example.com');
    });

    it('should safely update user without creating duplicate when rerun (idempotent)', async () => {
      const fakeClient = {
        query: vi.fn().mockImplementation(async (sql, params) => {
          if (sql.includes('SELECT id, username, email FROM users')) {
            return { rows: [{ id: 99, username: 'admin', email: 'admin@example.com' }] }; // Found existing!
          }
          if (sql.includes('UPDATE users')) {
            return {
              rows: [
                {
                  id: 99,
                  username: params[0],
                  email: params[1],
                  role: params[3],
                  full_name: params[4],
                },
              ],
            };
          }
          return { rows: [] };
        }),
      };

      const result = await upsertUser(fakeClient, {
        username: 'admin',
        email: 'admin@example.com',
        password: 'admin123',
        role: 'admin',
        fullName: 'System Administrator',
      });

      expect(result.created).toBe(false);
      expect(result.user.id).toBe(99);
      expect(result.user.username).toBe('admin');
    });

    it('should execute full seedDatabase workflow in a transaction', async () => {
      vi.spyOn(db, 'withTransaction').mockImplementation(async (callback) => {
        const fakeClient = {
          query: vi.fn().mockImplementation(async (sql, params) => {
            if (sql.includes('SELECT id, username, email FROM users')) {
              return { rows: [] };
            }
            if (sql.includes('INSERT INTO users')) {
              return {
                rows: [
                  {
                    id: params[0] === 'admin' ? 1 : 2,
                    username: params[0],
                    email: params[1],
                    role: params[3],
                    full_name: params[4],
                  },
                ],
              };
            }
            if (sql.includes('SELECT COUNT(*)::int AS count FROM surveys')) {
              return { rows: [{ count: 0 }] };
            }
            if (sql.includes('INSERT INTO surveys')) {
              return { rows: [{ id: 10 }] };
            }
            if (sql.includes('INSERT INTO questions')) {
              return { rows: [{ id: 100 }] };
            }
            return { rows: [] };
          }),
        };
        return await callback(fakeClient);
      });

      const seedResult = await seedDatabase();

      expect(seedResult.admin.username).toBe('admin');
      expect(seedResult.admin.email).toBe('admin@example.com');
      expect(seedResult.student.username).toBe('student');
      expect(seedResult.student.email).toBe('student@example.com');
      expect(seedResult.sampleSurveyCreated).toBe(true);
    });
  });
});
