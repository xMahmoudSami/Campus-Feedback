/**
 * Admin Dashboard
 */
document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth('admin')) return;
  UI.initSidebar();
  UI.populateUserInfo();
  UI.bindLogout();
  UI.setActiveNav('dashboard');

  const statsEl = document.getElementById('stats-cards');
  const recentEl = document.getElementById('recent-surveys');
  const feedbackEl = document.getElementById('latest-feedback');
  const chartEl = document.getElementById('activity-chart');

  UI.showLoading(statsEl);
  UI.showLoading(recentEl);
  UI.showLoading(feedbackEl);

  try {
    const data = await API.getAdminDashboard();
    renderStats(statsEl, data.stats);
    renderRecentSurveys(recentEl, data.recentSurveys);
    renderLatestFeedback(feedbackEl, data.latestFeedback);
    renderChart(chartEl, data.activity);
  } catch (err) {
    UI.handleError(err);
    UI.showEmpty(statsEl, 'Error', 'Could not load dashboard');
  }
});

function renderStats(container, stats) {
  container.textContent = '';
  const items = [
    { label: 'Total Surveys', value: stats.totalSurveys, change: stats.surveysChange, color: 'blue' },
    { label: 'Total Students', value: stats.totalStudents, change: stats.studentsChange, color: 'green' },
    { label: 'Total Responses', value: stats.totalResponses, change: stats.responsesChange, color: 'purple' },
    { label: 'Completion Rate', value: stats.completionRate + '%', change: stats.completionChange, color: 'orange' },
  ];

  items.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'stat-card';

    const accent = document.createElement('div');
    accent.className = `stat-card-accent ${item.color}`;

    const label = document.createElement('div');
    label.className = 'stat-card-label';
    label.textContent = item.label;

    const value = document.createElement('div');
    value.className = 'stat-card-value';
    value.textContent = String(item.value);

    const change = document.createElement('div');
    const ch = Number(item.change) || 0;
    const isUp = ch >= 0;
    change.className = `stat-card-change ${isUp ? 'up' : 'down'}`;
    const sign = ch > 0 ? '+' : '';
    change.textContent = `${sign}${ch}% vs. last month`;

    card.appendChild(accent);
    card.appendChild(label);
    card.appendChild(value);
    card.appendChild(change);
    container.appendChild(card);
  });
}

function renderRecentSurveys(container, surveys) {
  container.textContent = '';
  if (!surveys || !surveys.length) {
    UI.showEmpty(container, 'No surveys', 'Create your first survey to get started.');
    return;
  }

  surveys.forEach((s) => {
    const item = document.createElement('div');
    item.className = 'survey-item';

    const info = document.createElement('div');
    info.className = 'survey-item-info';

    const title = document.createElement('div');
    title.className = 'survey-item-title';
    title.textContent = s.title;

    const meta = document.createElement('div');
    meta.className = 'survey-item-meta';
    meta.textContent = `${s.responseCount} responses · ${s.completionPercent}% complete`;

    info.appendChild(title);
    info.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'survey-item-actions';
    const isExpired = Boolean(s.isExpired || s.is_expired);
    if (s.status === 'published' && isExpired) {
      actions.appendChild(UI.statusBadge('expired'));
    } else {
      actions.appendChild(UI.statusBadge(s.status));
    }

    item.appendChild(info);
    item.appendChild(actions);
    container.appendChild(item);
  });
}

function renderLatestFeedback(container, feedback) {
  container.textContent = '';
  if (!feedback || !feedback.length) {
    UI.showEmpty(container, 'No feedback yet', 'Student feedback will appear here.');
    return;
  }

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  ['Student', 'Survey', 'Rating', 'Comment', 'Date'].forEach((h) => {
    const th = document.createElement('th');
    th.textContent = h;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  feedback.forEach((f, i) => {
    const tr = document.createElement('tr');

    const tdStudent = document.createElement('td');
    const studentWrap = document.createElement('div');
    studentWrap.className = 'd-flex align-center gap-1';
    studentWrap.appendChild(UI.avatar(f.studentName, i));
    const nameWrap = document.createElement('div');
    const nameEl = document.createElement('div');
    nameEl.className = 'fw-600 text-sm';
    nameEl.textContent = f.studentName;
    const emailEl = document.createElement('div');
    emailEl.className = 'text-xs text-muted';
    emailEl.textContent = f.studentEmail || '';
    nameWrap.appendChild(nameEl);
    nameWrap.appendChild(emailEl);
    studentWrap.appendChild(nameWrap);
    tdStudent.appendChild(studentWrap);

    const tdSurvey = document.createElement('td');
    tdSurvey.textContent = f.surveyTitle || '—';

    const tdRating = document.createElement('td');
    tdRating.appendChild(UI.stars(f.rating));

    const tdComment = document.createElement('td');
    tdComment.textContent = f.comment || f.message || '—';

    const tdDate = document.createElement('td');
    tdDate.textContent = f.date || UI.formatDate(f.createdAt);

    tr.appendChild(tdStudent);
    tr.appendChild(tdSurvey);
    tr.appendChild(tdRating);
    tr.appendChild(tdComment);
    tr.appendChild(tdDate);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  const wrapper = document.createElement('div');
  wrapper.className = 'table-wrapper';
  wrapper.appendChild(table);
  container.appendChild(wrapper);
}

function renderChart(container, activity) {
  if (!container || !activity) return;
  container.textContent = '';

  const views = activity.views || [];
  const responses = activity.responses || [];
  const labels = activity.labels || [];
  const dates = activity.dates || [];

  const maxVal = Math.max(...views, ...responses, 1);

  const legend = document.createElement('div');
  legend.className = 'chart-legend';
  legend.innerHTML = `
    <span class="chart-legend-item"><span class="chart-legend-dot" style="background:#3b82f6;"></span>Views</span>
    <span class="chart-legend-item"><span class="chart-legend-dot" style="background:#8b5cf6;"></span>Responses</span>
  `;
  container.appendChild(legend);

  const chart = document.createElement('div');
  chart.className = 'chart-placeholder';

  labels.forEach((label, i) => {
    const v = views[i] || 0;
    const r = responses[i] || 0;
    const dateStr = dates[i] ? ` (${dates[i]})` : '';

    const slot = document.createElement('div');
    slot.className = 'chart-day-slot';

    const barViews = document.createElement('div');
    barViews.className = 'chart-bar chart-bar-views';
    barViews.style.height = Math.max(6, Math.round((v / maxVal) * 160)) + 'px';
    barViews.title = `${label}${dateStr}: ${v} views`;

    const barResp = document.createElement('div');
    barResp.className = 'chart-bar chart-bar-responses';
    barResp.style.height = Math.max(6, Math.round((r / maxVal) * 160)) + 'px';
    barResp.title = `${label}${dateStr}: ${r} responses`;

    slot.appendChild(barViews);
    slot.appendChild(barResp);
    chart.appendChild(slot);
  });
  container.appendChild(chart);

  const labelsDiv = document.createElement('div');
  labelsDiv.className = 'chart-labels';
  labels.forEach((l, i) => {
    const span = document.createElement('span');
    span.textContent = l;
    if (dates[i]) {
      span.title = dates[i];
    }
    labelsDiv.appendChild(span);
  });
  container.appendChild(labelsDiv);
}
