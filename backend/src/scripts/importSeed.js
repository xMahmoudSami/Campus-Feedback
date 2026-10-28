const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../config/db');
const { seedDatabase } = require('./seed');
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
 * If incoming item lacks a UUID (legacy seed format), computes a deterministic UUIDv5-equivalent.
 */
function getEntityUuid(item, entityType) {
  if (item.uuid && typeof item.uuid === 'string' && item.uuid.trim()) {
    return item.uuid.trim();
  }
  const identity = `${entityType}:${item.source_id || item.id || ''}:${item.title || item.question_text || item.message || ''}`;
  const hex = crypto.createHash('sha256').update(identity).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Imports development seed data and merges it safely across team members' databases.
 *
 * Safe-Merging Strategy:
 * 1. Checks seed_import_map for stable UUID mapping.
 * 2. If survey UUID already imported:
 *    - Compares content hash of local record against stored import hash.
 *    - If local record was modified and seed also changed -> raises Conflict and rolls back transaction.
 *    - If local record was modified and seed did not change -> preserves local modifications.
 *    - If local record was untouched and seed updated -> safely updates local survey.
 * 3. If survey UUID is new to this database:
 *    - Checks if the numeric source_id is already occupied by an existing, unrelated survey.
 *    - If source_id conflicts, allocates a new local ID via PostgreSQL sequence nextval.
 *    - If source_id is free, inserts and preserves identity.
 *    - Records (entity_type, uuid) -> local_id in seed_import_map.
 * 4. Resolves foreign keys for questions and feedback using the survey UUID mapping table.
 * 5. Re-synchronizes PostgreSQL primary key sequences.
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
  if (!seed || typeof seed !== 'object') {
    throw new Error('Invalid seed file: Root must be a valid JSON object.');
  }

  // 1. Ensure official demo accounts exist so foreign keys remain valid
  const accounts = await seedDatabase();
  const adminId = accounts.admin.id;
  const studentId = accounts.student.id;

  const result = await db.withTransaction(async (client) => {
    await ensureSeedMapTable(client);

    const surveyUuidToLocalId = new Map();
    const surveySourceIdToLocalId = new Map();

    let surveysInserted = 0;
    let surveysUpdated = 0;
    let surveysPreserved = 0;

    let questionsInserted = 0;
    let questionsUpdated = 0;
    let questionsPreserved = 0;

    let feedbackInserted = 0;
    let feedbackUpdated = 0;
    let feedbackPreserved = 0;

    // 2. Import & Merge Surveys
    const rawSurveys = Array.isArray(seed.surveys) ? seed.surveys : [];
    for (const s of rawSurveys) {
      const surveyUuid = getEntityUuid(s, 'surveys');
      const incomingHash = hashContent({
        title: s.title,
        description: s.description || '',
        status: s.status,
        due_date: s.due_date ? new Date(s.due_date).toISOString() : null,
      });

      // Check if this survey UUID was previously imported into this database
      const mapRes = await client.query(`
        SELECT local_id, content_hash FROM seed_import_map
        WHERE entity_type = 'surveys' AND entity_uuid = $1;
      `, [surveyUuid]);

      let targetLocalId = null;

      if (mapRes.rows.length > 0) {
        // Previously imported: Check whether local survey still exists
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
            // Conflict: Both local developer and remote seed modified this survey!
            throw new Error(
              `Conflict detected for survey '${s.title}' (UUID: ${surveyUuid}): Local record ID ${targetLocalId} was modified locally, and incoming seed also contains conflicting updates. Transaction aborted to prevent data loss.`
            );
          }

          if (hasLocalModifications && !hasIncomingChanges) {
            // Preserve local changes made by developer
            surveysPreserved++;
          } else if (!hasLocalModifications && hasIncomingChanges) {
            // Safe update from incoming seed
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
            // Identical, no-op
            surveysPreserved++;
          }
        }
      }

      if (!targetLocalId) {
        // Brand new survey to this local database
        const creatorId = s.creator_role === 'student' ? studentId : adminId;
        const sourceNumericId = s.source_id || s.id;

        // Check if sourceNumericId is already occupied locally by another unrelated survey
        let useExplicitId = false;
        if (sourceNumericId && Number.isInteger(Number(sourceNumericId))) {
          const conflictCheck = await client.query(`SELECT id FROM surveys WHERE id = $1;`, [sourceNumericId]);
          if (conflictCheck.rows.length === 0) {
            useExplicitId = true;
          }
        }

        let insertRes;
        if (useExplicitId) {
          // No ID collision: Insert with source_id
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
          // ID collision with an existing local survey! Allocate a new local ID via sequence
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

        // Record the mapping of this external UUID to the newly established local ID
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

    // 3. Import & Merge Questions
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
        // Check if numeric source_id is occupied
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
    }

    // 4. Import & Merge Feedback
    const rawFeedback = Array.isArray(seed.feedback) ? seed.feedback : [];
    for (const f of rawFeedback) {
      let targetSurveyId = null;
      if (f.survey_uuid) {
        targetSurveyId = surveyUuidToLocalId.get(f.survey_uuid) || null;
      } else if (f.source_survey_id || f.survey_id) {
        targetSurveyId = surveySourceIdToLocalId.get(f.source_survey_id || f.survey_id) || null;
      }

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
            studentId,
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
            studentId,
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

    // 5. Synchronize all PostgreSQL sequences to highest local ID
    await client.query(`SELECT setval('surveys_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM surveys), 1), 1));`);
    await client.query(`SELECT setval('questions_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM questions), 1), 1));`);
    await client.query(`SELECT setval('feedback_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM feedback), 1), 1));`);

    return {
      surveys: { inserted: surveysInserted, updated: surveysUpdated, preserved: surveysPreserved },
      questions: { inserted: questionsInserted, updated: questionsUpdated, preserved: questionsPreserved },
      feedback: { inserted: feedbackInserted, updated: feedbackUpdated, preserved: feedbackPreserved },
      surveyIdMap: Object.fromEntries(surveySourceIdToLocalId),
    };
  });

  console.log(`Successfully merged development seed data:`);
  console.log(` - Surveys:   ${result.surveys.inserted} inserted, ${result.surveys.updated} updated, ${result.surveys.preserved} preserved`);
  console.log(` - Questions: ${result.questions.inserted} inserted, ${result.questions.updated} updated, ${result.questions.preserved} preserved`);
  console.log(` - Feedback:  ${result.feedback.inserted} inserted, ${result.feedback.updated} updated, ${result.feedback.preserved} preserved`);
  console.log(`--- Seed Merge Complete ---`);

  return result;
}

if (require.main === module) {
  importSeedData()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed import failed:', err.message || err);
      process.exit(1);
    });
}

module.exports = { importSeedData, getEntityUuid };
