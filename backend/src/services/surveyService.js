const db = require('../config/db');
const { NotFoundError, ForbiddenError, ValidationError } = require('../middleware/errorHandler');

/**
 * Retrieves surveys based on user role.
 * - Students: only published surveys.
 * - Admins: all surveys, with optional status filter.
 * Includes question count, response count, and student submission status.
 *
 * @param {object} user - Authenticated user { id, role }
 * @param {object} [filters] - Query filters { status }
 */
async function getSurveys(user, filters = {}) {
  const isStudent = user.role === 'student';
  const params = [];
  let whereClauses = [];

  if (isStudent) {
    whereClauses.push(`s.status = 'published'`);
  } else if (filters.status) {
    if (!['draft', 'published', 'closed'].includes(filters.status)) {
      throw new ValidationError("Invalid status filter. Must be 'draft', 'published', or 'closed'.");
    }
    params.push(filters.status);
    whereClauses.push(`s.status = $${params.length}`);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // We check if student has submitted for each survey
  const studentIdParamIndex = params.length + 1;
  params.push(user.id);

  const queryText = `
    SELECT 
      s.id,
      s.title,
      s.description,
      s.status,
      s.created_by,
      s.created_at,
      s.updated_at,
      u.username AS creator_username,
      (SELECT COUNT(*)::int FROM questions q WHERE q.survey_id = s.id) AS question_count,
      (SELECT COUNT(*)::int FROM survey_responses sr WHERE sr.survey_id = s.id) AS response_count,
      (SELECT COUNT(*)::int FROM survey_views sv WHERE sv.survey_id = s.id) AS view_count,
      EXISTS(
        SELECT 1 FROM survey_responses sr2 
        WHERE sr2.survey_id = s.id AND sr2.student_id = $${studentIdParamIndex}
      ) AS has_submitted
    FROM surveys s
    LEFT JOIN users u ON s.created_by = u.id
    ${whereSql}
    ORDER BY s.created_at DESC;
  `;

  const result = await db.query(queryText, params);
  return result.rows;
}

/**
 * Retrieves a single survey by ID, along with its questions.
 * Enforces role visibility and logs genuine student views.
 *
 * @param {number} surveyId
 * @param {object} user - Authenticated user
 * @param {object} [requestMeta] - { ipAddress, userAgent }
 */
async function getSurveyById(surveyId, user, requestMeta = {}) {
  const surveyRes = await db.query(
    `SELECT s.*, u.username AS creator_username
     FROM surveys s
     LEFT JOIN users u ON s.created_by = u.id
     WHERE s.id = $1`,
    [surveyId]
  );

  const survey = surveyRes.rows[0];
  if (!survey) {
    throw new NotFoundError(`Survey with ID ${surveyId} not found.`);
  }

  // Student visibility rule: students cannot access draft surveys
  if (user.role === 'student' && survey.status === 'draft') {
    throw new ForbiddenError('Students are not allowed to view draft surveys.');
  }

  // Fetch questions
  const questionsRes = await db.query(
    `SELECT id, survey_id, question_text, question_type, options, is_required, order_index
     FROM questions
     WHERE survey_id = $1
     ORDER BY order_index ASC, id ASC`,
    [surveyId]
  );

  // Check if student has already submitted
  let hasSubmitted = false;
  if (user.role === 'student') {
    const submissionRes = await db.query(
      `SELECT id, submitted_at FROM survey_responses WHERE survey_id = $1 AND student_id = $2`,
      [surveyId, user.id]
    );
    hasSubmitted = submissionRes.rows.length > 0;

    // Log genuine student view if viewing a published survey
    if (survey.status === 'published') {
      try {
        await db.query(
          `INSERT INTO survey_views (survey_id, user_id, ip_address, user_agent)
           VALUES ($1, $2, $3, $4)`,
          [surveyId, user.id, requestMeta.ipAddress || null, requestMeta.userAgent || null]
        );
      } catch (viewErr) {
        // Logging view should not fail the read operation
        console.warn('[Survey View Log Warning]', viewErr.message);
      }
    }
  }

  return {
    ...survey,
    has_submitted: hasSubmitted,
    questions: questionsRes.rows,
  };
}

/**
 * Creates a new survey with associated questions inside a transaction.
 * Admin only.
 *
 * @param {object} surveyData - { title, description, status, questions }
 * @param {number} adminId - User ID of creating admin
 */
async function createSurvey(surveyData, adminId) {
  const { title, description = '', status = 'draft', questions = [] } = surveyData;

  return await db.withTransaction(async (client) => {
    // 1. Insert survey
    const surveyInsertRes = await client.query(
      `INSERT INTO surveys (title, description, status, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [title.trim(), description ? description.trim() : null, status, adminId]
    );
    const newSurvey = surveyInsertRes.rows[0];

    // 2. Insert questions if provided
    const insertedQuestions = [];
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const qRes = await client.query(
        `INSERT INTO questions (survey_id, question_text, question_type, options, is_required, order_index)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          newSurvey.id,
          q.question_text.trim(),
          q.question_type,
          q.question_type === 'single_choice' ? JSON.stringify(q.options || []) : '[]',
          q.is_required !== undefined ? Boolean(q.is_required) : true,
          q.order_index !== undefined ? Number(q.order_index) : i,
        ]
      );
      insertedQuestions.push(qRes.rows[0]);
    }

    return {
      ...newSurvey,
      questions: insertedQuestions,
    };
  });
}

