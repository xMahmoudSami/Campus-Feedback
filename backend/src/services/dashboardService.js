const db = require('../config/db');
const { isSurveyExpired, getEffectiveStatus } = require('../utils/dateUtils');

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
      s.due_date,
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
    GROUP BY s.id, s.title, s.status, s.due_date, s.created_at, s.published_at, s.closed_at
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

  // 5. Month-over-month comparisons for KPI change indicators
  const monthlyChangesQuery = `
    SELECT
      -- Surveys created
      (SELECT COUNT(*)::int FROM surveys WHERE created_at >= date_trunc('month', NOW())) AS surveys_this_month,
      (SELECT COUNT(*)::int FROM surveys WHERE created_at >= date_trunc('month', NOW() - INTERVAL '1 month') AND created_at < date_trunc('month', NOW())) AS surveys_last_month,

      -- Registered students (strictly users with role = 'student')
      (SELECT COUNT(*)::int FROM users WHERE role = 'student' AND created_at >= date_trunc('month', NOW())) AS students_this_month,
      (SELECT COUNT(*)::int FROM users WHERE role = 'student' AND created_at >= date_trunc('month', NOW() - INTERVAL '1 month') AND created_at < date_trunc('month', NOW())) AS students_last_month,

      -- Completed responses
      (SELECT COUNT(*)::int FROM survey_responses WHERE status = 'completed' AND completed_at >= date_trunc('month', NOW())) AS responses_this_month,
      (SELECT COUNT(*)::int FROM survey_responses WHERE status = 'completed' AND completed_at >= date_trunc('month', NOW() - INTERVAL '1 month') AND completed_at < date_trunc('month', NOW())) AS responses_last_month,

      -- Total attempts for completion rate comparison
      (SELECT COUNT(*)::int FROM survey_responses WHERE created_at >= date_trunc('month', NOW())) AS attempts_this_month,
      (SELECT COUNT(*)::int FROM survey_responses WHERE created_at >= date_trunc('month', NOW() - INTERVAL '1 month') AND created_at < date_trunc('month', NOW())) AS attempts_last_month;
  `;

  // 6. Last 7 calendar days activity timeseries
  const activityQuery = `
    WITH days AS (
      SELECT (CURRENT_DATE - (i || ' day')::interval)::date AS day_date
      FROM generate_series(6, 0, -1) AS i
    ),
    views_agg AS (
      SELECT viewed_at::date AS day_date, COUNT(*)::int AS count
      FROM survey_views
      WHERE viewed_at >= CURRENT_DATE - INTERVAL '6 days'
      GROUP BY viewed_at::date
    ),
    responses_agg AS (
      SELECT completed_at::date AS day_date, COUNT(*)::int AS count
      FROM survey_responses
      WHERE completed_at >= CURRENT_DATE - INTERVAL '6 days' AND status = 'completed'
      GROUP BY completed_at::date
    )
    SELECT 
      d.day_date,
      TO_CHAR(d.day_date, 'Dy') AS weekday_label,
      TO_CHAR(d.day_date, 'YYYY-MM-DD') AS date_str,
      COALESCE(v.count, 0) AS views_count,
      COALESCE(r.count, 0) AS responses_count
    FROM days d
    LEFT JOIN views_agg v ON d.day_date = v.day_date
    LEFT JOIN responses_agg r ON d.day_date = r.day_date
    ORDER BY d.day_date ASC;
  `;

  const [countsRes, metricsRes, responsesRes, feedbackRes, monthlyRes, activityRes] = await Promise.all([
    db.query(countsQuery),
    db.query(surveysMetricsQuery),
    db.query(recentResponsesQuery),
    db.query(recentFeedbackQuery),
    db.query(monthlyChangesQuery).catch(() => ({ rows: [] })),
    db.query(activityQuery).catch(() => ({ rows: [] })),
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

  const m = monthlyRes?.rows?.[0] || {
    surveys_this_month: 0,
    surveys_last_month: 0,
    students_this_month: 0,
    students_last_month: 0,
    responses_this_month: 0,
    responses_last_month: 0,
    attempts_this_month: 0,
    attempts_last_month: 0,
  };

  function calcPercentageChange(current, prior) {
    if (prior === 0) {
      return current > 0 ? 100 : 0;
    }
    return Math.round(((current - prior) / prior) * 100);
  }

  const surveysChange = calcPercentageChange(Number(m.surveys_this_month) || 0, Number(m.surveys_last_month) || 0);
  const studentsChange = calcPercentageChange(Number(m.students_this_month) || 0, Number(m.students_last_month) || 0);
  const responsesChange = calcPercentageChange(Number(m.responses_this_month) || 0, Number(m.responses_last_month) || 0);

  const curAttempts = Number(m.attempts_this_month) || 0;
  const curCompleted = Number(m.responses_this_month) || 0;
  const prevAttempts = Number(m.attempts_last_month) || 0;
  const prevCompleted = Number(m.responses_last_month) || 0;

  const currentCompRate = curAttempts > 0 ? Math.round((curCompleted / curAttempts) * 100) : 0;
  const priorCompRate = prevAttempts > 0 ? Math.round((prevCompleted / prevAttempts) * 100) : 0;
  const completionChange = currentCompRate - priorCompRate;

  let activityData;
  if (activityRes?.rows?.length > 0) {
    activityData = {
      labels: activityRes.rows.map((r) => (r.weekday_label || '').trim()),
      dates: activityRes.rows.map((r) => r.date_str || ''),
      views: activityRes.rows.map((r) => Number(r.views_count) || 0),
      responses: activityRes.rows.map((r) => Number(r.responses_count) || 0),
    };
  } else {
    // Dynamic 7-day fallback based on current date
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const labels = [];
    const dates = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      labels.push(weekdays[d.getDay()]);
      dates.push(d.toISOString().substring(0, 10));
    }
    activityData = {
      labels,
      dates,
      views: [0, 0, 0, 0, 0, 0, 0],
      responses: [0, 0, 0, 0, 0, 0, 0],
    };
  }

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
    changes: {
      surveys_change: surveysChange,
      students_change: studentsChange,
      responses_change: responsesChange,
      completion_change: completionChange,
    },
    activity: activityData,
    surveys_metrics: metricsRes.rows.map((row) => ({
      ...row,
      is_expired: isSurveyExpired(row.due_date),
      effective_status: getEffectiveStatus(row.status, row.due_date),
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
async function getStudentDashboard(studentId, clientTime = null) {
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

  const refDate = clientTime ? new Date(clientTime) : new Date();
  const surveys = surveysRes.rows.map((s) => {
    const expired = isSurveyExpired(s.due_date, refDate);
    return {
      ...s,
      is_expired: expired,
      effective_status: getEffectiveStatus(s.status, s.due_date, refDate),
    };
  });

  const availableCount = surveys.filter(
    (s) => (s.status === 'published' || !s.status) && !s.is_expired
  ).length;
  const completedCount = surveys.filter((s) => s.is_completed).length;
  const pendingCount = surveys.filter(
    (s) => (s.status === 'published' || !s.status) && !s.is_expired && !s.is_completed
  ).length;
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
      is_expired: s.is_expired,
      effective_status: s.effective_status,
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
