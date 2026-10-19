let bcrypt;
try {
  bcrypt = require('bcrypt');
} catch (e) {
  bcrypt = require('bcryptjs');
}

const db = require('../config/db');
const env = require('../config/env');

/**
 * Ensures an official demo user exists.
 * - If absent, creates the account with a properly hashed password.
 * - If present with matching username, email, and role, recognizes the account
 *   without modifying it or resetting the existing password.
 * - If a username or email conflicts with an existing account whose identity
 *   cannot be safely established, throws a clear and actionable Conflict error.
 *
 * @param {import('pg').PoolClient} client
 * @param {object} account
 * @param {string} account.username
 * @param {string} account.email
 * @param {string} account.password
 * @param {string} account.fullName
 * @param {'admin'|'student'} account.role
 * @returns {Promise<{ user: object, created: boolean }>}
 */
async function ensureDemoUser(client, { username, email, password, fullName, role }) {
  const trimmedUsername = username.trim();
  const trimmedEmail = email.trim();

  // Search for any existing user with this username or email
  const existingRes = await client.query(
    `SELECT id, full_name, username, email, role, created_at
     FROM users
     WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2);`,
    [trimmedUsername, trimmedEmail]
  );

  const matched = existingRes.rows;

  if (matched.length === 0) {
    // Brand new account: hash password and insert
    const passwordHash = await bcrypt.hash(password, 10);
    const insertRes = await client.query(
      `INSERT INTO users (full_name, email, username, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, full_name, username, email, role, created_at;`,
      [fullName, trimmedEmail, trimmedUsername, passwordHash, role]
    );
    return { user: insertRes.rows[0], created: true };
  }

  if (matched.length === 1) {
    const existing = matched[0];
    const usernameMatches = existing.username.toLowerCase() === trimmedUsername.toLowerCase();
    const emailMatches = existing.email.toLowerCase() === trimmedEmail.toLowerCase();

    // Exact identity match: both username and email match this record
    if (usernameMatches && emailMatches) {
      if (existing.role !== role) {
        throw new Error(
          `Conflict: Account '${trimmedUsername}' (${trimmedEmail}) exists but has role '${existing.role}' instead of expected role '${role}'.`
        );
      }
      // Recognize existing account: do NOT reset password, do NOT overwrite fields
      return { user: existing, created: false };
    }

    // Conflict: username matches but email is different
    if (usernameMatches && !emailMatches) {
      throw new Error(
        `Conflict: Username '${trimmedUsername}' is already taken by existing user with email '${existing.email}'.`
      );
    }

    // Conflict: email matches but username is different
    if (!usernameMatches && emailMatches) {
      throw new Error(
        `Conflict: Email '${trimmedEmail}' is already registered to user '${existing.username}'.`
      );
    }
  }

  // Multiple records matched (e.g. username matches user A and email matches user B)
  throw new Error(
    `Conflict: Username '${trimmedUsername}' and email '${trimmedEmail}' conflict with multiple existing user accounts.`
  );
}

/**
 * Helper to ensure Admin user.
 */
async function ensureAdminUser(client, details = {}) {
  return ensureDemoUser(client, {
    username: details.username || env.seed.adminUsername,
    email: details.email || env.seed.adminEmail,
    password: details.password || env.seed.adminPassword,
    fullName: details.fullName || 'System Administrator',
    role: 'admin',
  });
}

/**
 * Helper to ensure Student user.
 */
async function ensureStudentUser(client, details = {}) {
  return ensureDemoUser(client, {
    username: details.username || env.seed.studentUsername,
    email: details.email || env.seed.studentEmail,
    password: details.password || env.seed.studentPassword,
    fullName: details.fullName || 'Demo Student',
    role: 'student',
  });
}

/**
 * Seeds or safely recognizes only the two official demo accounts inside a managed transaction.
 * Does not create sample surveys, questions, responses, or feedback.
 * Does not execute database/init.sql or touch schema definitions.
 */
async function seedDatabase() {
  console.log('--- Starting Backend Account Seeding ---');

  const results = await db.withTransaction(async (client) => {
    // 1. Ensure Official Admin Demo Account
    const adminResult = await ensureAdminUser(client, {
      username: env.seed.adminUsername,
      email: env.seed.adminEmail,
      password: env.seed.adminPassword,
      fullName: 'System Administrator',
    });
    console.log(
      `${adminResult.created ? 'Created' : 'Recognized existing'} Admin User: ${adminResult.user.username} (${adminResult.user.email})`
    );

    // 2. Ensure Official Student Demo Account
    const studentResult = await ensureStudentUser(client, {
      username: env.seed.studentUsername,
      email: env.seed.studentEmail,
      password: env.seed.studentPassword,
      fullName: 'Demo Student',
    });
    console.log(
      `${studentResult.created ? 'Created' : 'Recognized existing'} Student User: ${studentResult.user.username} (${studentResult.user.email})`
    );

    return {
      admin: adminResult.user,
      student: studentResult.user,
      adminCreated: adminResult.created,
      studentCreated: studentResult.created,
    };
  });

  console.log('--- Backend Account Seeding Complete ---');
  return results;
}

// Execute when invoked directly from CLI
if (require.main === module) {
  seedDatabase()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seeding failed:', err.message || err);
      process.exit(1);
    });
}

module.exports = {
  seedDatabase,
  ensureDemoUser,
  ensureAdminUser,
  ensureStudentUser,
  // Backward-compatibility aliases
  upsertAdminUser: ensureAdminUser,
  upsertStudentUser: ensureStudentUser,
};
