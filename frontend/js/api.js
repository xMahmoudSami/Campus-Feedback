/**
 * API layer – the ONLY file that knows URLs and response shapes.
 * Set USE_MOCK = true to use local sample data (no backend required).
 * Set API_BASE_URL to point at your Express backend.
 */

const USE_MOCK = (typeof window !== 'undefined' && window.USE_MOCK !== undefined)
  ? Boolean(window.USE_MOCK)
  : (typeof localStorage !== 'undefined' && localStorage.getItem('USE_MOCK') === 'true');

const API_BASE_URL = (typeof window !== 'undefined' && window.location && (window.location.port === '8080' || window.location.port === '80'))
  ? '/api'
  : 'http://localhost:5000/api';

/* ─── Guessed response shapes (commented for reference) ───
 *
 * POST /auth/login
 *   body: { email, password }
 *   200:  { token: "jwt...", user: { id, name, email, role: "admin"|"student" } }
 *
 * POST /auth/register
 *   body: { name, email, password, role?: "student" }
 *   201:  { token, user }
 *
 * GET /auth/me
 *   200:  { id, name, email, role }
 *
 * POST /auth/logout
 *   200:  { message: "Logged out" }
 *
 * GET /dashboard/admin
 *   200:  {
 *     stats: { totalSurveys, totalStudents, totalResponses, completionRate,
 *              surveysChange, studentsChange, responsesChange, completionChange },
 *     recentSurveys: [{ id, title, status, responseCount, completionPercent }],
 *     latestFeedback: [{ id, studentName, studentEmail, surveyTitle, rating, comment, date }],
 *     activity: { labels: ["Mon",...], views: [...], responses: [...] }
 *   }
 *
 * GET /dashboard/student
 *   200:  {
 *     stats: { availableSurveys, completedSurveys, totalResponses, yourFeedback },
 *     availableSurveys: [{ id, title, description, questionCount, dueDate, status }],
 *     recentResponses: [{ surveyId, surveyTitle, completedOn, status }]
 *   }
 *
 * GET /surveys
 *   200:  [{ id, title, description, status, questionCount, responseCount,
 *            createdAt, updatedAt, dueDate }]
 *
 * GET /surveys/:id
 *   200:  { id, title, description, status, dueDate, questions: [
 *            { id, type: "text"|"multiple_choice"|"rating", text, required, options?: string[] }
 *          ]}
 *
 * POST /surveys
 *   body: { title, description, status, dueDate, questions: [...] }
 *   201:  { id, ... }
 *
 * PATCH /surveys/:id
 *   body: partial survey
 *   200:  updated survey
 *
 * PATCH /surveys/:id/status
 *   body: { status: "draft"|"published"|"closed" }
 *   200:  updated survey
 *
 * DELETE /surveys/:id
 *   200:  { message }
 *
 * POST /surveys/:id/responses
 *   body: { answers: [{ questionId, value }] }
 *   201:  { id, surveyId, submittedAt }
 *
 * GET /surveys/:id/responses
 *   200:  {
 *     responses: [{ id, studentName, studentEmail, submittedAt, answers: [...] }],
 *     statistics: [{ questionId, questionText, type, stats: { ... } }]
 *   }
 *
 * GET /responses/mine
 *   200:  [{ id, surveyId, surveyTitle, submittedAt, status }]
 *
 * POST /feedback
 *   body: { message, rating? }
 *   201:  { id, message, rating, createdAt }
 *
 * GET /feedback
 *   200:  [{ id, studentName, studentEmail, message, rating, createdAt }]
 *
 * GET /health  → { status: "ok" }
 * GET /health/db → { status: "connected" }
 */

// ─── Internal fetch wrapper ───────────────────────────────────

async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    if (window.Auth) Auth.go('login.html'); else window.location.href = 'login.html';
    throw new Error('Unauthorized');
  }

  if (res.status === 403) {
    const err = new Error('You are not allowed to perform this action.');
    err.status = 403;
    throw err;
  }

  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body.error === 'string') {
        msg = body.error;
      } else if (body.error && body.error.message) {
        msg = body.error.message;
      } else if (body.message) {
        msg = body.message;
      }
    } catch (_) { /* ignore */ }
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  if (res.status === 204) return null;
  return res.json();
}

// ─── Mock data ────────────────────────────────────────────────

