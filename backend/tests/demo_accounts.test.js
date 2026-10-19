const fs = require('fs');
const path = require('path');
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
const {
  seedDatabase,
  ensureDemoUser,
  ensureAdminUser,
  ensureStudentUser,
} = require('../src/scripts/seed');

describe('Official Demo Accounts & Consolidated Seeding Verification', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Demo Account Credentials, Hashing & Authentication', () => {
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

    it('should hash passwords using bcrypt and never store plaintext in password_hash', async () => {
      let insertedPasswordHash = null;
      const fakeClient = {
        query: vi.fn().mockImplementation(async (sql, params) => {
          if (sql.includes('SELECT id, full_name, username, email, role')) {
            return { rows: [] };
          }
          if (sql.includes('INSERT INTO users')) {
            insertedPasswordHash = params[3];
            return {
              rows: [{ id: 1, full_name: params[0], email: params[1], username: params[2], role: params[4] }],
            };
          }
          return { rows: [] };
        }),
      };

      await ensureAdminUser(fakeClient, {
        username: 'admin',
        email: 'admin@example.com',
        password: 'admin123',
      });

      expect(insertedPasswordHash).not.toBe('admin123');
      expect(insertedPasswordHash).toMatch(/^\$2[aby]\$\d{2}\$/);
      const isMatch = await bcrypt.compare('admin123', insertedPasswordHash);
      expect(isMatch).toBe(true);
    });
  });

  describe('2. Safe and Idempotent Account Seeding', () => {
    it('should create official demo accounts when absent', async () => {
      const fakeClient = {
        query: vi.fn().mockImplementation(async (sql, params) => {
          if (sql.includes('SELECT id, full_name, username, email, role')) {
            return { rows: [] }; // Not found
          }
          if (sql.includes('INSERT INTO users')) {
            return {
              rows: [
                {
                  id: params[2] === 'admin' ? 1 : 2,
                  full_name: params[0],
                  email: params[1],
                  username: params[2],
                  role: params[4],
                },
              ],
            };
          }
          return { rows: [] };
        }),
      };

      const adminRes = await ensureAdminUser(fakeClient);
      const studentRes = await ensureStudentUser(fakeClient);

      expect(adminRes.created).toBe(true);
      expect(adminRes.user.username).toBe('admin');
      expect(adminRes.user.email).toBe('admin@example.com');
      expect(adminRes.user.role).toBe('admin');

      expect(studentRes.created).toBe(true);
      expect(studentRes.user.username).toBe('student');
      expect(studentRes.user.email).toBe('student@example.com');
      expect(studentRes.user.role).toBe('student');
    });

    it('should safely recognize existing accounts without modifying data or resetting passwords', async () => {
      const fakeClient = {
        query: vi.fn().mockImplementation(async (sql, params) => {
          if (sql.includes('SELECT id, full_name, username, email, role')) {
            // Found existing matching account
            return {
              rows: [
                {
                  id: 1,
                  username: 'admin',
                  email: 'admin@example.com',
                  role: 'admin',
                  full_name: 'Custom Admin Name',
                  created_at: new Date().toISOString(),
                },
              ],
            };
          }
          // Should NOT call UPDATE or INSERT
          if (sql.includes('UPDATE users') || sql.includes('INSERT INTO users')) {
            throw new Error('Should not update or insert existing recognized account!');
          }
          return { rows: [] };
        }),
      };

      const result = await ensureAdminUser(fakeClient, {
        username: 'admin',
        email: 'admin@example.com',
        password: 'new_password_that_must_not_overwrite',
      });

      expect(result.created).toBe(false);
      expect(result.user.id).toBe(1);
      expect(result.user.full_name).toBe('Custom Admin Name');
      expect(fakeClient.query).toHaveBeenCalledTimes(1); // Only the SELECT query
    });

    it('should not modify or alias legacy accounts', async () => {
      const fakeClient = {
        query: vi.fn().mockImplementation(async (sql, params) => {
          if (sql.includes('SELECT id, full_name, username, email, role')) {
            // Neither username 'admin' nor email 'admin@example.com' exists yet
            return { rows: [] };
          }
          if (sql.includes('INSERT INTO users')) {
            return {
              rows: [
                {
                  id: 10,
                  full_name: params[0],
                  email: params[1],
                  username: params[2],
                  role: params[4],
                },
              ],
            };
          }
          return { rows: [] };
        }),
      };

      const result = await ensureAdminUser(fakeClient, {
        username: 'admin',
        email: 'admin@example.com',
        password: 'admin123',
      });

      expect(result.created).toBe(true);
      expect(result.user.email).toBe('admin@example.com');
      // Verify query strictly looked for 'admin' and 'admin@example.com', NOT 'admin@school.com'
      const selectCall = fakeClient.query.mock.calls[0];
      expect(selectCall[1]).toEqual(['admin', 'admin@example.com']);
    });
  });

  describe('3. Conflict Detection and Safe Error Handling', () => {
    it('should fail with clear error when username is taken by a different email', async () => {
      const fakeClient = {
        query: vi.fn().mockImplementation(async () => {
          return {
            rows: [
              {
                id: 5,
                username: 'admin',
                email: 'other_admin@school.com',
                role: 'admin',
              },
            ],
          };
        }),
      };

      await expect(
        ensureAdminUser(fakeClient, { username: 'admin', email: 'admin@example.com' })
      ).rejects.toThrow(/Conflict: Username 'admin' is already taken by existing user with email 'other_admin@school.com'/);
    });

    it('should fail with clear error when email is registered to a different username', async () => {
      const fakeClient = {
        query: vi.fn().mockImplementation(async () => {
          return {
            rows: [
              {
                id: 6,
                username: 'different_user',
                email: 'student@example.com',
                role: 'student',
              },
            ],
          };
        }),
      };

      await expect(
        ensureStudentUser(fakeClient, { username: 'student', email: 'student@example.com' })
      ).rejects.toThrow(/Conflict: Email 'student@example.com' is already registered to user 'different_user'/);
    });

    it('should fail with clear error when account exists with unexpected role', async () => {
      const fakeClient = {
        query: vi.fn().mockImplementation(async () => {
          return {
            rows: [
              {
                id: 7,
                username: 'admin',
                email: 'admin@example.com',
                role: 'student', // conflicting role!
              },
            ],
          };
        }),
      };

      await expect(
        ensureAdminUser(fakeClient, { username: 'admin', email: 'admin@example.com' })
      ).rejects.toThrow(/Conflict: Account 'admin' \(admin@example.com\) exists but has role 'student' instead of expected role 'admin'/);
    });

    it('should fail when username and email conflict with multiple different accounts', async () => {
      const fakeClient = {
        query: vi.fn().mockImplementation(async () => {
          return {
            rows: [
              { id: 1, username: 'admin', email: 'admin1@test.com', role: 'admin' },
              { id: 2, username: 'admin2', email: 'admin@example.com', role: 'admin' },
            ],
          };
        }),
      };

      await expect(
        ensureAdminUser(fakeClient, { username: 'admin', email: 'admin@example.com' })
      ).rejects.toThrow(/Conflict: Username 'admin' and email 'admin@example.com' conflict with multiple existing user accounts/);
    });
  });

  describe('4. Separation of Schema Initialization and Account Seeding', () => {
    it('should verify database/init.sql contains required schema but NO legacy demo users or sample surveys', () => {
      const initSqlPath = path.resolve(__dirname, '../../database/init.sql');
      expect(fs.existsSync(initSqlPath)).toBe(true);

      const content = fs.readFileSync(initSqlPath, 'utf8');

      // 1. Schema must remain intact
      expect(content).toContain('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
      expect(content).toContain('CREATE TABLE users');
      expect(content).toContain('CREATE TABLE surveys');
      expect(content).toContain('CREATE TABLE questions');
      expect(content).toContain('CREATE TABLE survey_responses');
      expect(content).toContain('CREATE TABLE answers');
      expect(content).toContain('CREATE TABLE feedback');
      expect(content).toContain('CREATE TABLE survey_views');

      // 2. Legacy demo accounts must NOT be in init.sql
      expect(content).not.toContain('admin@school.com');
      expect(content).not.toContain('student1@school.com');
      expect(content).not.toContain('student2@school.com');

      // 3. Sample surveys and questions must NOT be in init.sql
      expect(content).not.toContain("INSERT INTO surveys (title, description, status, created_by, published_at)");
      expect(content).not.toContain("INSERT INTO questions (survey_id, question_text, question_type, options, position)");
    });

    it('should verify normal seed command creates no sample surveys or questions and does not execute init.sql', async () => {
      const executedSqls = [];

      vi.spyOn(db, 'withTransaction').mockImplementation(async (callback) => {
        const fakeClient = {
          query: vi.fn().mockImplementation(async (sql, params) => {
            executedSqls.push(sql);
            if (sql.includes('SELECT id, full_name, username, email, role')) {
              return { rows: [] };
            }
            if (sql.includes('INSERT INTO users')) {
              return {
                rows: [
                  {
                    id: params[2] === 'admin' ? 1 : 2,
                    full_name: params[0],
                    email: params[1],
                    username: params[2],
                    role: params[4],
                  },
                ],
              };
            }
            return { rows: [] };
          }),
        };
        return await callback(fakeClient);
      });

      const seedResult = await seedDatabase();

      expect(seedResult.admin.username).toBe('admin');
      expect(seedResult.student.username).toBe('student');

      // Ensure NO survey or question queries were executed
      for (const sql of executedSqls) {
        expect(sql).not.toContain('INSERT INTO surveys');
        expect(sql).not.toContain('INSERT INTO questions');
        expect(sql).not.toContain('CREATE TABLE');
      }
    });

    it('should handle transaction rollback on error properly', async () => {
      vi.spyOn(db, 'withTransaction').mockImplementation(async (callback) => {
        const fakeClient = {
          query: vi.fn().mockImplementation(async (sql) => {
            if (sql.includes('SELECT id, full_name, username, email, role')) {
              throw new Error('Database connection lost during seeding');
            }
            return { rows: [] };
          }),
        };
        return await callback(fakeClient);
      });

      await expect(seedDatabase()).rejects.toThrow('Database connection lost during seeding');
    });
  });
});
