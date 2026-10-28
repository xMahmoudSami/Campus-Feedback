const db = require('../config/db');

/**
 * Creates a new feedback entry submitted by a student.
 * Schema columns: student_id, survey_id (optional), message, created_at.
 * Student only.
 *
 * @param {number} studentId
 * @param {object} feedbackData - { message, survey_id, title, category }
 */
async function createFeedback(studentId, feedbackData) {
  const { message, survey_id, title, category, rating } = feedbackData;

  // Format title or category into message if provided by client for backward compatibility
  let composedMessage = message.trim();
  if (title && title.trim()) {
    composedMessage = category ? `[${category.trim()}] ${title.trim()}: ${composedMessage}` : `${title.trim()}: ${composedMessage}`;
  }

  const validSurveyId = survey_id ? Number(survey_id) : null;
  const validRating = (rating !== undefined && rating !== null && rating !== '') ? Number(rating) : null;

  const insertRes = await db.query(
    `INSERT INTO feedback (student_id, survey_id, message, rating)
     VALUES ($1, $2, $3, $4)
     RETURNING id, student_id, survey_id, message, rating, created_at;`,
    [studentId, validSurveyId, composedMessage, validRating]
  );

  const row = insertRes.rows[0];
  return {
    ...row,
    ...(category && !row.category ? { category } : {}),
    ...(title && !row.title ? { title } : {}),
  };
}

/**
 * Retrieves all feedback entries submitted in the system.
 * Includes student details and optional survey title.
 * Admin only.
 */
async function getAllFeedback() {
  const queryText = `
    SELECT 
      f.id,
      f.student_id,
      f.survey_id,
      f.message,
      f.rating,
      f.created_at,
      u.username AS student_username,
      u.email AS student_email,
      u.full_name AS student_full_name,
      s.title AS survey_title
    FROM feedback f
    LEFT JOIN users u ON f.student_id = u.id
    LEFT JOIN surveys s ON f.survey_id = s.id
    ORDER BY f.created_at DESC;
  `;

  const result = await db.query(queryText);
  return result.rows;
}

/**
 * Retrieves feedback entries submitted by a specific student.
 * Student only.
 * @param {number} studentId
 */
async function getFeedbackByStudent(studentId) {
  const queryText = `
    SELECT 
      f.id,
      f.student_id,
      f.survey_id,
      f.message,
      f.rating,
      f.created_at,
      u.username AS student_username,
      u.email AS student_email,
      u.full_name AS student_full_name,
      s.title AS survey_title
    FROM feedback f
    LEFT JOIN users u ON f.student_id = u.id
    LEFT JOIN surveys s ON f.survey_id = s.id
    WHERE f.student_id = $1
    ORDER BY f.created_at DESC;
  `;

  const result = await db.query(queryText, [studentId]);
  return result.rows;
}

module.exports = {
  createFeedback,
  getAllFeedback,
  getFeedbackByStudent,
};
