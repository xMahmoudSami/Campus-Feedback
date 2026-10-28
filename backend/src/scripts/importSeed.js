const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
let bcrypt;
try {
  bcrypt = require('bcrypt');
} catch (e) {
  bcrypt = require('bcryptjs');
}

const db = require('../config/db');
const accountSeeder = require('./seed');
const { hashContent, ensureSeedMapTable } = require('./exportSeed');

function resolveSeedFilePath() {
  const candidatePaths = [
    process.env.SEED_FILE_PATH,
    path.resolve(__dirname, '../../../database/seeds/dev_seed.json'),
    path.resolve('/app/database/seeds/dev_seed.json'),
    path.resolve(__dirname, '../seeds/dev_seed.json'),
  ].filter(Boolean);

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidatePaths[0] || path.resolve(__dirname, '../seeds/dev_seed.json');
}

/**
 * Derives or validates an entity UUID for incoming seed items.
 */
function getEntityUuid(item, entityType) {
  if (item.uuid && typeof item.uuid === 'string' && item.uuid.trim()) {
    return item.uuid.trim();
  }
  const identity = `${entityType}:${item.source_id || item.id || ''}:${item.username || item.title || item.question_text || item.message || ''}`;
  const hex = crypto.createHash('sha256').update(identity).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Imports development seed data and merges it safely across team members' databases.
 *
 * Safe-Merging Strategy:
 * 1. Ensures official demo accounts exist.
 * 2. Merges users (students and admins), avoiding credential overwrites and unique constraint clashes.
 * 3. Merges surveys and questions, reallocating numeric IDs when colliding with existing records.
 * 4. Merges survey responses and question answers, linking them to local surveys, students, and questions.
 * 5. Merges student feedback and survey views.
 * 6. Synchronizes all PostgreSQL primary key sequences.
 */
async function importSeedData(inputPath, options = {}) {
  const targetPath = inputPath || resolveSeedFilePath();
  console.log(`--- Importing Development Seed Data from: ${targetPath} ---`);

  if (!fs.existsSync(targetPath)) {
    throw new Error(`Seed data file not found at: ${targetPath}. Please export seed data first or verify the file path.`);
  }

  let seed;
  try {
    const raw = fs.readFileSync(targetPath, 'utf8');
    seed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid seed file: Failed to parse JSON at ${targetPath}. ${err.message}`);
  }

  // Handle empty or malformed top-level payload safely
  if (!seed || typeof seed !== 'object' || Array.isArray(seed)) {
    throw new Error('Invalid seed file: Root must be a valid JSON object.');
  }

  // 1. Ensure official demo accounts exist so baseline foreign keys remain valid
  const accounts = await accountSeeder.seedDatabase();
  const defaultAdminId = accounts.admin.id;
  const defaultStudentId = accounts.student.id;

  const result = await db.withTransaction(async (client) => {
    await ensureSeedMapTable(client);

    const userUuidToLocalId = new Map();
    const userSourceIdToLocalId = new Map();
    const userUsernameToLocalId = new Map();

    const surveyUuidToLocalId = new Map();
    const surveySourceIdToLocalId = new Map();

    const questionUuidToLocalId = new Map();
    const questionSourceIdToLocalId = new Map();

    const responseUuidToLocalId = new Map();
    const responseSourceIdToLocalId = new Map();

    let usersInserted = 0;
    let usersPreserved = 0;

    let surveysInserted = 0;
    let surveysUpdated = 0;
    let surveysPreserved = 0;

    let questionsInserted = 0;
    let questionsUpdated = 0;
    let questionsPreserved = 0;

    let responsesInserted = 0;
    let responsesUpdated = 0;
    let responsesPreserved = 0;

    let answersInserted = 0;
    let answersUpdated = 0;
    let answersPreserved = 0;

    let feedbackInserted = 0;
    let feedbackUpdated = 0;
    let feedbackPreserved = 0;

    let viewsInserted = 0;

    // Cache demo accounts in maps
    userUsernameToLocalId.set('admin', defaultAdminId);
    userUsernameToLocalId.set('student', defaultStudentId);

    // 2. Import & Merge Users (Students & Admins)
    const rawUsers = Array.isArray(seed.users) ? seed.users : [];
    for (const u of rawUsers) {
      const userUuid = getEntityUuid(u, 'users');
      const incomingHash = hashContent({
        full_name: u.full_name,
        email: u.email,
        username: u.username,
        role: u.role,
      });

      // Check seed_import_map first
      const mapRes = await client.query(`
        SELECT local_id, content_hash FROM seed_import_map
        WHERE entity_type = 'users' AND entity_uuid = $1;
      `, [userUuid]);

      let targetUserId = null;

      if (mapRes.rows.length > 0) {
        targetUserId = mapRes.rows[0].local_id;
        usersPreserved++;
      } else {
        // Check if user already exists locally by username or email
        const existingUserRes = await client.query(`
          SELECT id, username, email FROM users
          WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2);
        `, [u.username, u.email]);

        if (existingUserRes.rows.length > 0) {
          targetUserId = existingUserRes.rows[0].id;
          usersPreserved++;

          await client.query(`
            INSERT INTO seed_import_map (entity_type, entity_uuid, local_id, content_hash, imported_at)
            VALUES ('users', $1, $2, $3, NOW())
            ON CONFLICT (entity_type, entity_uuid) DO UPDATE SET
              local_id = EXCLUDED.local_id,
              content_hash = EXCLUDED.content_hash;
          `, [userUuid, targetUserId, incomingHash]);
        } else {
          // Brand new user to this database: insert safely
          const defaultPassword = u.role === 'admin' ? 'admin123' : 'student123';
          const passwordHash = await bcrypt.hash(defaultPassword, 10);

          const sourceNumericId = u.source_id || u.id;
          let useExplicitId = false;

          if (sourceNumericId && Number.isInteger(Number(sourceNumericId))) {
            const conflictCheck = await client.query(`SELECT id FROM users WHERE id = $1;`, [sourceNumericId]);
            if (conflictCheck.rows.length === 0) {
              useExplicitId = true;
            }
          }

          let insertRes;
          if (useExplicitId) {
            insertRes = await client.query(`
              INSERT INTO users (id, full_name, email, username, password_hash, role, created_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7)
              RETURNING id;
            `, [
              sourceNumericId,
              u.full_name || u.username,
              u.email,
              u.username,
              passwordHash,
              u.role || 'student',
              u.created_at || new Date().toISOString(),
            ]);
          } else {
            insertRes = await client.query(`
              INSERT INTO users (full_name, email, username, password_hash, role, created_at)
              VALUES ($1, $2, $3, $4, $5, $6)
              RETURNING id;
            `, [
              u.full_name || u.username,
              u.email,
              u.username,
              passwordHash,
              u.role || 'student',
              u.created_at || new Date().toISOString(),
            ]);
          }

          targetUserId = insertRes.rows[0].id;

          await client.query(`
            INSERT INTO seed_import_map (entity_type, entity_uuid, local_id, content_hash, imported_at)
            VALUES ('users', $1, $2, $3, NOW())
            ON CONFLICT (entity_type, entity_uuid) DO UPDATE SET
              local_id = EXCLUDED.local_id,
              content_hash = EXCLUDED.content_hash;
          `, [userUuid, targetUserId, incomingHash]);

          usersInserted++;
        }
      }

      userUuidToLocalId.set(userUuid, targetUserId);
      if (u.source_id) userSourceIdToLocalId.set(u.source_id, targetUserId);
      if (u.id) userSourceIdToLocalId.set(u.id, targetUserId);
      if (u.username) userUsernameToLocalId.set(u.username.toLowerCase(), targetUserId);
    }

    // 3. Import & Merge Surveys
    const rawSurveys = Array.isArray(seed.surveys) ? seed.surveys : [];
    for (const s of rawSurveys) {
      const surveyUuid = getEntityUuid(s, 'surveys');
      const incomingHash = hashContent({
        title: s.title,
        description: s.description || '',
        status: s.status,
        due_date: s.due_date ? new Date(s.due_date).toISOString() : null,
      });

      const mapRes = await client.query(`
        SELECT local_id, content_hash FROM seed_import_map
        WHERE entity_type = 'surveys' AND entity_uuid = $1;
      `, [surveyUuid]);

      let targetLocalId = null;

      if (mapRes.rows.length > 0) {
        const mappedLocalId = mapRes.rows[0].local_id;
        const storedHash = mapRes.rows[0].content_hash;

        const localSurveyRes = await client.query(`
          SELECT id, title, description, status, due_date FROM surveys WHERE id = $1;
        `, [mappedLocalId]);

        if (localSurveyRes.rows.length > 0) {
          targetLocalId = mappedLocalId;
          const localRow = localSurveyRes.rows[0];
          const currentLocalHash = hashContent({
            title: localRow.title,
            description: localRow.description || '',
            status: localRow.status,
            due_date: localRow.due_date ? new Date(localRow.due_date).toISOString() : null,
          });

          const hasLocalModifications = (currentLocalHash !== storedHash);
          const hasIncomingChanges = (incomingHash !== storedHash);

          if (hasLocalModifications && hasIncomingChanges) {
            throw new Error(
              `Conflict detected for survey '${s.title}' (UUID: ${surveyUuid}): Local record ID ${targetLocalId} was modified locally, and incoming seed also contains conflicting updates. Transaction aborted to prevent data loss.`
            );
          }

          if (hasLocalModifications && !hasIncomingChanges) {
            surveysPreserved++;
          } else if (!hasLocalModifications && hasIncomingChanges) {
            await client.query(`
              UPDATE surveys
              SET title = $1, description = $2, status = $3, due_date = $4, published_at = $5, closed_at = $6
              WHERE id = $7;
            `, [
              s.title,
              s.description || null,
              s.status || 'draft',
              s.due_date || null,
              s.published_at || null,
              s.closed_at || null,
              targetLocalId,
            ]);

            await client.query(`
              UPDATE seed_import_map
              SET content_hash = $1, imported_at = NOW()
              WHERE entity_type = 'surveys' AND entity_uuid = $2;
            `, [incomingHash, surveyUuid]);

            surveysUpdated++;
          } else {
            surveysPreserved++;
          }
        }
      }

      if (!targetLocalId) {
        const creatorId = (s.creator_uuid && userUuidToLocalId.get(s.creator_uuid))
          || (s.created_by && userSourceIdToLocalId.get(s.created_by))
          || (s.creator_username && userUsernameToLocalId.get(s.creator_username.toLowerCase()))
          || defaultAdminId;

        const sourceNumericId = s.source_id || s.id;
        let useExplicitId = false;

        if (sourceNumericId && Number.isInteger(Number(sourceNumericId))) {
          const conflictCheck = await client.query(`SELECT id FROM surveys WHERE id = $1;`, [sourceNumericId]);
          if (conflictCheck.rows.length === 0) {
            useExplicitId = true;
          }
        }

        let insertRes;
        if (useExplicitId) {
          insertRes = await client.query(`
            INSERT INTO surveys (id, title, description, status, created_by, due_date, created_at, published_at, closed_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id;
          `, [
            sourceNumericId,
            s.title,
            s.description || null,
            s.status || 'draft',
            creatorId,
            s.due_date || null,
            s.created_at || new Date().toISOString(),
            s.published_at || null,
            s.closed_at || null,
          ]);
        } else {
          insertRes = await client.query(`
            INSERT INTO surveys (title, description, status, created_by, due_date, created_at, published_at, closed_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id;
          `, [
            s.title,
            s.description || null,
            s.status || 'draft',
            creatorId,
            s.due_date || null,
            s.created_at || new Date().toISOString(),
            s.published_at || null,
            s.closed_at || null,
          ]);
        }

        targetLocalId = insertRes.rows[0].id;

        await client.query(`
          INSERT INTO seed_import_map (entity_type, entity_uuid, local_id, content_hash, imported_at)
          VALUES ('surveys', $1, $2, $3, NOW())
          ON CONFLICT (entity_type, entity_uuid) DO UPDATE SET
            local_id = EXCLUDED.local_id,
            content_hash = EXCLUDED.content_hash;
        `, [surveyUuid, targetLocalId, incomingHash]);

        surveysInserted++;
      }

      surveyUuidToLocalId.set(surveyUuid, targetLocalId);
      if (s.source_id) surveySourceIdToLocalId.set(s.source_id, targetLocalId);
      if (s.id) surveySourceIdToLocalId.set(s.id, targetLocalId);
    }

    // 4. Import & Merge Questions
    const rawQuestions = Array.isArray(seed.questions) ? seed.questions : [];
    for (const q of rawQuestions) {
      const targetSurveyId = q.survey_uuid
        ? surveyUuidToLocalId.get(q.survey_uuid)
        : surveySourceIdToLocalId.get(q.source_survey_id || q.survey_id);

      if (!targetSurveyId) {
        throw new Error(
          `Cannot import question '${q.question_text}': Target survey (UUID: ${q.survey_uuid || 'none'}, Source ID: ${q.source_survey_id || q.survey_id}) could not be resolved in the local database.`
        );
      }

      const questionUuid = getEntityUuid(q, 'questions');
      const incomingHash = hashContent({
        question_text: q.question_text,
        question_type: q.question_type,
        options: q.options || null,
        position: q.position || 1,
        is_required: q.is_required !== false,
      });

      const mapRes = await client.query(`
        SELECT local_id, content_hash FROM seed_import_map
        WHERE entity_type = 'questions' AND entity_uuid = $1;
      `, [questionUuid]);

      let targetQuestionId = null;

      if (mapRes.rows.length > 0) {
        const mappedLocalId = mapRes.rows[0].local_id;
        const storedHash = mapRes.rows[0].content_hash;

        const localQRes = await client.query(`
          SELECT id, question_text, question_type, options, position, is_required
          FROM questions WHERE id = $1;
        `, [mappedLocalId]);

        if (localQRes.rows.length > 0) {
          targetQuestionId = mappedLocalId;
          const localRow = localQRes.rows[0];
          const currentLocalHash = hashContent({
            question_text: localRow.question_text,
            question_type: localRow.question_type,
            options: localRow.options || null,
            position: localRow.position || 1,
            is_required: localRow.is_required !== false,
          });

          const hasLocalModifications = (currentLocalHash !== storedHash);
          const hasIncomingChanges = (incomingHash !== storedHash);

          if (hasLocalModifications && !hasIncomingChanges) {
            questionsPreserved++;
          } else if (!hasLocalModifications && hasIncomingChanges) {
            await client.query(`
              UPDATE questions
              SET question_text = $1, question_type = $2, options = $3, position = $4, is_required = $5, survey_id = $6
              WHERE id = $7;
            `, [
              q.question_text,
              q.question_type,
              q.options ? JSON.stringify(q.options) : null,
              q.position || 1,
              q.is_required !== false,
              targetSurveyId,
              targetQuestionId,
            ]);

            await client.query(`
              UPDATE seed_import_map
              SET content_hash = $1, imported_at = NOW()
              WHERE entity_type = 'questions' AND entity_uuid = $2;
            `, [incomingHash, questionUuid]);

            questionsUpdated++;
          } else {
            questionsPreserved++;
          }
        }
      }

      if (!targetQuestionId) {
        const sourceNumericId = q.source_id || q.id;
        let useExplicitId = false;

        if (sourceNumericId && Number.isInteger(Number(sourceNumericId))) {
          const conflictCheck = await client.query(`SELECT id FROM questions WHERE id = $1;`, [sourceNumericId]);
          if (conflictCheck.rows.length === 0) {
            useExplicitId = true;
          }
        }

        let insertRes;
        if (useExplicitId) {
          insertRes = await client.query(`
            INSERT INTO questions (id, survey_id, question_text, question_type, options, position, is_required)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id;
          `, [
            sourceNumericId,
            targetSurveyId,
            q.question_text,
            q.question_type,
            q.options ? JSON.stringify(q.options) : null,
            q.position || 1,
            q.is_required !== false,
          ]);
        } else {
          insertRes = await client.query(`
            INSERT INTO questions (survey_id, question_text, question_type, options, position, is_required)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id;
          `, [
            targetSurveyId,
            q.question_text,
            q.question_type,
            q.options ? JSON.stringify(q.options) : null,
            q.position || 1,
            q.is_required !== false,
          ]);
        }

        targetQuestionId = insertRes.rows[0].id;

        await client.query(`
          INSERT INTO seed_import_map (entity_type, entity_uuid, local_id, content_hash, imported_at)
          VALUES ('questions', $1, $2, $3, NOW())
          ON CONFLICT (entity_type, entity_uuid) DO UPDATE SET
            local_id = EXCLUDED.local_id,
            content_hash = EXCLUDED.content_hash;
        `, [questionUuid, targetQuestionId, incomingHash]);

        questionsInserted++;
      }

      questionUuidToLocalId.set(questionUuid, targetQuestionId);
      if (q.source_id) questionSourceIdToLocalId.set(q.source_id, targetQuestionId);
      if (q.id) questionSourceIdToLocalId.set(q.id, targetQuestionId);
    }

    // 5. Import & Merge Survey Responses
    const rawResponses = Array.isArray(seed.responses)
      ? seed.responses
      : (Array.isArray(seed.survey_responses) ? seed.survey_responses : []);

    for (const r of rawResponses) {
      const targetSurveyId = r.survey_uuid
        ? surveyUuidToLocalId.get(r.survey_uuid)
        : surveySourceIdToLocalId.get(r.source_survey_id || r.survey_id);

      const targetStudentId = (r.student_uuid && userUuidToLocalId.get(r.student_uuid))
        || (r.source_student_id && userSourceIdToLocalId.get(r.source_student_id))
        || (r.student_username && userUsernameToLocalId.get(r.student_username.toLowerCase()))
        || defaultStudentId;

      if (!targetSurveyId || !targetStudentId) {
        continue;
      }

      const responseUuid = getEntityUuid(r, 'survey_responses');
      const incomingHash = hashContent({
        status: r.status,
        completed_at: r.completed_at ? new Date(r.completed_at).toISOString() : null,
      });

      const mapRes = await client.query(`
        SELECT local_id, content_hash FROM seed_import_map
        WHERE entity_type = 'survey_responses' AND entity_uuid = $1;
      `, [responseUuid]);

      let targetResponseId = null;

      if (mapRes.rows.length > 0) {
        targetResponseId = mapRes.rows[0].local_id;
        responsesPreserved++;
      } else {
        // Enforce UNIQUE (survey_id, student_id)
        const existingRes = await client.query(`
          SELECT id, status, completed_at FROM survey_responses
          WHERE survey_id = $1 AND student_id = $2;
        `, [targetSurveyId, targetStudentId]);

        if (existingRes.rows.length > 0) {
          targetResponseId = existingRes.rows[0].id;
          if (existingRes.rows[0].status !== 'completed' && r.status === 'completed') {
            await client.query(`
              UPDATE survey_responses
              SET status = 'completed', completed_at = $1
              WHERE id = $2;
            `, [r.completed_at || new Date().toISOString(), targetResponseId]);
            responsesUpdated++;
          } else {
            responsesPreserved++;
          }

          await client.query(`
            INSERT INTO seed_import_map (entity_type, entity_uuid, local_id, content_hash, imported_at)
            VALUES ('survey_responses', $1, $2, $3, NOW())
            ON CONFLICT (entity_type, entity_uuid) DO UPDATE SET
              local_id = EXCLUDED.local_id,
              content_hash = EXCLUDED.content_hash;
          `, [responseUuid, targetResponseId, incomingHash]);
        } else {
          const sourceNumericId = r.source_id || r.id;
          let useExplicitId = false;

          if (sourceNumericId && Number.isInteger(Number(sourceNumericId))) {
            const conflictCheck = await client.query(`SELECT id FROM survey_responses WHERE id = $1;`, [sourceNumericId]);
            if (conflictCheck.rows.length === 0) {
              useExplicitId = true;
            }
          }

          let insertRes;
          if (useExplicitId) {
            insertRes = await client.query(`
              INSERT INTO survey_responses (id, survey_id, student_id, status, started_at, completed_at)
              VALUES ($1, $2, $3, $4, $5, $6)
              RETURNING id;
            `, [
              sourceNumericId,
              targetSurveyId,
              targetStudentId,
              r.status || 'completed',
              r.started_at || new Date().toISOString(),
              r.completed_at || (r.status === 'completed' ? new Date().toISOString() : null),
            ]);
          } else {
            insertRes = await client.query(`
              INSERT INTO survey_responses (survey_id, student_id, status, started_at, completed_at)
              VALUES ($1, $2, $3, $4, $5)
              RETURNING id;
            `, [
              targetSurveyId,
              targetStudentId,
              r.status || 'completed',
              r.started_at || new Date().toISOString(),
              r.completed_at || (r.status === 'completed' ? new Date().toISOString() : null),
            ]);
          }

          targetResponseId = insertRes.rows[0].id;

          await client.query(`
            INSERT INTO seed_import_map (entity_type, entity_uuid, local_id, content_hash, imported_at)
            VALUES ('survey_responses', $1, $2, $3, NOW())
            ON CONFLICT (entity_type, entity_uuid) DO UPDATE SET
              local_id = EXCLUDED.local_id,
              content_hash = EXCLUDED.content_hash;
          `, [responseUuid, targetResponseId, incomingHash]);

          responsesInserted++;
        }
      }

      responseUuidToLocalId.set(responseUuid, targetResponseId);
      if (r.source_id) responseSourceIdToLocalId.set(r.source_id, targetResponseId);
      if (r.id) responseSourceIdToLocalId.set(r.id, targetResponseId);
    }

    // 6. Import & Merge Answers
    const rawAnswers = Array.isArray(seed.answers) ? seed.answers : [];
    for (const a of rawAnswers) {
      const targetResponseId = a.response_uuid
        ? responseUuidToLocalId.get(a.response_uuid)
        : responseSourceIdToLocalId.get(a.source_response_id || a.response_id);

      const targetQuestionId = a.question_uuid
        ? questionUuidToLocalId.get(a.question_uuid)
        : questionSourceIdToLocalId.get(a.source_question_id || a.question_id);

      if (!targetResponseId || !targetQuestionId) {
        continue;
      }

      const answerUuid = getEntityUuid(a, 'answers');
      const incomingHash = hashContent({
        answer_text: a.answer_text,
        rating: a.rating,
      });

      // Check UNIQUE (response_id, question_id)
      const existingAnswerRes = await client.query(`
        SELECT id, answer_text, rating FROM answers
        WHERE response_id = $1 AND question_id = $2;
      `, [targetResponseId, targetQuestionId]);

      if (existingAnswerRes.rows.length > 0) {
        const localAns = existingAnswerRes.rows[0];
        if (localAns.answer_text !== a.answer_text || localAns.rating !== a.rating) {
          await client.query(`
            UPDATE answers
            SET answer_text = $1, rating = $2
            WHERE id = $3;
          `, [a.answer_text, a.rating || null, localAns.id]);
          answersUpdated++;
        } else {
          answersPreserved++;
        }

        await client.query(`
          INSERT INTO seed_import_map (entity_type, entity_uuid, local_id, content_hash, imported_at)
          VALUES ('answers', $1, $2, $3, NOW())
          ON CONFLICT (entity_type, entity_uuid) DO UPDATE SET
            local_id = EXCLUDED.local_id,
            content_hash = EXCLUDED.content_hash;
        `, [answerUuid, localAns.id, incomingHash]);
      } else {
        const sourceNumericId = a.source_id || a.id;
        let useExplicitId = false;

        if (sourceNumericId && Number.isInteger(Number(sourceNumericId))) {
          const conflictCheck = await client.query(`SELECT id FROM answers WHERE id = $1;`, [sourceNumericId]);
          if (conflictCheck.rows.length === 0) {
            useExplicitId = true;
          }
        }

        let insertRes;
        if (useExplicitId) {
          insertRes = await client.query(`
            INSERT INTO answers (id, response_id, question_id, answer_text, rating)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id;
          `, [
            sourceNumericId,
            targetResponseId,
            targetQuestionId,
            a.answer_text || null,
            a.rating || null,
          ]);
        } else {
          insertRes = await client.query(`
            INSERT INTO answers (response_id, question_id, answer_text, rating)
            VALUES ($1, $2, $3, $4)
            RETURNING id;
          `, [
            targetResponseId,
            targetQuestionId,
            a.answer_text || null,
            a.rating || null,
          ]);
        }

        const newAnsId = insertRes.rows[0].id;

        await client.query(`
          INSERT INTO seed_import_map (entity_type, entity_uuid, local_id, content_hash, imported_at)
          VALUES ('answers', $1, $2, $3, NOW())
          ON CONFLICT (entity_type, entity_uuid) DO UPDATE SET
            local_id = EXCLUDED.local_id,
            content_hash = EXCLUDED.content_hash;
        `, [answerUuid, newAnsId, incomingHash]);

        answersInserted++;
      }
    }

    // 7. Import & Merge Feedback
    const rawFeedback = Array.isArray(seed.feedback) ? seed.feedback : [];
    for (const f of rawFeedback) {
      let targetSurveyId = null;
      if (f.survey_uuid) {
        targetSurveyId = surveyUuidToLocalId.get(f.survey_uuid) || null;
      } else if (f.source_survey_id || f.survey_id) {
        targetSurveyId = surveySourceIdToLocalId.get(f.source_survey_id || f.survey_id) || null;
      }

      const targetStudentId = (f.student_uuid && userUuidToLocalId.get(f.student_uuid))
        || (f.source_student_id && userSourceIdToLocalId.get(f.source_student_id))
        || (f.student_username && userUsernameToLocalId.get(f.student_username.toLowerCase()))
        || defaultStudentId;

      const feedbackUuid = getEntityUuid(f, 'feedback');
      const incomingHash = hashContent({
        message: f.message,
        rating: f.rating || null,
      });

      const mapRes = await client.query(`
        SELECT local_id, content_hash FROM seed_import_map
        WHERE entity_type = 'feedback' AND entity_uuid = $1;
      `, [feedbackUuid]);

      let targetFeedbackId = null;

      if (mapRes.rows.length > 0) {
        const mappedLocalId = mapRes.rows[0].local_id;
        const storedHash = mapRes.rows[0].content_hash;

        const localFRes = await client.query(`
          SELECT id, message, rating FROM feedback WHERE id = $1;
        `, [mappedLocalId]);

        if (localFRes.rows.length > 0) {
          targetFeedbackId = mappedLocalId;
          const localRow = localFRes.rows[0];
          const currentLocalHash = hashContent({
            message: localRow.message,
            rating: localRow.rating || null,
          });

          const hasLocalModifications = (currentLocalHash !== storedHash);
          const hasIncomingChanges = (incomingHash !== storedHash);

          if (hasLocalModifications && !hasIncomingChanges) {
            feedbackPreserved++;
          } else if (!hasLocalModifications && hasIncomingChanges) {
            await client.query(`
              UPDATE feedback
              SET message = $1, rating = $2, survey_id = $3
              WHERE id = $4;
            `, [f.message, f.rating || null, targetSurveyId, targetFeedbackId]);

            await client.query(`
              UPDATE seed_import_map
              SET content_hash = $1, imported_at = NOW()
              WHERE entity_type = 'feedback' AND entity_uuid = $2;
            `, [incomingHash, feedbackUuid]);

            feedbackUpdated++;
          } else {
            feedbackPreserved++;
          }
        }
      }

      if (!targetFeedbackId) {
        const sourceNumericId = f.source_id || f.id;
        let useExplicitId = false;

        if (sourceNumericId && Number.isInteger(Number(sourceNumericId))) {
          const conflictCheck = await client.query(`SELECT id FROM feedback WHERE id = $1;`, [sourceNumericId]);
          if (conflictCheck.rows.length === 0) {
            useExplicitId = true;
          }
        }

        let insertRes;
        if (useExplicitId) {
          insertRes = await client.query(`
            INSERT INTO feedback (id, student_id, survey_id, message, rating, created_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id;
          `, [
            sourceNumericId,
            targetStudentId,
            targetSurveyId,
            f.message,
            f.rating || null,
            f.created_at || new Date().toISOString(),
          ]);
        } else {
          insertRes = await client.query(`
            INSERT INTO feedback (student_id, survey_id, message, rating, created_at)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id;
          `, [
            targetStudentId,
            targetSurveyId,
            f.message,
            f.rating || null,
            f.created_at || new Date().toISOString(),
          ]);
        }

        targetFeedbackId = insertRes.rows[0].id;

        await client.query(`
          INSERT INTO seed_import_map (entity_type, entity_uuid, local_id, content_hash, imported_at)
          VALUES ('feedback', $1, $2, $3, NOW())
          ON CONFLICT (entity_type, entity_uuid) DO UPDATE SET
            local_id = EXCLUDED.local_id,
            content_hash = EXCLUDED.content_hash;
        `, [feedbackUuid, targetFeedbackId, incomingHash]);

        feedbackInserted++;
      }
    }

    // 8. Import & Merge Survey Views
    const rawViews = Array.isArray(seed.survey_views) ? seed.survey_views : [];
    for (const v of rawViews) {
      const targetSurveyId = v.survey_uuid
        ? surveyUuidToLocalId.get(v.survey_uuid)
        : surveySourceIdToLocalId.get(v.source_survey_id || v.survey_id);

      const targetStudentId = (v.student_uuid && userUuidToLocalId.get(v.student_uuid))
        || (v.source_student_id && userSourceIdToLocalId.get(v.source_student_id))
        || (v.student_username && userUsernameToLocalId.get(v.student_username.toLowerCase()))
        || defaultStudentId;

      if (targetSurveyId && targetStudentId) {
        const viewedAt = v.viewed_at || new Date().toISOString();
        const checkView = await client.query(`
          SELECT id FROM survey_views
          WHERE survey_id = $1 AND student_id = $2 AND viewed_at = $3;
        `, [targetSurveyId, targetStudentId, viewedAt]);

        if (checkView.rows.length === 0) {
          await client.query(`
            INSERT INTO survey_views (survey_id, student_id, viewed_at)
            VALUES ($1, $2, $3);
          `, [targetSurveyId, targetStudentId, viewedAt]);
          viewsInserted++;
        }
      }
    }

    // 9. Synchronize all 7 PostgreSQL sequences to highest local ID
    await client.query(`SELECT setval('users_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM users), 1), 1));`);
    await client.query(`SELECT setval('surveys_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM surveys), 1), 1));`);
    await client.query(`SELECT setval('questions_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM questions), 1), 1));`);
    await client.query(`SELECT setval('survey_responses_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM survey_responses), 1), 1));`);
    await client.query(`SELECT setval('answers_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM answers), 1), 1));`);
    await client.query(`SELECT setval('feedback_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM feedback), 1), 1));`);
    await client.query(`SELECT setval('survey_views_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM survey_views), 1), 1));`);

    return {
      users: { inserted: usersInserted, preserved: usersPreserved },
      surveys: { inserted: surveysInserted, updated: surveysUpdated, preserved: surveysPreserved },
      questions: { inserted: questionsInserted, updated: questionsUpdated, preserved: questionsPreserved },
      responses: { inserted: responsesInserted, updated: responsesUpdated, preserved: responsesPreserved },
      answers: { inserted: answersInserted, updated: answersUpdated, preserved: answersPreserved },
      feedback: { inserted: feedbackInserted, updated: feedbackUpdated, preserved: feedbackPreserved },
      views: { inserted: viewsInserted },
      surveyIdMap: Object.fromEntries(surveySourceIdToLocalId),
    };
  });

  console.log(`Successfully merged development seed data:`);
  console.log(` - Users:     ${result.users.inserted} inserted, ${result.users.preserved} preserved`);
  console.log(` - Surveys:   ${result.surveys.inserted} inserted, ${result.surveys.updated} updated, ${result.surveys.preserved} preserved`);
  console.log(` - Questions: ${result.questions.inserted} inserted, ${result.questions.updated} updated, ${result.questions.preserved} preserved`);
  console.log(` - Responses: ${result.responses.inserted} inserted, ${result.responses.updated} updated, ${result.responses.preserved} preserved`);
  console.log(` - Answers:   ${result.answers.inserted} inserted, ${result.answers.updated} updated, ${result.answers.preserved} preserved`);
  console.log(` - Feedback:  ${result.feedback.inserted} inserted, ${result.feedback.updated} updated, ${result.feedback.preserved} preserved`);
  console.log(` - Views:     ${result.views.inserted} inserted`);
  console.log(`--- Seed Merge Complete ---`);

  return result;
}

if (require.main === module) {
  const customPath = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
  importSeedData(customPath)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed import failed:', err.message || err);
      process.exit(1);
    });
}

module.exports = { importSeedData, getEntityUuid };
