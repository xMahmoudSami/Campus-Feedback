const fs = require('fs');
const path = require('path');
let bcrypt;
try {
  bcrypt = require('bcrypt');
} catch (e) {
  bcrypt = require('bcryptjs');
}

const db = require('../config/db');
const env = require('../config/env');

/**
 * Inserts or updates a user idempotently without failing unique constraints.
 */
async function upsertUser(client, { username, email, password, role, fullName }) {
  const passwordHash = await bcrypt.hash(password, 10);

  // Check if user exists by either username or email
  const existingRes = await client.query(
    `SELECT id, username, email FROM users 
     WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2) 
     LIMIT 1;`,
    [username.trim(), email.trim()]
  );

  if (existingRes.rows.length > 0) {
    const existingId = existingRes.rows[0].id;
    const updateRes = await client.query(
      `UPDATE users
       SET username = $1, email = $2, password_hash = $3, role = $4, full_name = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING id, username, email, role, full_name;`,
      [username.trim(), email.trim(), passwordHash, role, fullName, existingId]
    );
    return { user: updateRes.rows[0], created: false };
  } else {
    const insertRes = await client.query(
      `INSERT INTO users (username, email, password_hash, role, full_name)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, email, role, full_name;`,
      [username.trim(), email.trim(), passwordHash, role, fullName]
    );
    return { user: insertRes.rows[0], created: true };
  }
}

async function seedDatabase() {
  console.log('--- Starting Database Seeding ---');

  const args = process.argv.slice(2);
  const shouldInitSchema = args.includes('--init-schema') || args.includes('-i');

  if (shouldInitSchema) {
    console.log('Running schema creation script from docs/schema.sql...');
    const schemaSqlPath = path.resolve(__dirname, '../../docs/schema.sql');
    if (fs.existsSync(schemaSqlPath)) {
      const sqlContent = fs.readFileSync(schemaSqlPath, 'utf8');
      await db.query(sqlContent);
      console.log('Schema tables created successfully.');
    } else {
      console.warn(`Schema file not found at ${schemaSqlPath}. Skipping table creation.`);
    }
  }

  const results = await db.withTransaction(async (client) => {
    // 1. Seed Mandatory Admin Account
    // Admin: admin / admin@example.com / admin123
    const adminResult = await upsertUser(client, {
      username: env.seed.adminUsername,
      email: env.seed.adminEmail,
      password: env.seed.adminPassword,
      role: 'admin',
      fullName: 'System Administrator',
    });
    console.log(
      `${adminResult.created ? 'Created' : 'Updated'} Admin User: ${adminResult.user.username} (${adminResult.user.email})`
    );

    // 2. Seed Mandatory Student Account
    // Student: student / student@example.com / student123
    const studentResult = await upsertUser(client, {
      username: env.seed.studentUsername,
      email: env.seed.studentEmail,
      password: env.seed.studentPassword,
      role: 'student',
      fullName: 'Demo Student',
    });
    console.log(
      `${studentResult.created ? 'Created' : 'Updated'} Student User: ${studentResult.user.username} (${studentResult.user.email})`
    );

    // 3. Seed Sample Published Survey if none exists
    const existingSurveys = await client.query(`SELECT COUNT(*)::int AS count FROM surveys`);
    let sampleSurveyCreated = false;

    if (existingSurveys.rows[0].count === 0) {
      console.log('Seeding initial sample course survey...');
      const sRes = await client.query(
        `INSERT INTO surveys (title, description, status, created_by)
         VALUES ($1, $2, 'published', $3)
         RETURNING id;`,
        [
          'Cloud Computing Mid-Term Feedback',
          'Please share your constructive feedback regarding lectures, lab exercises, and course pacing.',
          adminResult.user.id,
        ]
      );
      const surveyId = sRes.rows[0].id;

      // Question 1: Rating (1-5)
      await client.query(
        `INSERT INTO questions (survey_id, question_text, question_type, options, is_required, order_index)
         VALUES ($1, $2, 'rating', '[]'::jsonb, true, 1);`,
        [surveyId, 'How would you rate the overall quality of cloud computing lab exercises? (1-5)']
      );

      // Question 2: Single Choice
      await client.query(
        `INSERT INTO questions (survey_id, question_text, question_type, options, is_required, order_index)
         VALUES ($1, $2, 'single_choice', $3::jsonb, true, 2);`,
        [
          surveyId,
          'Which topic did you find most engaging?',
          JSON.stringify(['Docker Containers', 'Microservices Architecture', 'Cloud Storage & Databases', 'Kubernetes / Orchestration']),
        ]
      );

      // Question 3: Text
      await client.query(
        `INSERT INTO questions (survey_id, question_text, question_type, options, is_required, order_index)
         VALUES ($1, $2, 'text', '[]'::jsonb, false, 3);`,
        [surveyId, 'Any suggestions or additional comments for the instructor?']
      );

      // Draft Survey
      await client.query(
        `INSERT INTO surveys (title, description, status, created_by)
         VALUES ($1, $2, 'draft', $3);`,
        ['End-of-Term General Curriculum Survey', 'Upcoming survey for final course evaluation.', adminResult.user.id]
      );

      sampleSurveyCreated = true;
      console.log('Sample surveys and questions created.');
    }

    return {
      admin: adminResult.user,
      student: studentResult.user,
      sampleSurveyCreated,
    };
  });

  console.log('--- Database Seeding Complete ---');
  return results;
}

// Execute when invoked directly from CLI
if (require.main === module) {
  seedDatabase()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seeding failed:', err);
      process.exit(1);
    });
}

module.exports = {
  seedDatabase,
  upsertUser,
};
