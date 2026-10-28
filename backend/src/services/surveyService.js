const db = require('../config/db');
const { NotFoundError, ForbiddenError, ValidationError } = require('../middleware/errorHandler');

/**
 * Retrieves surveys based on user role.
 * - Students: only published surveys.
 * - Admins: all surveys, with optional status filter.
 * Includes question count, view count, completed response count, and student submission status.
 *
 * @param {object} user - Authenticated user { id, role }
 * @param {object} [filters] - Query filters { status }
 */
async function getSurveys(user, filters = {}) {
  const isStudent = user.role === 'student';
  const params = [];
  const whereClauses = [];

  if (isStudent) {
    whereClauses.push(`s.status IN ('published', 'closed')`);
  } else if (filters.status) {
    if (!['draft', 'published', 'closed'].includes(filters.status)) {
      throw new ValidationError("Invalid status filter. Must be 'draft', 'published', or 'closed'.");
    }
    params.push(filters.status);
    whereClauses.push(`s.status = $${params.length}`);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const studentIdParamIndex = params.length + 1;
  params.push(user.id);

  const queryText = `
    SELECT 
      s.id,
      s.title,
      s.description,
      s.status,
      s.due_date,
      s.created_by,
      s.created_at,
      s.published_at,
      s.closed_at,
      u.username AS creator_username,
      (SELECT COUNT(*)::int FROM questions q WHERE q.survey_id = s.id) AS question_count,
      (SELECT COUNT(*)::int FROM survey_responses sr WHERE sr.survey_id = s.id AND sr.status = 'completed') AS response_count,
      (SELECT COUNT(*)::int FROM survey_views sv WHERE sv.survey_id = s.id) AS view_count,
      EXISTS(
        SELECT 1 FROM survey_responses sr2 
        WHERE sr2.survey_id = s.id AND sr2.student_id = $${studentIdParamIndex} AND sr2.status = 'completed'
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
 * Enforces role visibility and logs genuine student views into survey_views.
 *
 * @param {number} surveyId
 * @param {object} user - Authenticated user
 */
async function getSurveyById(surveyId, user) {
  const surveyRes = await db.query(
    `SELECT s.id, s.title, s.description, s.status, s.due_date, s.created_by, s.created_at, s.published_at, s.closed_at,
            u.username AS creator_username
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

  // Fetch questions ordered by position (schema column)
  const questionsRes = await db.query(
    `SELECT id, survey_id, question_text, question_type, options, position, is_required
     FROM questions
     WHERE survey_id = $1
     ORDER BY position ASC, id ASC`,
    [surveyId]
  );

  // Check if student has already submitted
  let hasSubmitted = false;
  let myResponse = null;
  if (user.role === 'student') {
    const submissionRes = await db.query(
      `SELECT sr.id, sr.status, sr.completed_at,
              COALESCE(
                json_agg(
                  json_build_object(
                    'question_id', a.question_id,
                    'answer_text', a.answer_text,
                    'rating', a.rating
                  )
                ) FILTER (WHERE a.id IS NOT NULL),
                '[]'::json
              ) AS answers
       FROM survey_responses sr
       LEFT JOIN answers a ON a.response_id = sr.id
       WHERE sr.survey_id = $1 AND sr.student_id = $2 AND sr.status = 'completed'
       GROUP BY sr.id
       ORDER BY sr.completed_at DESC NULLS LAST
       LIMIT 1`,
      [surveyId, user.id]
    );
    if (submissionRes.rows.length > 0) {
      hasSubmitted = true;
      myResponse = submissionRes.rows[0];
    }

    // Log genuine student view if viewing a published survey
    // Schema survey_views: (survey_id, student_id, viewed_at)
    if (survey.status === 'published') {
      try {
        await db.query(
          `INSERT INTO survey_views (survey_id, student_id)
           VALUES ($1, $2)`,
          [surveyId, user.id]
        );
      } catch (viewErr) {
        console.warn('[Survey View Log Warning]', viewErr.message);
      }
    }
  }

  return {
    ...survey,
    has_submitted: hasSubmitted,
    my_response: myResponse,
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
  const isPublished = status === 'published';
  const rawDue = surveyData.due_date !== undefined ? surveyData.due_date : surveyData.dueDate;
  const dueDate = rawDue && String(rawDue).trim() ? new Date(rawDue) : null;

  return await db.withTransaction(async (client) => {
    // 1. Insert survey with published_at if initially published
    const surveyInsertRes = await client.query(
      `INSERT INTO surveys (title, description, status, due_date, created_by, published_at)
       VALUES ($1, $2, $3, $4, $5, ${isPublished ? 'NOW()' : 'NULL'})
       RETURNING *`,
      [title.trim(), description ? description.trim() : null, status, dueDate, adminId]
    );
    const newSurvey = surveyInsertRes.rows[0];

    // 2. Insert questions
    const insertedQuestions = [];
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      // Normalize single_choice to multiple_choice for DB compatibility
      let qType = q.question_type;
      if (qType === 'single_choice') {
        qType = 'multiple_choice';
      }

      const qPos = q.position !== undefined ? Number(q.position) : (q.order_index !== undefined ? Number(q.order_index) : i + 1);

      const qRes = await client.query(
        `INSERT INTO questions (survey_id, question_text, question_type, options, position, is_required)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          newSurvey.id,
          q.question_text.trim(),
          qType,
          qType === 'multiple_choice' ? JSON.stringify(q.options || []) : null,
          qPos,
          q.is_required !== undefined ? Boolean(q.is_required) : true,
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

  const rawDue = updateData.due_date !== undefined ? updateData.due_date : updateData.dueDate;
  if (rawDue !== undefined) {
    const parsedDue = rawDue && String(rawDue).trim() ? new Date(rawDue) : null;
    params.push(parsedDue);
    fields.push(`due_date = $${params.length}`);
  }

  if (fields.length === 0) {
    throw new ValidationError("No valid fields provided to update.");
  }

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
 * Updates a survey's lifecycle status ('draft', 'published', 'closed').
 * Sets published_at and closed_at appropriately.
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

  let updateQuery = '';
  const params = [surveyId, newStatus];

  if (newStatus === 'published') {
    updateQuery = `
      UPDATE surveys
      SET status = $2, published_at = COALESCE(published_at, NOW()), closed_at = NULL
      WHERE id = $1
      RETURNING *;
    `;
  } else if (newStatus === 'closed') {
    updateQuery = `
      UPDATE surveys
      SET status = $2, closed_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;
  } else {
    // draft
    updateQuery = `
      UPDATE surveys
      SET status = $2, published_at = NULL, closed_at = NULL
      WHERE id = $1
      RETURNING *;
    `;
  }

  const updateRes = await db.query(updateQuery, params);
  return updateRes.rows[0];
}

/**
 * Deletes a survey and cascades to questions, survey_views, responses, answers.
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
    // Cascade is defined in database/init.sql (ON DELETE CASCADE),
    // but executing in transaction ensures complete atomic cleanup.
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
