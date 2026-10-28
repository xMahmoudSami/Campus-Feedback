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
 * Exports approved development/test data (surveys, questions, sample feedback)
 * to a version-controlled JSON seed file with stable UUIDs.
 *
 * Safety Rules:
 * - Only approved development surveys created by 'admin' are exported.
 * - Only questions belonging to exported surveys are exported.
 * - Only feedback created by official demo 'student' or tied to approved demo surveys is exported.
 * - Real user accounts, passwords, JWT secrets, and personal emails are never exported.
 */
async function exportSeedData(options = {}) {
  const targetPath = options.outputPath || resolveSeedFilePath();
  console.log(`--- Exporting Development Seed Data to: ${targetPath} ---`);

  const client = await db.getClient();
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
    const fileSurveyUuidBySourceId = new Map();
    const fileQuestionUuidBySourceId = new Map();
    const fileFeedbackUuidBySourceId = new Map();

    if (existingSeed) {
      (existingSeed.surveys || []).forEach((s) => {
        if (s.source_id && s.uuid) fileSurveyUuidBySourceId.set(s.source_id, s.uuid);
      });
      (existingSeed.questions || []).forEach((q) => {
        if (q.source_id && q.uuid) fileQuestionUuidBySourceId.set(q.source_id, q.uuid);
      });
      (existingSeed.feedback || []).forEach((f) => {
        if (f.source_id && f.uuid) fileFeedbackUuidBySourceId.set(f.source_id, f.uuid);
      });
    }

    // 1. Export Approved Development Surveys (Created by 'admin' role)
    const surveysQuery = options.surveyIds && options.surveyIds.length > 0
      ? `SELECT s.*, u.role as creator_role FROM surveys s
         JOIN users u ON s.created_by = u.id
         WHERE s.id = ANY($1) AND u.role = 'admin'
         ORDER BY s.id ASC;`
      : `SELECT s.*, u.role as creator_role FROM surveys s
         JOIN users u ON s.created_by = u.id
         WHERE u.role = 'admin'
         ORDER BY s.id ASC;`;

    const surveysParams = options.surveyIds && options.surveyIds.length > 0 ? [options.surveyIds] : [];
    const surveysRes = await client.query(surveysQuery, surveysParams);

    const exportedSurveys = [];
    const surveyLocalIdToUuid = new Map();

    for (const row of surveysRes.rows) {
      const dbUuid = dbUuidByEntityAndId.get(`surveys:${row.id}`);
      const fileUuid = fileSurveyUuidBySourceId.get(row.id);
      const stableUuid = dbUuid || fileUuid || crypto.randomUUID();

      surveyLocalIdToUuid.set(row.id, stableUuid);

      const contentObj = {
        title: row.title,
        description: row.description || '',
        status: row.status,
        due_date: row.due_date ? new Date(row.due_date).toISOString() : null,
      };
      const hash = hashContent(contentObj);

      // Record in local seed_import_map for persistence
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
        creator_role: 'admin',
      });
    }

    const exportedSurveyIds = exportedSurveys.map((s) => s.source_id);

    // 2. Export Questions (Belonging only to the approved exported surveys)
    const exportedQuestions = [];
    if (exportedSurveyIds.length > 0) {
      const questionsRes = await client.query(`
        SELECT id, survey_id, question_text, question_type, options, position, is_required
        FROM questions
        WHERE survey_id = ANY($1)
        ORDER BY survey_id ASC, position ASC, id ASC;
      `, [exportedSurveyIds]);

      for (const row of questionsRes.rows) {
        const dbUuid = dbUuidByEntityAndId.get(`questions:${row.id}`);
        const fileUuid = fileQuestionUuidBySourceId.get(row.id);
        const stableUuid = dbUuid || fileUuid || crypto.randomUUID();
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

    // 3. Export Sample Feedback (Created by official demo student account, never real user accounts)
    const feedbackRes = await client.query(`
      SELECT f.id, f.survey_id, f.message, f.rating, f.created_at
      FROM feedback f
      JOIN users u ON f.student_id = u.id
      WHERE u.username = 'student' AND u.role = 'student'
      ORDER BY f.id ASC;
    `);

    const exportedFeedback = [];
    for (const row of feedbackRes.rows) {
      // If linked to a survey, only export if the survey is in the approved export list
      let surveyUuid = null;
      if (row.survey_id) {
        if (!surveyLocalIdToUuid.has(row.survey_id)) {
          // Do not export feedback tied to private/unexported surveys
          continue;
        }
        surveyUuid = surveyLocalIdToUuid.get(row.survey_id);
      }

      const dbUuid = dbUuidByEntityAndId.get(`feedback:${row.id}`);
      const fileUuid = fileFeedbackUuidBySourceId.get(row.id);
      const stableUuid = dbUuid || fileUuid || crypto.randomUUID();

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
        source_survey_id: row.survey_id || null,
        survey_uuid: surveyUuid,
        message: row.message,
        rating: row.rating || null,
        created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
        student_role: 'student',
      });
    }

    const seedPayload = {
      version: '2.0',
      project: 'Campus Feedback',
      exported_at: new Date().toISOString(),
      description: 'Approved development seed dataset for Campus Feedback System',
      surveys: exportedSurveys,
      questions: exportedQuestions,
      feedback: exportedFeedback,
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
    console.log(` - ${seedPayload.surveys.length} approved surveys`);
    console.log(` - ${seedPayload.questions.length} questions`);
    console.log(` - ${seedPayload.feedback.length} sample feedback entries`);
    console.log(`--- Seed Export Complete ---`);

    return seedPayload;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  exportSeedData()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed export failed:', err.message || err);
      process.exit(1);
    });
}

module.exports = { exportSeedData, hashContent, ensureSeedMapTable };
