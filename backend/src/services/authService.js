let bcrypt;
try {
  bcrypt = require('bcrypt');
} catch (e) {
  bcrypt = require('bcryptjs');
}

const jwt = require('jsonwebtoken');
const db = require('../config/db');
const env = require('../config/env');
const { UnauthorizedError, NotFoundError, ConflictError } = require('../middleware/errorHandler');

/**
 * Registers a new user account (defaulting to student).
 * @param {object} userData
 * @param {string} userData.fullName
 * @param {string} userData.email
 * @param {string} userData.password
 * @param {string} [userData.username]
 * @param {'student'|'admin'} [userData.role]
 * @returns {Promise<{ token: string, user: object }>}
 */
async function register({ fullName, email, password, username, role = 'student' }) {
  const trimmedName = fullName.trim();
  const trimmedEmail = email.trim().toLowerCase();

  // Check if email already registered
  const existingUserRes = await db.query(
    `SELECT id, username, email FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1;`,
    [trimmedEmail]
  );
  if (existingUserRes.rows.length > 0) {
    throw new ConflictError('An account with this email already exists.');
  }

  // Derive a valid unique username if not provided
  let candidateUsername = (username && username.trim())
    ? username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')
    : trimmedEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9_-]/g, '');

  if (!candidateUsername) {
    candidateUsername = 'student';
  }
  candidateUsername = candidateUsername.slice(0, 40);

  let finalUsername = candidateUsername;
  let counter = 1;
  while (true) {
    const userCheck = await db.query(
      `SELECT id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1;`,
      [finalUsername]
    );
    if (userCheck.rows.length === 0) {
      break;
    }
    finalUsername = `${candidateUsername}${counter++}`;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const userRole = role === 'admin' ? 'admin' : 'student';

  const insertRes = await db.query(
    `INSERT INTO users (full_name, email, username, password_hash, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, full_name, email, username, role, created_at;`,
    [trimmedName, trimmedEmail, finalUsername, passwordHash, userRole]
  );

  const newUser = insertRes.rows[0];

  const safeUser = {
    id: newUser.id,
    username: newUser.username,
    email: newUser.email,
    role: newUser.role,
    full_name: newUser.full_name,
    name: newUser.full_name,
    created_at: newUser.created_at,
  };

  const token = jwt.sign(
    {
      id: newUser.id,
      username: newUser.username,
      email: newUser.email,
      role: newUser.role,
    },
    env.jwt.secret,
    { expiresIn: env.jwt.expiresIn }
  );

  return { token, user: safeUser };
}

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
    name: user.full_name,
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

  return {
    ...user,
    name: user.full_name,
  };
}

module.exports = {
  register,
  login,
  getUserProfile,
};
