const db = require('../config/db');

/**
 * Computes administrative dashboard metrics derived strictly from stored database records.
 * Follows the non-duplicating subquery pattern specified in database/init.sql.
 * Admin only.
 */
async function getAdminDashboard() {
  // 1. Overview counts
  const countsQuery = `
    SELECT
      (SELECT COUNT(*)::int FROM surveys) AS total_surveys,
      (SELECT COUNT(*)::int FROM surveys WHERE status = 'draft') AS draft_surveys,
      (SELECT COUNT(*)::int FROM surveys WHERE status = 'published') AS published_surveys,
      (SELECT COUNT(*)::int FROM surveys WHERE status = 'closed') AS closed_surveys,
      (SELECT COUNT(*)::int FROM users WHERE role = 'student') AS total_students,
      (SELECT COUNT(*)::int FROM survey_responses) AS total_attempts,
      (SELECT COUNT(*)::int FROM survey_responses) AS total_responses,
      (SELECT COUNT(*)::int FROM survey_responses WHERE status = 'completed') AS total_completed_responses,
      (SELECT COUNT(*)::int FROM feedback) AS total_feedback,
      (SELECT COUNT(*)::int FROM survey_views) AS total_views;
  `;

  // 2. Per-survey breakdown without Cartesian product duplication
  const surveysMetricsQuery = `
    SELECT 
      s.id,
      s.title,
      s.status,
      s.created_at,
      s.published_at,
      s.closed_at,
      (SELECT COUNT(*)::int FROM survey_views v WHERE v.survey_id = s.id) AS total_views,
      COUNT(r.id)::int AS attempts,
      COUNT(r.id) FILTER (WHERE r.status = 'completed')::int AS completed_responses,
      COALESCE(
        ROUND(100.0 * COUNT(r.id) FILTER (WHERE r.status = 'completed') / NULLIF(COUNT(r.id), 0), 1),
        0.0
      )::float AS completion_rate_percent,
      COALESCE(
        ROUND(100.0 * COUNT(r.id) FILTER (WHERE r.status = 'completed') / NULLIF((SELECT COUNT(*) FROM survey_views v WHERE v.survey_id = s.id), 0), 1),
        0.0
      )::float AS view_to_response_rate_percent
    FROM surveys s
    LEFT JOIN survey_responses r ON r.survey_id = s.id
    GROUP BY s.id
    ORDER BY s.created_at DESC;
  `;

  // 3. Recent completed responses
  const recentResponsesQuery = `
    SELECT 
      sr.id AS response_id,
      sr.completed_at,
      sr.completed_at AS submitted_at,
      s.id AS survey_id,
      s.title AS survey_title,
      u.username AS student_username,
      u.email AS student_email
    FROM survey_responses sr
    JOIN surveys s ON sr.survey_id = s.id
    JOIN users u ON sr.student_id = u.id
    WHERE sr.status = 'completed'
    ORDER BY sr.completed_at DESC
    LIMIT 5;
  `;

  // 4. Recent feedback
  const recentFeedbackQuery = `
    SELECT 
      f.id,
      f.survey_id,
      s.title AS survey_title,
      f.message,
      f.rating,
      f.created_at,
      u.username AS student_username,
      u.full_name AS student_full_name,
      u.email AS student_email
    FROM feedback f
    LEFT JOIN users u ON f.student_id = u.id
    LEFT JOIN surveys s ON f.survey_id = s.id
    ORDER BY f.created_at DESC
    LIMIT 5;
  `;

  const [countsRes, metricsRes, responsesRes, feedbackRes] = await Promise.all([
    db.query(countsQuery),
    db.query(surveysMetricsQuery),
    db.query(recentResponsesQuery),
    db.query(recentFeedbackQuery),
  ]);

  const counts = countsRes.rows[0] || {
    total_surveys: 0,
    draft_surveys: 0,
    published_surveys: 0,
    closed_surveys: 0,
    total_students: 0,
    total_attempts: 0,
    total_completed_responses: 0,
    total_feedback: 0,
    total_views: 0,
  };

  return {
    overview: {
      surveys: {
        total: counts.total_surveys,
        draft: counts.draft_surveys,
        published: counts.published_surveys,
        closed: counts.closed_surveys,
      },
      students_count: counts.total_students,
      responses_count: counts.total_completed_responses !== undefined ? counts.total_completed_responses : (counts.total_responses || 0),
      attempts_count: counts.total_attempts !== undefined ? counts.total_attempts : (counts.total_responses || 0),
      feedback_count: counts.total_feedback,
      views_count: counts.total_views,
    },
    surveys_metrics: metricsRes.rows.map((row) => ({
      ...row,
      // Provide backwards-compatible field aliases
      response_count: row.completed_responses,
    })),
    recent_activity: {
      recent_responses: responsesRes.rows,
      recent_feedback: feedbackRes.rows,
    },
    metrics_documentation: {
      completion_rate: 'Calculated as (completed_responses / attempts) * 100. Measures rate of started attempts that reach completion.',
      view_to_response_rate:
        'Calculated as (completed_responses / total_views) * 100. Measures view conversion rate, not university-wide enrollment participation.',
    },
  };
}

/**
 * Computes personalized student dashboard metrics strictly from database records.
 * Student only.
 *
 * @param {number} studentId
 */
async function getStudentDashboard(studentId) {
  // 1. Published surveys and student submission status
  const surveysQuery = `
    SELECT 
      s.id,
      s.title,
      s.description,
      s.status,
      s.due_date,
      s.created_at,
      s.published_at,
      s.closed_at,
      (SELECT COUNT(*)::int FROM questions q WHERE q.survey_id = s.id) AS question_count,
      sr.id AS response_id,
      sr.status AS response_status,
      sr.completed_at,
      CASE WHEN sr.id IS NOT NULL AND sr.status = 'completed' THEN true ELSE false END AS is_completed
    FROM surveys s
    LEFT JOIN survey_responses sr ON sr.survey_id = s.id AND sr.student_id = $1
    WHERE (s.status = 'published' OR (sr.id IS NOT NULL AND sr.status = 'completed'))
    ORDER BY s.created_at DESC;
  `;

  // 2. Feedback count submitted by this student
  const feedbackCountQuery = `
    SELECT COUNT(*)::int AS count FROM feedback WHERE student_id = $1;
  `;

  const [surveysRes, feedbackRes] = await Promise.all([
    db.query(surveysQuery, [studentId]),
    db.query(feedbackCountQuery, [studentId]),
  ]);

  const surveys = surveysRes.rows;
  const availableCount = surveys.filter((s) => s.status === 'published' || !s.status).length;
  const completedCount = surveys.filter((s) => s.is_completed).length;
  const pendingCount = surveys.filter((s) => (s.status === 'published' || !s.status) && !s.is_completed).length;
  const feedbackCount = feedbackRes.rows[0]?.count || 0;

  return {
    summary: {
      available_surveys_count: availableCount,
      completed_surveys_count: completedCount,
      pending_surveys_count: pendingCount,
      feedback_submitted_count: feedbackCount,
    },
    surveys: surveys.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      status: s.status,
      due_date: s.due_date,
      question_count: s.question_count,
      created_at: s.created_at,
      published_at: s.published_at,
      closed_at: s.closed_at,
      is_completed: s.is_completed,
      submitted_at: s.completed_at,
    })),
  };
}

module.exports = {
  getAdminDashboard,
  getStudentDashboard,
};
