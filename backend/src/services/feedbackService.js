const db = require('../config/db');

/**
 * Creates a new feedback entry submitted by a student.
 * Student only.
 *
 * @param {number} studentId
 * @param {object} feedbackData - { message, title, category }
 */
async function createFeedback(studentId, feedbackData) {
  const { message, title = null, category = 'general' } = feedbackData;

  const insertRes = await db.query(
    `INSERT INTO feedback (student_id, title, message, category)
     VALUES ($1, $2, $3, $4)
     RETURNING id, student_id, title, message, category, created_at`,
    [studentId, title ? title.trim() : null, message.trim(), category ? category.trim() : 'general']
  );

  return insertRes.rows[0];
}

/**
 * Retrieves all feedback entries submitted in the system.
 * Admin only.
 */
async function getAllFeedback() {
  const queryText = `
    SELECT 
      f.id,
      f.title,
      f.message,
      f.category,
      f.created_at,
      u.id AS student_id,
      u.username AS student_username,
      u.email AS student_email,
      u.full_name AS student_full_name
    FROM feedback f
    LEFT JOIN users u ON f.student_id = u.id
    ORDER BY f.created_at DESC;
  `;

  const result = await db.query(queryText);
  return result.rows;
}

module.exports = {
  createFeedback,
  getAllFeedback,
};
