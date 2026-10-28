const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../config/db');

/**
 * Computes deterministic content hash for change/conflict tracking.
 */
function hashContent(obj) {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

/**
 * Ensures seed_import_map exists.
 */
async function ensureSeedMapTable(clientOrDb) {
  await clientOrDb.query(`
    CREATE TABLE IF NOT EXISTS seed_import_map (
      entity_type  VARCHAR(32) NOT NULL,
      entity_uuid  UUID NOT NULL,
      local_id     INT NOT NULL,
      content_hash VARCHAR(64) NOT NULL,
      imported_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (entity_type, entity_uuid)
    );
    CREATE INDEX IF NOT EXISTS idx_seed_import_local ON seed_import_map(entity_type, local_id);
  `);
}

function resolveSeedFilePath() {
  const candidatePaths = [
    process.env.SEED_FILE_PATH,
    path.resolve(__dirname, '../../../database/seeds/dev_seed.json'),
    path.resolve('/app/database/seeds/dev_seed.json'),
    path.resolve(__dirname, '../seeds/dev_seed.json'),
  ].filter(Boolean);

  for (const candidate of candidatePaths) {
    const dir = path.dirname(candidate);
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      return candidate;
    } catch (_) {}
  }

  return path.resolve(__dirname, '../seeds/dev_seed.json');
}

/**
 * Loads existing seed file if present, to preserve previously assigned UUIDs.
 */
function loadExistingSeedFile(seedPath) {
  try {
    if (fs.existsSync(seedPath)) {
      const raw = fs.readFileSync(seedPath, 'utf8');
      return JSON.parse(raw);
    }
  } catch (_) {}
  return null;
}

/**
 * Exports approved development/test data (users, surveys, questions, responses, answers, feedback, views)
 * to a version-controlled JSON seed file with stable UUIDs.
 *
 * Rules:
 * - All approved development surveys and their questions are exported.
 * - Survey responses and answers submitted by students are exported.
 * - Feedback comments and survey view counts are exported.
 * - Relevant student and admin accounts are exported without exposing plaintext passwords or secrets.
 */
