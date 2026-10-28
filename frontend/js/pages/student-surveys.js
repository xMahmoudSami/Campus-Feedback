/**
 * Student – Surveys list (Active, Completed, Closed)
 */
document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth('student')) return;
  UI.initSidebar();
  UI.populateUserInfo();
  UI.bindLogout();
  UI.setActiveNav('surveys');

  const container = document.getElementById('surveys-list');
  UI.showLoading(container);

  try {
    const surveys = await API.getSurveys();
    // Allow published and closed surveys
    const visibleSurveys = surveys.filter((s) => s.status === 'published' || s.status === 'closed');
    renderList(container, visibleSurveys);
  } catch (err) {
    UI.handleError(err);
    UI.showEmpty(container, 'Error', 'Could not load surveys');
  }
});

function renderList(container, surveys) {
  container.textContent = '';
  if (!surveys.length) {
    UI.showEmpty(container, 'No surveys available', 'There are no surveys available right now.');
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
    meta.textContent = `${s.questionCount || 0} questions` + (s.dueDate ? ` · Due ${UI.formatDate(s.dueDate)}` : '');

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
      if (hasSubmitted) {
        actions.appendChild(UI.statusBadge('completed'));
      }
      const previewBtn = document.createElement('a');
      previewBtn.className = 'btn btn-secondary';
      previewBtn.textContent = 'Preview';
      previewBtn.href = appUrl(`student/survey.html?id=${s.id}&mode=preview`);
      actions.appendChild(previewBtn);
    } else if (hasSubmitted) {
      if (isExpired) {
        actions.appendChild(UI.statusBadge('expired'));
      }
      actions.appendChild(UI.statusBadge('completed'));
      const previewBtn = document.createElement('a');
      previewBtn.className = 'btn btn-secondary';
      previewBtn.textContent = 'Preview';
      previewBtn.href = appUrl(`student/survey.html?id=${s.id}&mode=preview`);
      actions.appendChild(previewBtn);
    } else if (isExpired) {
      actions.appendChild(UI.statusBadge('expired'));
      const previewBtn = document.createElement('a');
      previewBtn.className = 'btn btn-secondary';
      previewBtn.textContent = 'Preview';
      previewBtn.href = appUrl(`student/survey.html?id=${s.id}&mode=preview`);
      actions.appendChild(previewBtn);
    } else {
      actions.appendChild(UI.statusBadge('available'));
      const startBtn = document.createElement('a');
      startBtn.className = 'btn btn-primary';
      startBtn.textContent = 'Start Survey';
      startBtn.href = appUrl(`student/survey.html?id=${s.id}`);
      actions.appendChild(startBtn);
    }

    item.appendChild(info);
    item.appendChild(actions);
    container.appendChild(item);
  });
}
