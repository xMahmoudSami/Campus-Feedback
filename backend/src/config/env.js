const path = require('path');
const dotenv = require('dotenv');

// Load .env from backend directory if present
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const env = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  db: {
    connectionString: process.env.DATABASE_URL,
    host: process.env.DB_HOST || (process.env.NODE_ENV === 'production' ? 'database' : 'localhost'),
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'feedback_user',
    password: process.env.DB_PASSWORD || 'feedback_password',
    database: process.env.DB_NAME || 'student_feedback_db',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    poolMin: parseInt(process.env.DB_POOL_MIN || '2', 10),
    poolMax: parseInt(process.env.DB_POOL_MAX || '10', 10),
    timeoutMs: parseInt(process.env.DB_TIMEOUT_MS || '10000', 10),
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev_jwt_secret_student_feedback_system_change_in_production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },
  seed: {
    adminUsername: process.env.INITIAL_ADMIN_USERNAME || 'admin',
    adminEmail: process.env.INITIAL_ADMIN_EMAIL || 'admin@example.com',
    adminPassword: process.env.INITIAL_ADMIN_PASSWORD || 'admin123',
    studentUsername: process.env.INITIAL_STUDENT_USERNAME || 'student',
    studentEmail: process.env.INITIAL_STUDENT_EMAIL || 'student@example.com',
    studentPassword: process.env.INITIAL_STUDENT_PASSWORD || 'student123',
  },
};

// Validate that in production, JWT_SECRET must be explicitly supplied
if (env.isProduction && (!process.env.JWT_SECRET || process.env.JWT_SECRET.includes('dev_jwt_secret'))) {
  console.warn('[SECURITY WARNING] In production, JWT_SECRET should be set to a strong, unique secret key!');
}

module.exports = env;
