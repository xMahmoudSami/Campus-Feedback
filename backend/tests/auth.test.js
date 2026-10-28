const request = require('supertest');
let bcrypt;
try {
  bcrypt = require('bcrypt');
} catch (e) {
  bcrypt = require('bcryptjs');
}

const app = require('../src/app');
const db = require('../src/config/db');
const { generateToken, generateAdminToken, generateStudentToken } = require('./helpers/testUtils');

describe('Authentication Endpoints', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/auth/login', () => {
    it('should successfully log in with valid username and password', async () => {
      const plainPassword = 'Password123!';
      const hashedPassword = await bcrypt.hash(plainPassword, 10);

      vi.spyOn(db, 'query').mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            username: 'student1',
            email: 'student1@university.edu',
            password_hash: hashedPassword,
            role: 'student',
            full_name: 'Student One',
            created_at: new Date().toISOString(),
          },
        ],
      });

      const res = await request(app).post('/api/auth/login').send({
        identifier: 'student1',
        password: plainPassword,
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.username).toBe('student1');
      expect(res.body.data.user.role).toBe('student');
      // Verify password_hash is never exposed
      expect(res.body.data.user.password_hash).toBeUndefined();
    });

    it('should successfully log in using email address', async () => {
      const plainPassword = 'AdminSecret99!';
      const hashedPassword = await bcrypt.hash(plainPassword, 10);

      vi.spyOn(db, 'query').mockResolvedValueOnce({
        rows: [
          {
            id: 99,
            username: 'admin',
            email: 'admin@university.edu',
            password_hash: hashedPassword,
            role: 'admin',
            full_name: 'Admin User',
            created_at: new Date().toISOString(),
          },
        ],
      });

      const res = await request(app).post('/api/auth/login').send({
        email: 'admin@university.edu',
        password: plainPassword,
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe('admin');
    });

    it('should return 401 for wrong password', async () => {
      const hashedPassword = await bcrypt.hash('CorrectPassword', 10);

      vi.spyOn(db, 'query').mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            username: 'student1',
            email: 'student1@university.edu',
            password_hash: hashedPassword,
            role: 'student',
          },
        ],
      });

      const res = await request(app).post('/api/auth/login').send({
        identifier: 'student1',
        password: 'WrongPassword',
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Invalid email/username or password');
    });

    it('should return 401 when user is not found in database', async () => {
      vi.spyOn(db, 'query').mockResolvedValueOnce({ rows: [] });

      const res = await request(app).post('/api/auth/login').send({
        identifier: 'unknown_user',
        password: 'SomePassword',
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Invalid email/username or password');
    });

    it('should return 400 when identifier or password is missing', async () => {
      const res1 = await request(app).post('/api/auth/login').send({
        password: 'password_only',
      });
      expect(res1.status).toBe(400);

      const res2 = await request(app).post('/api/auth/login').send({
        identifier: 'user_only',
      });
      expect(res2.status).toBe(400);
    });

    it('should NOT set Clear-Site-Data header on API responses to preserve DevTools inspection', async () => {
      const res = await request(app).post('/api/auth/login').send({
        identifier: 'nonexistent',
        password: 'password',
      });
      expect(res.headers['clear-site-data']).toBeUndefined();
      expect(res.headers['cache-control']).toContain('no-store');
    });

    it('should trim surrounding whitespace from identifier', async () => {
      const plainPassword = 'SecretPassword123!';
      const hashedPassword = await bcrypt.hash(plainPassword, 10);

      vi.spyOn(db, 'query').mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            username: 'admin',
            email: 'admin@example.com',
            password_hash: hashedPassword,
            role: 'admin',
            full_name: 'Admin User',
            created_at: new Date().toISOString(),
          },
        ],
      });

      const res = await request(app).post('/api/auth/login').send({
        identifier: '   admin   ',
        password: plainPassword,
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return safe user profile when authenticated with valid token', async () => {
      const token = generateStudentToken({ id: 5 });

      vi.spyOn(db, 'query').mockResolvedValueOnce({
        rows: [
          {
            id: 5,
            username: 'student5',
            email: 'student5@university.edu',
            role: 'student',
            full_name: 'Student Five',
            created_at: new Date().toISOString(),
          },
        ],
      });

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.id).toBe(5);
      expect(res.body.data.user.password_hash).toBeUndefined();
    });

    it('should return 401 when Authorization header is missing', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Authorization header missing');
    });

    it('should return 401 when Authorization format is invalid', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'InvalidFormatWithoutBearer');

      expect(res.status).toBe(401);
    });

    it('should return 401 for an invalid or tampered JWT token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid.token.signature');

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should return 200 with honest logout semantics', async () => {
      const res = await request(app).post('/api/auth/logout');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.semantics).toBeDefined();
    });
  });

  describe('POST /api/auth/register', () => {
    it('should successfully register a new student account', async () => {
      // 1. Email check mock: no existing user with this email
      vi.spyOn(db, 'query')
        .mockResolvedValueOnce({ rows: [] }) // check email
        .mockResolvedValueOnce({ rows: [] }) // check username collision
        .mockResolvedValueOnce({
          rows: [
            {
              id: 50,
              full_name: 'Sara Student',
              email: 'sara@university.edu',
              username: 'sara',
              role: 'student',
              created_at: new Date().toISOString(),
            },
          ],
        }); // insert into users

      const res = await request(app).post('/api/auth/register').send({
        name: 'Sara Student',
        email: 'sara@university.edu',
        password: 'Password123!',
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.name).toBe('Sara Student');
      expect(res.body.data.user.email).toBe('sara@university.edu');
      expect(res.body.data.user.role).toBe('student');
    });

    it('should reject registration if email is already registered (409 Conflict)', async () => {
      vi.spyOn(db, 'query').mockResolvedValueOnce({
        rows: [{ id: 1, email: 'existing@university.edu' }],
      });

      const res = await request(app).post('/api/auth/register').send({
        name: 'Existing User',
        email: 'existing@university.edu',
        password: 'Password123!',
      });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('already exists');
    });

    it('should reject registration if required fields are missing (400)', async () => {
      const res = await request(app).post('/api/auth/register').send({
        email: 'invalid@university.edu',
        // missing name and password
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject registration if password is too short (400)', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'Short Pw',
        email: 'shortpw@university.edu',
        password: '123',
      });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('at least 6 characters');
    });
  });
});