const MOCK = {
  users: {
    'admin@example.com': {
      id: 1, name: 'System Administrator', email: 'admin@example.com', role: 'admin', password: 'admin123', username: 'admin'
    },
    'student@example.com': {
      id: 2, name: 'Demo Student', email: 'student@example.com', role: 'student', password: 'student123', username: 'student'
    },
  },
  nextUserId: 3,

  surveys: [
    {
      id: 1,
      title: 'Course Evaluation – Spring 2025',
      description: 'Help us improve our courses by sharing your feedback.',
      status: 'published',
      questionCount: 12,
      responseCount: 12,
      completionPercent: 85,
      dueDate: '2025-05-10',
      createdAt: '2025-03-01T10:00:00Z',
      updatedAt: '2025-04-15T10:00:00Z',
      questions: [
        { id: 1, type: 'rating', text: 'Overall course quality', required: true },
        { id: 2, type: 'rating', text: 'Instructor effectiveness', required: true },
        { id: 3, type: 'multiple_choice', text: 'Would you recommend this course?', required: true, options: ['Yes', 'No', 'Maybe'] },
        { id: 4, type: 'text', text: 'What did you like most about this course?', required: false },
        { id: 5, type: 'text', text: 'Suggestions for improvement', required: false },
      ],
    },
    {
      id: 2,
      title: 'Teaching Quality Assessment',
      description: 'Rate your instructors and teaching experience.',
      status: 'published',
      questionCount: 8,
      responseCount: 34,
      completionPercent: 72,
      dueDate: '2025-05-15',
      createdAt: '2025-03-05T10:00:00Z',
      updatedAt: '2025-04-10T10:00:00Z',
      questions: [
        { id: 6, type: 'rating', text: 'Clarity of explanations', required: true },
        { id: 7, type: 'rating', text: 'Availability of instructor', required: true },
        { id: 8, type: 'multiple_choice', text: 'Teaching methods used', required: true, options: ['Lectures', 'Interactive', 'Mixed', 'Project-based'] },
        { id: 9, type: 'text', text: 'Additional comments', required: false },
      ],
    },
    {
      id: 3,
      title: 'Facilities Feedback',
      description: 'Tell us about campus facilities.',
      status: 'draft',
      questionCount: 6,
      responseCount: 0,
      completionPercent: 0,
      dueDate: null,
      createdAt: '2025-04-01T10:00:00Z',
      updatedAt: '2025-04-01T10:00:00Z',
      questions: [
        { id: 10, type: 'rating', text: 'Classroom comfort', required: true },
        { id: 11, type: 'text', text: 'What facilities need improvement?', required: false },
      ],
    },
    {
      id: 4,
      title: 'Library Services Survey',
      description: 'Evaluate library resources and services.',
      status: 'published',
      questionCount: 5,
      responseCount: 28,
      completionPercent: 64,
      dueDate: '2025-04-30',
      createdAt: '2025-02-15T10:00:00Z',
      updatedAt: '2025-03-20T10:00:00Z',
      questions: [
        { id: 12, type: 'rating', text: 'Availability of resources', required: true },
        { id: 13, type: 'rating', text: 'Staff helpfulness', required: true },
        { id: 14, type: 'multiple_choice', text: 'How often do you use the library?', required: true, options: ['Daily', 'Weekly', 'Monthly', 'Rarely'] },
        { id: 15, type: 'text', text: 'Comments', required: false },
      ],
    },
    {
      id: 5,
      title: 'Campus Safety Survey',
      description: 'Your thoughts on campus safety measures.',
      status: 'closed',
      questionCount: 4,
      responseCount: 54,
      completionPercent: 100,
      dueDate: '2025-03-01',
      createdAt: '2025-01-10T10:00:00Z',
      updatedAt: '2025-03-01T10:00:00Z',
      questions: [
        { id: 16, type: 'rating', text: 'Overall safety feeling', required: true },
        { id: 17, type: 'text', text: 'Any concerns?', required: false },
      ],
    },
  ],

  feedback: [
    { id: 1, studentName: 'Ahmed Hassan', studentEmail: 'student1@example.com', surveyTitle: 'Course Evaluation', rating: 5, comment: 'Great course content and delivery.', date: '2025-04-24', message: 'Great course content and delivery.', createdAt: '2025-04-24T10:00:00Z' },
    { id: 2, studentName: 'Sara Ahmed', studentEmail: 'student2@example.com', surveyTitle: 'Teaching Quality', rating: 5, comment: 'Excellent instructor and resources.', date: '2025-04-23', message: 'Excellent instructor and resources.', createdAt: '2025-04-23T10:00:00Z' },
    { id: 3, studentName: 'Mohamed Ali', studentEmail: 'student3@example.com', surveyTitle: 'Facilities Feedback', rating: 3, comment: 'Need more study spaces.', date: '2025-04-22', message: 'Need more study spaces.', createdAt: '2025-04-22T10:00:00Z' },
    { id: 4, studentName: 'Fatma Adel', studentEmail: 'student4@example.com', surveyTitle: 'Library Services', rating: 4, comment: 'Better opening hours would help.', date: '2025-04-21', message: 'Better opening hours would help.', createdAt: '2025-04-21T10:00:00Z' },
    { id: 5, studentName: 'Youssef Omar', studentEmail: 'student5@example.com', surveyTitle: 'Course Evaluation', rating: 5, comment: 'Very helpful and well organized.', date: '2025-04-20', message: 'Very helpful and well organized.', createdAt: '2025-04-20T10:00:00Z' },
  ],

  studentResponses: [
    { id: 1, surveyId: 4, surveyTitle: 'Library Services Survey', submittedAt: '2025-04-18T10:00:00Z', completedOn: 'Apr 18, 2025', status: 'Completed' },
    { id: 2, surveyId: 3, surveyTitle: 'Facilities Feedback', submittedAt: '2025-04-12T10:00:00Z', completedOn: 'Apr 12, 2025', status: 'Completed' },
    { id: 3, surveyId: 2, surveyTitle: 'Teaching Quality Assessment', submittedAt: '2025-04-05T10:00:00Z', completedOn: 'Apr 5, 2025', status: 'Completed' },
  ],

  surveyResponses: {
    1: {
      responses: [
        { id: 1, studentName: 'Ahmed Hassan', studentEmail: 'student1@example.com', submittedAt: '2025-04-24T10:00:00Z', answers: [{ questionId: 1, value: 5 }, { questionId: 2, value: 4 }, { questionId: 3, value: 'Yes' }, { questionId: 4, value: 'The practical labs' }] },
        { id: 2, studentName: 'Youssef Omar', studentEmail: 'student5@example.com', submittedAt: '2025-04-20T10:00:00Z', answers: [{ questionId: 1, value: 5 }, { questionId: 2, value: 5 }, { questionId: 3, value: 'Yes' }, { questionId: 4, value: 'Well organized content' }] },
      ],
      statistics: [
        { questionId: 1, questionText: 'Overall course quality', type: 'rating', stats: { average: 4.7, distribution: { 1: 0, 2: 0, 3: 1, 4: 3, 5: 8 } } },
        { questionId: 2, questionText: 'Instructor effectiveness', type: 'rating', stats: { average: 4.5, distribution: { 1: 0, 2: 1, 3: 1, 4: 4, 5: 6 } } },
        { questionId: 3, questionText: 'Would you recommend this course?', type: 'multiple_choice', stats: { counts: { Yes: 10, No: 1, Maybe: 1 } } },
      ],
    },
    2: {
      responses: [
        { id: 3, studentName: 'Sara Ahmed', studentEmail: 'student2@example.com', submittedAt: '2025-04-23T10:00:00Z', answers: [{ questionId: 6, value: 5 }, { questionId: 7, value: 4 }] },
      ],
      statistics: [
        { questionId: 6, questionText: 'Clarity of explanations', type: 'rating', stats: { average: 4.3, distribution: { 1: 1, 2: 2, 3: 5, 4: 12, 5: 14 } } },
        { questionId: 7, questionText: 'Availability of instructor', type: 'rating', stats: { average: 4.1, distribution: { 1: 0, 2: 3, 3: 6, 4: 14, 5: 11 } } },
      ],
    },
  },

  nextId: { survey: 6, question: 18, feedback: 6, response: 4 },
};

