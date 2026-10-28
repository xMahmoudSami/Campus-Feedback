/**
 * Student Dashboard
 */
document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth('student')) return;
  UI.initSidebar();
  UI.populateUserInfo();
  UI.bindLogout();
  UI.setActiveNav('dashboard');

  const user = Auth.getUser();
  const greeting = document.getElementById('greeting');
  if (greeting) greeting.textContent = `Hello, ${user.name}!`;

  const statsEl = document.getElementById('stats-cards');
  const availableEl = document.getElementById('available-surveys');
  const responsesEl = document.getElementById('recent-responses');

  UI.showLoading(statsEl);
  UI.showLoading(availableEl);
  UI.showLoading(responsesEl);

  try {
    const data = await API.getStudentDashboard();
    renderStats(statsEl, data.stats);
    renderAvailable(availableEl, data.availableSurveys);
    renderResponses(responsesEl, data.recentResponses);
  } catch (err) {
    UI.handleError(err);
    UI.showEmpty(statsEl, 'Error', 'Could not load dashboard');
  }
});

function renderStats(container, stats) {
  container.textContent = '';
  const items = [
    { label: 'Available Surveys', value: stats.availableSurveys, color: 'blue' },
    { label: 'Completed Surveys', value: stats.completedSurveys, color: 'green' },
    { label: 'Total Responses', value: stats.totalResponses, color: 'purple' },
    { label: 'Your Feedback', value: stats.yourFeedback, color: 'orange' },
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
    card.appendChild(accent);
    card.appendChild(label);
    card.appendChild(value);
    container.appendChild(card);
  });
}

function renderAvailable(container, surveys) {
  container.textContent = '';
  if (!surveys || !surveys.length) {
    UI.showEmpty(container, 'No available surveys', 'Check back later for new surveys.');
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

    const desc = document.createElement('div');
    desc.className = 'survey-item-desc';
    desc.textContent = s.description || '';

    const meta = document.createElement('div');
    meta.className = 'survey-item-meta';
    const qCount = document.createElement('span');
    qCount.textContent = `${s.questionCount} questions`;
    meta.appendChild(qCount);
    if (s.dueDate) {
      const due = document.createElement('span');
      due.textContent = `Due: ${UI.formatDate(s.dueDate)}`;
      meta.appendChild(due);
    }

    info.appendChild(title);
    info.appendChild(desc);
    info.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'survey-item-actions';

    const isClosed = s.status === 'closed';
    const isExpired = Boolean(s.isExpired || s.is_expired || (typeof UI !== 'undefined' && UI.isSurveyExpired(s.dueDate)));
    const hasSubmitted = Boolean(s.hasSubmitted);

    if (isClosed) {
      actions.appendChild(UI.statusBadge('closed'));
      const previewBtn = document.createElement('a');
      previewBtn.className = 'btn btn-sm btn-secondary';
      previewBtn.textContent = 'Preview';
      previewBtn.href = appUrl(`student/survey.html?id=${s.id}&mode=preview`);
      actions.appendChild(previewBtn);
    } else if (hasSubmitted) {
      if (isExpired) {
        actions.appendChild(UI.statusBadge('expired'));
      }
      actions.appendChild(UI.statusBadge('completed'));
      const previewBtn = document.createElement('a');
      previewBtn.className = 'btn btn-sm btn-secondary';
      previewBtn.textContent = 'Preview';
      previewBtn.href = appUrl(`student/survey.html?id=${s.id}&mode=preview`);
      actions.appendChild(previewBtn);
    } else if (isExpired) {
      actions.appendChild(UI.statusBadge('expired'));
      const previewBtn = document.createElement('a');
      previewBtn.className = 'btn btn-sm btn-secondary';
      previewBtn.textContent = 'Preview';
      previewBtn.href = appUrl(`student/survey.html?id=${s.id}&mode=preview`);
      actions.appendChild(previewBtn);
    } else {
      actions.appendChild(UI.statusBadge('available'));
      const startBtn = document.createElement('a');
      startBtn.className = 'btn btn-sm btn-primary';
      startBtn.textContent = 'Start Survey';
      startBtn.href = appUrl(`student/survey.html?id=${s.id}`);
      actions.appendChild(startBtn);
    }

    item.appendChild(info);
    item.appendChild(actions);
    container.appendChild(item);
  });
}

function renderResponses(container, responses) {
  container.textContent = '';
  if (!responses || !responses.length) {
    UI.showEmpty(container, 'No responses yet', 'Complete a survey to see it here.');
    return;
  }

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  ['Survey', 'Completed On', 'Status', 'Action'].forEach((h) => {
    const th = document.createElement('th');
    th.textContent = h;
    hr.appendChild(th);
  });
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  responses.forEach((r) => {
    const tr = document.createElement('tr');
    const tdTitle = document.createElement('td');
    tdTitle.textContent = r.surveyTitle;
    const tdDate = document.createElement('td');
    tdDate.textContent = r.completedOn || UI.formatDate(r.submittedAt);
    const tdStatus = document.createElement('td');
    tdStatus.appendChild(UI.statusBadge(r.status || 'Completed'));
    const tdAction = document.createElement('td');
    const previewBtn = document.createElement('a');
    previewBtn.className = 'btn btn-sm btn-secondary';
    previewBtn.textContent = 'Preview';
    previewBtn.href = appUrl(`student/survey.html?id=${r.surveyId || r.survey_id}&mode=preview`);
    tdAction.appendChild(previewBtn);

    tr.appendChild(tdTitle);
    tr.appendChild(tdDate);
    tr.appendChild(tdStatus);
    tr.appendChild(tdAction);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  const wrapper = document.createElement('div');
  wrapper.className = 'table-wrapper';
  wrapper.appendChild(table);
  container.appendChild(wrapper);
}
