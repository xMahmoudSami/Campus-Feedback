let bcrypt;
try {
  bcrypt = require('bcrypt');
} catch (e) {
  bcrypt = require('bcryptjs');
}

const jwt = require('jsonwebtoken');
const db = require('../config/db');
const env = require('../config/env');
const { UnauthorizedError, NotFoundError } = require('../middleware/errorHandler');

/**
 * Authenticates user by username or email and returns a signed JWT.
 * @param {string} identifier - Username or Email
 * @param {string} password - Raw password
 * @returns {Promise<{ token: string, user: object }>}
 */
async function login(identifier, password) {
  const queryText = `
    SELECT id, username, email, password_hash, role, full_name, created_at
    FROM users
    WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1)
    LIMIT 1;
  `;

  const result = await db.query(queryText, [identifier.trim()]);
  const user = result.rows[0];

  if (!user) {
    throw new UnauthorizedError('Invalid email/username or password.');
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    throw new UnauthorizedError('Invalid email/username or password.');
  }

  // Safe user profile without password_hash
  const safeUser = {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    full_name: user.full_name,
    created_at: user.created_at,
  };

  // Sign token
  const token = jwt.sign(
    {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    },
    env.jwt.secret,
    { expiresIn: env.jwt.expiresIn }
  );

  return { token, user: safeUser };
}

/**
 * Retrieves the safe profile of an authenticated user.
 * @param {number} userId
 * @returns {Promise<object>}
 */
async function getUserProfile(userId) {
  const queryText = `
    SELECT id, username, email, role, full_name, created_at
    FROM users
    WHERE id = $1
    LIMIT 1;
  `;

  const result = await db.query(queryText, [userId]);
  const user = result.rows[0];

  if (!user) {
    throw new NotFoundError('User account not found.');
  }

  return user;
}

module.exports = {
  login,
  getUserProfile,
};