function delay(ms = 300) {
  return new Promise((r) => setTimeout(r, ms));
}

function mockAuth() {
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  if (!user) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }
  return user;
}

// ─── Auth ─────────────────────────────────────────────────────

async function login(email, password) {
  if (USE_MOCK) {
    await delay();
    const key = (email || '').toLowerCase().trim();
    let u = MOCK.users[key];
    if (!u) {
      u = Object.values(MOCK.users).find(
        (x) => (x.username || '').toLowerCase() === key
      );
    }
    if (!u || u.password !== password) {
      const err = new Error('Invalid email or password');
      err.status = 401;
      throw err;
    }
    const { password: _, ...user } = u;
    const token = 'mock-jwt-' + user.role + '-' + Date.now();
    return { token, user };
  }
  const res = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: email, password }),
  });
  const data = res.data || res;
  if (data.user && !data.user.name && data.user.full_name) {
    data.user.name = data.user.full_name;
  }
  return data;
}

async function register({ name, email, password, role }) {
  if (USE_MOCK) {
    await delay(400);
    const key = (email || '').toLowerCase().trim();
    if (!name || !key || !password) {
      const err = new Error('Name, email and password are required');
      err.status = 400;
      throw err;
    }
    if (password.length < 6) {
      const err = new Error('Password must be at least 6 characters');
      err.status = 400;
      throw err;
    }
    if (MOCK.users[key]) {
      const err = new Error('An account with this email already exists');
      err.status = 409;
      throw err;
    }
    const userRole = role === 'admin' ? 'admin' : 'student';
    const id = MOCK.nextUserId++;
    MOCK.users[key] = { id, name: name.trim(), email: key, role: userRole, password };
    const { password: _, ...user } = MOCK.users[key];
    const token = 'mock-jwt-' + user.role + '-' + Date.now();
    return { token, user };
  }
  const res = await apiFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, fullName: name, email, password, role: role || 'student' }),
  });
  const data = res.data || res;
  if (data.user && !data.user.name && data.user.full_name) {
    data.user.name = data.user.full_name;
  }
  return data;
}