async function exportSeedData(options = {}) {
  const targetPath = options.outputPath || resolveSeedFilePath();
  console.log(`--- Exporting Development Seed Data to: ${targetPath} ---`);

  const client = typeof db.getClient === 'function' ? await db.getClient() : await db.pool.connect();
  try {
    await ensureSeedMapTable(client);

    const existingSeed = loadExistingSeedFile(targetPath);

    // Existing UUID lookup maps from database
    const mappedUuidsRes = await client.query(`
      SELECT entity_type, entity_uuid, local_id FROM seed_import_map;
    `);
    const dbUuidByEntityAndId = new Map();
    for (const row of mappedUuidsRes.rows) {
      dbUuidByEntityAndId.set(`${row.entity_type}:${row.local_id}`, row.entity_uuid);
    }

    // Existing UUID lookup maps from prior seed file
    const fileUuidMap = new Map();
    if (existingSeed) {
      const entities = ['users', 'surveys', 'questions', 'responses', 'answers', 'feedback'];
      for (const ent of entities) {
        (existingSeed[ent] || []).forEach((item) => {
          if (item.source_id && item.uuid) {
            fileUuidMap.set(`${ent}:${item.source_id}`, item.uuid);
          }
        });
      }
    }

    // Helper to get or generate stable UUID
    function getStableUuid(entityType, sourceId) {
      const dbUuid = dbUuidByEntityAndId.get(`${entityType}:${sourceId}`);
      const fileUuid = fileUuidMap.get(`${entityType}:${sourceId}`);
      return dbUuid || fileUuid || crypto.randomUUID();
    }

    // 1. Export Approved Surveys
    const surveysQuery = options.surveyIds && options.surveyIds.length > 0
      ? `SELECT s.*, u.username as creator_username, u.role as creator_role FROM surveys s
         JOIN users u ON s.created_by = u.id
         WHERE s.id = ANY($1) AND u.role = 'admin'
         ORDER BY s.id ASC;`
      : `SELECT s.*, u.username as creator_username, u.role as creator_role FROM surveys s
         JOIN users u ON s.created_by = u.id
         WHERE u.role = 'admin'
         ORDER BY s.id ASC;`;

    const surveysParams = options.surveyIds && options.surveyIds.length > 0 ? [options.surveyIds] : [];
    const surveysRes = await client.query(surveysQuery, surveysParams);

    const exportedSurveys = [];
    const surveyLocalIdToUuid = new Map();

    for (const row of surveysRes.rows) {
      const stableUuid = getStableUuid('surveys', row.id);
      surveyLocalIdToUuid.set(row.id, stableUuid);

      const contentObj = {
        title: row.title,
        description: row.description || '',
        status: row.status,
        due_date: row.due_date ? new Date(row.due_date).toISOString() : null,
      };
      const hash = hashContent(contentObj);

      await client.query(`
        INSERT INTO seed_import_map (entity_type, entity_uuid, local_id, content_hash, imported_at)
        VALUES ('surveys', $1, $2, $3, NOW())
        ON CONFLICT (entity_type, entity_uuid) DO UPDATE SET
          local_id = EXCLUDED.local_id,
          content_hash = EXCLUDED.content_hash;
      `, [stableUuid, row.id, hash]);

      exportedSurveys.push({
        uuid: stableUuid,
        source_id: row.id,
        title: row.title,
        description: row.description || '',
        status: row.status,
        due_date: row.due_date ? new Date(row.due_date).toISOString() : null,
        created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
        published_at: row.published_at ? new Date(row.published_at).toISOString() : null,
        closed_at: row.closed_at ? new Date(row.closed_at).toISOString() : null,
        created_by: row.created_by,
        creator_username: row.creator_username || 'admin',
        creator_role: row.creator_role || 'admin',
      });
    }

    const exportedSurveyIds = exportedSurveys.map((s) => s.source_id);

    // 2. Export Questions (Belonging only to the approved exported surveys)
    const exportedQuestions = [];
    const questionLocalIdToUuid = new Map();
    if (exportedSurveyIds.length > 0) {
      const questionsRes = await client.query(`
        SELECT id, survey_id, question_text, question_type, options, position, is_required
        FROM questions
        WHERE survey_id = ANY($1)
        ORDER BY survey_id ASC, position ASC, id ASC;
      `, [exportedSurveyIds]);

      for (const row of questionsRes.rows) {
        const stableUuid = getStableUuid('questions', row.id);
        questionLocalIdToUuid.set(row.id, stableUuid);
        const surveyUuid = surveyLocalIdToUuid.get(row.survey_id);

        const contentObj = {
          question_text: row.question_text,
          question_type: row.question_type,
          options: row.options || null,
          position: row.position || 1,
          is_required: row.is_required !== false,
        };
        const hash = hashContent(contentObj);

        await client.query(`
          INSERT INTO seed_import_map (entity_type, entity_uuid, local_id, content_hash, imported_at)
          VALUES ('questions', $1, $2, $3, NOW())
          ON CONFLICT (entity_type, entity_uuid) DO UPDATE SET
            local_id = EXCLUDED.local_id,
            content_hash = EXCLUDED.content_hash;
        `, [stableUuid, row.id, hash]);

        exportedQuestions.push({
          uuid: stableUuid,
          source_id: row.id,
          source_survey_id: row.survey_id,
          survey_uuid: surveyUuid,
          question_text: row.question_text,
          question_type: row.question_type,
          options: row.options,
          position: row.position || 1,
          is_required: row.is_required !== false,
        });
      }
    }

    // 3. Export Survey Responses
    const exportedResponses = [];
    const responseLocalIdToUuid = new Map();
    const relevantUserIds = new Set();

    // Include creators of surveys
    exportedSurveys.forEach((s) => relevantUserIds.add(s.created_by));

    if (exportedSurveyIds.length > 0) {
      const responsesRes = await client.query(`
        SELECT sr.id, sr.survey_id, sr.student_id, sr.status, sr.started_at, sr.completed_at,
               u.username as student_username
        FROM survey_responses sr
        JOIN users u ON sr.student_id = u.id
        WHERE sr.survey_id = ANY($1)
        ORDER BY sr.id ASC;
      `, [exportedSurveyIds]);

      for (const row of responsesRes.rows) {
        const stableUuid = getStableUuid('survey_responses', row.id);
        responseLocalIdToUuid.set(row.id, stableUuid);
        relevantUserIds.add(row.student_id);

        const contentObj = {
          status: row.status,
          completed_at: row.completed_at ? new Date(row.completed_at).toISOString() : null,
        };
        const hash = hashContent(contentObj);

        await client.query(`
          INSERT INTO seed_import_map (entity_type, entity_uuid, local_id, content_hash, imported_at)
          VALUES ('survey_responses', $1, $2, $3, NOW())
          ON CONFLICT (entity_type, entity_uuid) DO UPDATE SET
            local_id = EXCLUDED.local_id,
            content_hash = EXCLUDED.content_hash;
        `, [stableUuid, row.id, hash]);

        exportedResponses.push({
          uuid: stableUuid,
          source_id: row.id,
          source_survey_id: row.survey_id,
          survey_uuid: surveyLocalIdToUuid.get(row.survey_id),
          source_student_id: row.student_id,
          student_username: row.student_username,
          status: row.status,
          started_at: row.started_at ? new Date(row.started_at).toISOString() : new Date().toISOString(),
          completed_at: row.completed_at ? new Date(row.completed_at).toISOString() : null,
        });
      }
    }

    // 4. Export Answers (Belonging to exported survey responses)
    const exportedAnswers = [];
    const exportedResponseIds = exportedResponses.map((r) => r.source_id);
    if (exportedResponseIds.length > 0) {
      const answersRes = await client.query(`
        SELECT a.id, a.response_id, a.question_id, a.answer_text, a.rating
        FROM answers a
        WHERE a.response_id = ANY($1)
        ORDER BY a.response_id ASC, a.id ASC;
      `, [exportedResponseIds]);

      for (const row of answersRes.rows) {
        const stableUuid = getStableUuid('answers', row.id);
        const contentObj = {
          answer_text: row.answer_text,
          rating: row.rating,
        };
        const hash = hashContent(contentObj);

        await client.query(`
          INSERT INTO seed_import_map (entity_type, entity_uuid, local_id, content_hash, imported_at)
          VALUES ('answers', $1, $2, $3, NOW())
          ON CONFLICT (entity_type, entity_uuid) DO UPDATE SET
            local_id = EXCLUDED.local_id,
            content_hash = EXCLUDED.content_hash;
        `, [stableUuid, row.id, hash]);

        exportedAnswers.push({
          uuid: stableUuid,
          source_id: row.id,
          source_response_id: row.response_id,
          response_uuid: responseLocalIdToUuid.get(row.response_id),
          source_question_id: row.question_id,
          question_uuid: questionLocalIdToUuid.get(row.question_id),
          answer_text: row.answer_text,
          rating: row.rating,
        });
      }
    }

    // 5. Export Feedback (Official demo student development feedback)
    const feedbackQuery = exportedSurveyIds.length > 0
      ? `SELECT f.id, f.student_id, f.survey_id, f.message, f.rating, f.created_at,
                u.username as student_username
         FROM feedback f
         JOIN users u ON f.student_id = u.id
         WHERE (f.survey_id = ANY($1) OR f.survey_id IS NULL)
           AND u.username = 'student'
         ORDER BY f.id ASC;`
      : `SELECT f.id, f.student_id, f.survey_id, f.message, f.rating, f.created_at,
                u.username as student_username
         FROM feedback f
         JOIN users u ON f.student_id = u.id
         WHERE u.username = 'student'
         ORDER BY f.id ASC;`;

    const feedbackParams = exportedSurveyIds.length > 0 ? [exportedSurveyIds] : [];
    const feedbackRes = await client.query(feedbackQuery, feedbackParams);

    const exportedFeedback = [];
    for (const row of feedbackRes.rows) {
      if (row.survey_id && !surveyLocalIdToUuid.has(row.survey_id)) {
        continue;
      }

      relevantUserIds.add(row.student_id);
      const stableUuid = getStableUuid('feedback', row.id);

      const contentObj = {
        message: row.message,
        rating: row.rating || null,
      };
      const hash = hashContent(contentObj);

      await client.query(`
        INSERT INTO seed_import_map (entity_type, entity_uuid, local_id, content_hash, imported_at)
        VALUES ('feedback', $1, $2, $3, NOW())
        ON CONFLICT (entity_type, entity_uuid) DO UPDATE SET
          local_id = EXCLUDED.local_id,
          content_hash = EXCLUDED.content_hash;
      `, [stableUuid, row.id, hash]);

      exportedFeedback.push({
        uuid: stableUuid,
        source_id: row.id,
        source_student_id: row.student_id,
        student_username: row.student_username,
        source_survey_id: row.survey_id || null,
        survey_uuid: row.survey_id ? surveyLocalIdToUuid.get(row.survey_id) : null,
        message: row.message,
        rating: row.rating || null,
        created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      });
    }

    // 6. Export Survey Views (Used for admin dashboard completion and view rates)
    const exportedViews = [];
    if (exportedSurveyIds.length > 0) {
      const viewsRes = await client.query(`
        SELECT sv.id, sv.survey_id, sv.student_id, sv.viewed_at,
               u.username as student_username
        FROM survey_views sv
        JOIN users u ON sv.student_id = u.id
        WHERE sv.survey_id = ANY($1)
        ORDER BY sv.id ASC;
      `, [exportedSurveyIds]);

      for (const row of viewsRes.rows) {
        relevantUserIds.add(row.student_id);
        exportedViews.push({
          source_id: row.id,
          source_survey_id: row.survey_id,
          survey_uuid: surveyLocalIdToUuid.get(row.survey_id),
          source_student_id: row.student_id,
          student_username: row.student_username,
          viewed_at: row.viewed_at ? new Date(row.viewed_at).toISOString() : new Date().toISOString(),
        });
      }
    }

    // 7. Export Relevant Users (Students and Admins associated with the approved dataset)
    // Always include official demo users 'admin' and 'student'
    const usersRes = await client.query(`
      SELECT id, full_name, email, username, role, created_at
      FROM users
      ORDER BY id ASC;
    `);

    const exportedUsers = [];
    for (const row of usersRes.rows) {
      const isOfficialDemo = (row.username === 'admin' || row.username === 'student');
      const isRelevant = relevantUserIds.has(row.id);

      if (isOfficialDemo || (isRelevant && (row.role === 'student' || row.role === 'admin'))) {
        const stableUuid = getStableUuid('users', row.id);
        const contentObj = {
          full_name: row.full_name,
          email: row.email,
          username: row.username,
          role: row.role,
        };
        const hash = hashContent(contentObj);

        await client.query(`
          INSERT INTO seed_import_map (entity_type, entity_uuid, local_id, content_hash, imported_at)
          VALUES ('users', $1, $2, $3, NOW())
          ON CONFLICT (entity_type, entity_uuid) DO UPDATE SET
            local_id = EXCLUDED.local_id,
            content_hash = EXCLUDED.content_hash;
        `, [stableUuid, row.id, hash]);

        exportedUsers.push({
          uuid: stableUuid,
          source_id: row.id,
          full_name: row.full_name,
          email: row.email,
          username: row.username,
          role: row.role,
          created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
        });
      }
    }

    // Link user UUIDs into exported surveys, responses, feedback, and views
    const userLocalIdToUuid = new Map(exportedUsers.map((u) => [u.source_id, u.uuid]));
    exportedSurveys.forEach((s) => {
      s.creator_uuid = userLocalIdToUuid.get(s.created_by) || null;
    });
    exportedResponses.forEach((r) => {
      r.student_uuid = userLocalIdToUuid.get(r.source_student_id) || null;
    });
    exportedFeedback.forEach((f) => {
      f.student_uuid = userLocalIdToUuid.get(f.source_student_id) || null;
    });
    exportedViews.forEach((v) => {
      v.student_uuid = userLocalIdToUuid.get(v.source_student_id) || null;
    });

    const seedPayload = {
      version: '2.1',
      project: 'Campus Feedback',
      exported_at: new Date().toISOString(),
      description: 'Approved complete development seed dataset for Campus Feedback System',
      users: exportedUsers,
      surveys: exportedSurveys,
      questions: exportedQuestions,
      responses: exportedResponses,
      answers: exportedAnswers,
      feedback: exportedFeedback,
      survey_views: exportedViews,
    };

    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    fs.writeFileSync(targetPath, JSON.stringify(seedPayload, null, 2), 'utf8');

    // Also mirror to secondary fallback path inside backend/src/seeds if different
    try {
      const fallbackPath = path.resolve(__dirname, '../seeds/dev_seed.json');
      if (fallbackPath !== targetPath) {
        const fallbackDir = path.dirname(fallbackPath);
        if (!fs.existsSync(fallbackDir)) fs.mkdirSync(fallbackDir, { recursive: true });
        fs.writeFileSync(fallbackPath, JSON.stringify(seedPayload, null, 2), 'utf8');
      }
    } catch (_) {}

    console.log(`Successfully exported development seed:`);
    console.log(` - ${seedPayload.users.length} users`);
    console.log(` - ${seedPayload.surveys.length} surveys`);
    console.log(` - ${seedPayload.questions.length} questions`);
    console.log(` - ${seedPayload.responses.length} responses`);
    console.log(` - ${seedPayload.answers.length} answers`);
    console.log(` - ${seedPayload.feedback.length} feedback entries`);
    console.log(` - ${seedPayload.survey_views.length} survey views`);
    console.log(`--- Seed Export Complete ---`);

    return seedPayload;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  const customPath = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
  exportSeedData({ outputPath: customPath })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed export failed:', err.message || err);
      process.exit(1);
    });
}

module.exports = { exportSeedData, hashContent, ensureSeedMapTable };
