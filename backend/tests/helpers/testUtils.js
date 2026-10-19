const jwt = require('jsonwebtoken');
const env = require('../../src/config/env');

function generateToken(payload = {}) {
  const defaultPayload = {
    id: 1,
    username: 'student',
    email: 'student@example.com',
    role: 'student',
    full_name: 'Demo Student',
  };

  return jwt.sign({ ...defaultPayload, ...payload }, env.jwt.secret, {
    expiresIn: '1h',
  });
}

function generateAdminToken(payload = {}) {
  return generateToken({
    id: 99,
    username: 'admin',
    email: 'admin@example.com',
    role: 'admin',
    full_name: 'System Administrator',
    ...payload,
  });
}

function generateStudentToken(payload = {}) {
  return generateToken({
    id: 10,
    username: 'student',
    email: 'student@example.com',
    role: 'student',
    full_name: 'Demo Student',
    ...payload,
  });
}

module.exports = {
  generateToken,
  generateAdminToken,
  generateStudentToken,
};