async function getMe() {
  if (USE_MOCK) {
    await delay(100);
    return mockAuth();
  }
  const res = await apiFetch('/auth/me');
  const user = res.data?.user || res.data || res;
  if (user && !user.name && user.full_name) {
    user.name = user.full_name;
  }
  return user;
}

async function logout() {
  if (USE_MOCK) {
    await delay(100);
    return { message: 'Logged out' };
  }
  return apiFetch('/auth/logout', { method: 'POST' });
}

// ─── Dashboard ────────────────────────────────────────────────

async function getAdminDashboard() {
  if (USE_MOCK) {
    await delay();
    mockAuth();
    return {
      stats: {
        totalSurveys: 5,
        totalStudents: 42,
        totalResponses: 128,
        completionRate: 76,
        surveysChange: 20,
        studentsChange: 12,
        responsesChange: 18,
        completionChange: 15,
      },
      recentSurveys: MOCK.surveys.slice(0, 4).map((s) => ({
        id: s.id,
        title: s.title,
        status: s.status,
        responseCount: s.responseCount,
        completionPercent: s.completionPercent,
      })),
      latestFeedback: MOCK.feedback.slice(0, 5),
      activity: {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        views: [18, 22, 20, 28, 30, 38, 35],
        responses: [10, 14, 12, 18, 16, 22, 20],
      },
    };
  }
  const res = await apiFetch('/dashboard/admin');
  const raw = res.data || res;
  const totalSurveys = raw.overview?.surveys?.total ?? 0;
  const totalStudents = raw.overview?.students_count ?? 0;
  const totalResponses = raw.overview?.responses_count ?? 0;
  let avgCompletionRate = 0;
  if (raw.surveys_metrics && raw.surveys_metrics.length > 0) {
    const sum = raw.surveys_metrics.reduce((acc, s) => acc + (s.completion_rate_percent || 0), 0);
    avgCompletionRate = Math.round(sum / raw.surveys_metrics.length);
  }
  return {
    stats: {
      totalSurveys,
      totalStudents,
      totalResponses,
      completionRate: avgCompletionRate,
      surveysChange: 0,
      studentsChange: 0,
      responsesChange: 0,
      completionChange: 0,
    },
    recentSurveys: (raw.surveys_metrics || []).slice(0, 5).map((s) => ({
      id: s.id,
      title: s.title,
      status: s.status,
      responseCount: s.completed_responses ?? s.response_count ?? 0,
      completionPercent: Math.round(s.completion_rate_percent || 0),
    })),
    latestFeedback: (raw.recent_activity?.recent_feedback || []).slice(0, 5).map((f) => ({
      id: f.feedback_id || f.id,
      studentName: f.student_full_name || f.student_username || f.student_email || 'Student',
      studentEmail: f.student_email || '',
      surveyTitle: f.survey_title || 'General',
      rating: 5,
      comment: f.message,
      date: f.created_at ? new Date(f.created_at).toLocaleDateString() : '',
    })),
    activity: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      views: [0, 0, 0, 0, 0, 0, raw.overview?.views_count || 0],
      responses: [0, 0, 0, 0, 0, 0, totalResponses],
    },
    ...raw,
  };
}