/**
 * Updates a survey's details (title, description).
 * Admin only.
 *
 * @param {number} surveyId
 * @param {object} updateData - { title, description }
 */
async function updateSurvey(surveyId, updateData) {
  const { title, description } = updateData;

  const existingRes = await db.query(`SELECT id, status FROM surveys WHERE id = $1`, [surveyId]);
  if (existingRes.rows.length === 0) {
    throw new NotFoundError(`Survey with ID ${surveyId} not found.`);
  }

  const fields = [];
  const params = [surveyId];

  if (title !== undefined) {
    if (!title || typeof title !== 'string' || !title.trim()) {
      throw new ValidationError("Title must be a non-empty string.");
    }
    params.push(title.trim());
    fields.push(`title = $${params.length}`);
  }

  if (description !== undefined) {
    params.push(typeof description === 'string' ? description.trim() : null);
    fields.push(`description = $${params.length}`);
  }

  if (fields.length === 0) {
    throw new ValidationError("No valid fields provided to update.");
  }

  fields.push(`updated_at = CURRENT_TIMESTAMP`);

  const updateRes = await db.query(
    `UPDATE surveys
     SET ${fields.join(', ')}
     WHERE id = $1
     RETURNING *`,
    params
  );

  return updateRes.rows[0];
}

/**
 * Updates a survey's status ('draft', 'published', 'closed').
 * Admin only.
 *
 * @param {number} surveyId
 * @param {string} newStatus
 */
async function updateSurveyStatus(surveyId, newStatus) {
  if (!['draft', 'published', 'closed'].includes(newStatus)) {
    throw new ValidationError("Status must be one of: 'draft', 'published', 'closed'.");
  }

  const existingRes = await db.query(`SELECT id, status FROM surveys WHERE id = $1`, [surveyId]);
  if (existingRes.rows.length === 0) {
    throw new NotFoundError(`Survey with ID ${surveyId} not found.`);
  }

  const updateRes = await db.query(
    `UPDATE surveys
     SET status = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [surveyId, newStatus]
  );

  return updateRes.rows[0];
}

/**
 * Deletes a survey and its associated records cleanly.
 * Admin only.
 *
 * @param {number} surveyId
 */
async function deleteSurvey(surveyId) {
  const existingRes = await db.query(`SELECT id, title FROM surveys WHERE id = $1`, [surveyId]);
  if (existingRes.rows.length === 0) {
    throw new NotFoundError(`Survey with ID ${surveyId} not found.`);
  }

  return await db.withTransaction(async (client) => {
    // Delete survey responses and views explicitly if cascade is not configured in DB
    await client.query(`DELETE FROM survey_views WHERE survey_id = $1`, [surveyId]);
    await client.query(
      `DELETE FROM answers WHERE response_id IN (SELECT id FROM survey_responses WHERE survey_id = $1)`,
      [surveyId]
    );
    await client.query(`DELETE FROM survey_responses WHERE survey_id = $1`, [surveyId]);
    await client.query(`DELETE FROM questions WHERE survey_id = $1`, [surveyId]);
    await client.query(`DELETE FROM surveys WHERE id = $1`, [surveyId]);

    return { id: surveyId, message: `Survey '${existingRes.rows[0].title}' successfully deleted.` };
  });
}

module.exports = {
  getSurveys,
  getSurveyById,
  createSurvey,
  updateSurvey,
  updateSurveyStatus,
  deleteSurvey,
};
