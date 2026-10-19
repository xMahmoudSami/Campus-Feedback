const db = require('../config/db');

/**
 * Computes administrative dashboard metrics derived strictly from stored database records.
 * Formula definitions:
 * - view_response_rate_percent: (response_count / NULLIF(view_count, 0)) * 100
 *   Measures the conversion rate of survey views to completed responses.
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
      (SELECT COUNT(*)::int FROM survey_responses) AS total_responses,
      (SELECT COUNT(*)::int FROM feedback) AS total_feedback,
      (SELECT COUNT(*)::int FROM survey_views) AS total_views;
  `;

  // 2. Per-survey breakdown
  const surveysMetricsQuery = `
    SELECT 
      s.id,
      s.title,
      s.status,
      s.created_at,
      COUNT(DISTINCT sv.id)::int AS total_views,
      COUNT(DISTINCT sv.user_id)::int AS unique_viewers,
      COUNT(DISTINCT sr.id)::int AS completed_responses,
      CASE 
        WHEN COUNT(DISTINCT sv.id) > 0 
        THEN ROUND((COUNT(DISTINCT sr.id)::numeric / COUNT(DISTINCT sv.id)::numeric) * 100, 1)
        ELSE 0.0
      END::float AS view_to_response_rate_percent
    FROM surveys s
    LEFT JOIN survey_views sv ON sv.survey_id = s.id
    LEFT JOIN survey_responses sr ON sr.survey_id = s.id
    GROUP BY s.id
    ORDER BY s.created_at DESC;
  `;

  // 3. Recent responses
  const recentResponsesQuery = `
    SELECT 
      sr.id AS response_id,
      sr.submitted_at,
      s.id AS survey_id,
      s.title AS survey_title,
      u.username AS student_username,
      u.email AS student_email
    FROM survey_responses sr
    JOIN surveys s ON sr.survey_id = s.id
    JOIN users u ON sr.student_id = u.id
    ORDER BY sr.submitted_at DESC
    LIMIT 5;
  `;

  // 4. Recent feedback
  const recentFeedbackQuery = `
    SELECT 
      f.id,
      f.title,
      f.category,
      f.message,
      f.created_at,
      u.username AS student_username
    FROM feedback f
    LEFT JOIN users u ON f.student_id = u.id
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
    total_responses: 0,
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
      responses_count: counts.total_responses,
      feedback_count: counts.total_feedback,
      views_count: counts.total_views,
    },
    surveys_metrics: metricsRes.rows,
    recent_activity: {
      recent_responses: responsesRes.rows,
      recent_feedback: feedbackRes.rows,
    },
    metrics_documentation: {
      view_to_response_rate:
        'Calculated as (completed_responses / total_views) * 100. Measures view conversion rate, not university-wide student enrollment participation.',
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
      s.created_at,
      (SELECT COUNT(*)::int FROM questions q WHERE q.survey_id = s.id) AS question_count,
      sr.id AS response_id,
      sr.submitted_at,
      CASE WHEN sr.id IS NOT NULL THEN true ELSE false END AS is_completed
    FROM surveys s
    LEFT JOIN survey_responses sr ON sr.survey_id = s.id AND sr.student_id = $1
    WHERE s.status = 'published'
    ORDER BY s.created_at DESC;
  `;

  // 2. Feedback submitted by this student
  const feedbackCountQuery = `
    SELECT COUNT(*)::int AS count FROM feedback WHERE student_id = $1;
  `;

  const [surveysRes, feedbackRes] = await Promise.all([
    db.query(surveysQuery, [studentId]),
    db.query(feedbackCountQuery, [studentId]),
  ]);

  const surveys = surveysRes.rows;
  const availableCount = surveys.length;
  const completedCount = surveys.filter((s) => s.is_completed).length;
  const pendingCount = Math.max(0, availableCount - completedCount);
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
      question_count: s.question_count,
      created_at: s.created_at,
      is_completed: s.is_completed,
      submitted_at: s.submitted_at,
    })),
  };
}

module.exports = {
  getAdminDashboard,
  getStudentDashboard,
};