async function getStudentDashboard() {
  if (USE_MOCK) {
    await delay();
    mockAuth();
    const published = MOCK.surveys.filter((s) => s.status === 'published');
    return {
      stats: {
        availableSurveys: published.length,
        completedSurveys: MOCK.studentResponses.length,
        totalResponses: MOCK.studentResponses.length,
        yourFeedback: 1,
      },
      availableSurveys: published.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        questionCount: s.questionCount,
        dueDate: s.dueDate,
        status: 'Available',
      })),
      recentResponses: MOCK.studentResponses,
    };
  }
  const res = await apiFetch('/dashboard/student');
  const raw = res.data || res;
  const allSurveys = raw.surveys || [];
  const available = allSurveys.filter((s) => !s.is_completed).map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description || '',
    questionCount: s.question_count || 0,
    dueDate: null,
    status: 'Available',
  }));
  const completed = allSurveys.filter((s) => s.is_completed).map((s) => ({
    id: s.id,
    surveyId: s.id,
    surveyTitle: s.title,
    completedOn: s.submitted_at ? new Date(s.submitted_at).toLocaleDateString() : 'Completed',
    status: 'Completed',
  }));
  return {
    stats: {
      availableSurveys: raw.summary?.pending_surveys_count ?? available.length,
      completedSurveys: raw.summary?.completed_surveys_count ?? completed.length,
      totalResponses: raw.summary?.completed_surveys_count ?? completed.length,
      yourFeedback: raw.summary?.feedback_submitted_count ?? 0,
    },
    availableSurveys: available,
    recentResponses: completed,
    ...raw,
  };
}

// ─── Surveys ──────────────────────────────────────────────────

async function getSurveys() {
  if (USE_MOCK) {
    await delay();
    mockAuth();
    return MOCK.surveys.map(({ questions, ...rest }) => rest);
  }
  const res = await apiFetch('/surveys');
  const list = res.data?.surveys || res.surveys || (Array.isArray(res) ? res : []);
  return list.map((s) => ({
    ...s,
    questionCount: s.question_count ?? s.questionCount ?? 0,
    responseCount: s.response_count ?? s.responseCount ?? 0,
    updatedAt: s.published_at || s.created_at,
  }));
}

async function getSurvey(id) {
  if (USE_MOCK) {
    await delay();
    mockAuth();
    const s = MOCK.surveys.find((x) => x.id === Number(id));
    if (!s) {
      const err = new Error('Survey not found');
      err.status = 404;
      throw err;
    }
    return JSON.parse(JSON.stringify(s));
  }
  const res = await apiFetch(`/surveys/${id}`);
  const survey = res.data?.survey || res.survey || res;
  return {
    ...survey,
    questions: (survey.questions || []).map((q) => ({
      ...q,
      text: q.question_text || q.text,
      type: q.question_type || q.type,
      required: q.is_required !== undefined ? q.is_required : (q.required ?? true),
      options: Array.isArray(q.options)
        ? q.options
        : (typeof q.options === 'string' ? JSON.parse(q.options || '[]') : []),
    })),
  };
}

async function createSurvey(data) {
  if (USE_MOCK) {
    await delay();
    mockAuth();
    const id = MOCK.nextId.survey++;
    const survey = {
      id,
      title: data.title,
      description: data.description || '',
      status: data.status || 'draft',
      questionCount: (data.questions || []).length,
      responseCount: 0,
      completionPercent: 0,
      dueDate: data.dueDate || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      questions: (data.questions || []).map((q, i) => ({
        id: MOCK.nextId.question++,
        type: q.type,
        text: q.text,
        required: !!q.required,
        options: q.options || undefined,
      })),
    };
    MOCK.surveys.unshift(survey);
    return survey;
  }
  const payload = {
    title: data.title,
    description: data.description,
    status: data.status,
    questions: (data.questions || []).map((q, idx) => ({
      question_text: q.text || q.question_text,
      question_type: q.type || q.question_type,
      options: q.options,
      position: idx + 1,
      is_required: q.required !== undefined ? q.required : (q.is_required ?? true),
    })),
  };
  const res = await apiFetch('/surveys', { method: 'POST', body: JSON.stringify(payload) });
  return res.data?.survey || res.survey || res;
}

async function updateSurvey(id, data) {
  if (USE_MOCK) {
    await delay();
    mockAuth();
    const idx = MOCK.surveys.findIndex((x) => x.id === Number(id));
    if (idx === -1) {
      const err = new Error('Survey not found');
      err.status = 404;
      throw err;
    }
    const existing = MOCK.surveys[idx];
    const updated = {
      ...existing,
      ...data,
      id: existing.id,
      questionCount: data.questions ? data.questions.length : existing.questionCount,
      updatedAt: new Date().toISOString(),
    };
    if (data.questions) {
      updated.questions = data.questions.map((q) => ({
        id: q.id || MOCK.nextId.question++,
        type: q.type,
        text: q.text,
        required: !!q.required,
        options: q.options || undefined,
      }));
    }
    MOCK.surveys[idx] = updated;
    return updated;
  }
  const payload = {
    title: data.title,
    description: data.description,
  };
  const res = await apiFetch(`/surveys/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
  return res.data?.survey || res.survey || res;
}

async function updateSurveyStatus(id, status) {
  if (USE_MOCK) {
    await delay();
    mockAuth();
    const s = MOCK.surveys.find((x) => x.id === Number(id));
    if (!s) {
      const err = new Error('Survey not found');
      err.status = 404;
      throw err;
    }
    s.status = status;
    s.updatedAt = new Date().toISOString();
    return s;
  }
  const res = await apiFetch(`/surveys/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  return res.data?.survey || res.survey || res;
}

async function deleteSurvey(id) {
  if (USE_MOCK) {
    await delay();
    mockAuth();
    const idx = MOCK.surveys.findIndex((x) => x.id === Number(id));
    if (idx === -1) {
      const err = new Error('Survey not found');
      err.status = 404;
      throw err;
    }
    MOCK.surveys.splice(idx, 1);
    return { message: 'Survey deleted' };
  }
  return apiFetch(`/surveys/${id}`, { method: 'DELETE' });
}

// ─── Responses ────────────────────────────────────────────────

async function submitResponse(surveyId, answers) {
  if (USE_MOCK) {
    await delay();
    const user = mockAuth();
    const id = MOCK.nextId.response++;
    const survey = MOCK.surveys.find((s) => s.id === Number(surveyId));
    if (survey) survey.responseCount = (survey.responseCount || 0) + 1;
    const entry = {
      id,
      surveyId: Number(surveyId),
      surveyTitle: survey ? survey.title : 'Survey',
      submittedAt: new Date().toISOString(),
      completedOn: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      status: 'Completed',
    };
    MOCK.studentResponses.unshift(entry);
    return { id, surveyId: Number(surveyId), submittedAt: entry.submittedAt };
  }
  const normalizedAnswers = (answers || []).map((a) => {
    const qId = a.question_id || a.questionId;
    if (typeof a.value === 'number') {
      return { question_id: Number(qId), rating: a.value };
    }
    if (typeof a.value === 'string') {
      return { question_id: Number(qId), answer_text: a.value };
    }
    return {
      question_id: Number(qId),
      answer_text: a.answer_text,
      rating: a.rating,
    };
  });
  const res = await apiFetch(`/surveys/${surveyId}/responses`, {
    method: 'POST',
    body: JSON.stringify({ answers: normalizedAnswers }),
  });
  return res.data || res;
}

async function getSurveyResponses(surveyId) {
  if (USE_MOCK) {
    await delay();
    mockAuth();
    return (
      MOCK.surveyResponses[Number(surveyId)] || {
        responses: [],
        statistics: [],
      }
    );
  }
  const res = await apiFetch(`/surveys/${surveyId}/responses`);
  const raw = res.data || res;
  const list = raw.responses || [];

  const qStatsMap = {};
  list.forEach((r) => {
    (r.answers || []).forEach((a) => {
      const qId = a.question_id;
      if (!qStatsMap[qId]) {
        qStatsMap[qId] = {
          questionId: qId,
          questionText: a.question_text || `Question ${a.position || qId}`,
          type: a.question_type,
          ratings: [],
          counts: {},
        };
      }
      if (a.question_type === 'rating' && a.rating) {
        qStatsMap[qId].ratings.push(a.rating);
      } else if (a.question_type === 'multiple_choice' && a.answer_text) {
        qStatsMap[qId].counts[a.answer_text] = (qStatsMap[qId].counts[a.answer_text] || 0) + 1;
      }
    });
  });

  const statistics = Object.values(qStatsMap).map((s) => {
    if (s.type === 'rating') {
      const avg = s.ratings.length ? (s.ratings.reduce((x, y) => x + y, 0) / s.ratings.length).toFixed(1) : 0;
      const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      s.ratings.forEach((val) => { dist[val] = (dist[val] || 0) + 1; });
      return { questionId: s.questionId, questionText: s.questionText, type: s.type, stats: { average: Number(avg), distribution: dist } };
    }
    if (s.type === 'multiple_choice') {
      return { questionId: s.questionId, questionText: s.questionText, type: s.type, stats: { counts: s.counts } };
    }
    return { questionId: s.questionId, questionText: s.questionText, type: s.type };
  });

  const normalizedResponses = list.map((r) => ({
    ...r,
    studentName: r.student_full_name || r.student_username || 'Student',
    studentEmail: r.student_email || '',
    submittedAt: r.submitted_at || r.completed_at,
    answers: (r.answers || []).map((a) => ({
      ...a,
      questionId: a.question_id,
      value: a.answer_text !== null && a.answer_text !== undefined ? a.answer_text : a.rating,
    })),
  }));

  return {
    ...raw,
    statistics,
    responses: normalizedResponses,
  };
}

async function getMyResponses() {
  if (USE_MOCK) {
    await delay();
    mockAuth();
    return MOCK.studentResponses;
  }
  const res = await apiFetch('/responses/mine');
  const list = res.data?.responses || res.responses || (Array.isArray(res) ? res : []);
  return list.map((r) => ({
    ...r,
    surveyId: r.survey_id || r.surveyId,
    surveyTitle: r.survey_title || r.surveyTitle,
    submittedAt: r.completed_at || r.submitted_at || r.submittedAt,
    completedOn: (r.completed_at || r.submitted_at)
      ? new Date(r.completed_at || r.submitted_at).toLocaleDateString()
      : 'Completed',
    status: 'Completed',
  }));
}

// ─── Feedback ─────────────────────────────────────────────────

async function submitFeedback(data) {
  if (USE_MOCK) {
    await delay();
    const user = mockAuth();
    const id = MOCK.nextId.feedback++;
    const entry = {
      id,
      studentName: user.name,
      studentEmail: user.email,
      message: data.message,
      rating: data.rating || null,
      comment: data.message,
      surveyTitle: 'General',
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      createdAt: new Date().toISOString(),
    };
    MOCK.feedback.unshift(entry);
    return entry;
  }
  const res = await apiFetch('/feedback', {
    method: 'POST',
    body: JSON.stringify({
      message: data.message,
      survey_id: data.survey_id || data.surveyId,
    }),
  });
  return res.data?.feedback || res.feedback || res;
}

async function getFeedback() {
  if (USE_MOCK) {
    await delay();
    mockAuth();
    return MOCK.feedback;
  }
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  let endpoint = '/feedback';
  if (user.role === 'student') {
    endpoint = '/feedback/mine';
  }
  const res = await apiFetch(endpoint);
  const list = res.data?.feedback || res.feedback || (Array.isArray(res) ? res : []);
  return list.map((f) => ({
    ...f,
    studentName: f.student_full_name || f.student_username || f.studentName || 'Student',
    studentEmail: f.student_email || f.studentEmail || '',
    surveyTitle: f.survey_title || f.surveyTitle || 'General',
    comment: f.message || f.comment,
    date: f.created_at ? new Date(f.created_at).toLocaleDateString() : '',
  }));
}

// ─── Health ───────────────────────────────────────────────────

async function getHealth() {
  if (USE_MOCK) {
    return { status: 'ok' };
  }
  return apiFetch('/health');
}

async function getHealthDb() {
  if (USE_MOCK) {
    return { status: 'connected' };
  }
  return apiFetch('/health/db');
}

// Export for browser (no modules)
window.API = {
  login,
  register,
  getMe,
  logout,
  getAdminDashboard,
  getStudentDashboard,
  getSurveys,
  getSurvey,
  createSurvey,
  updateSurvey,
  updateSurveyStatus,
  deleteSurvey,
  submitResponse,
  getSurveyResponses,
  getMyResponses,
  submitFeedback,
  getFeedback,
  getHealth,
  getHealthDb,
  USE_MOCK,
  API_BASE_URL,
};
