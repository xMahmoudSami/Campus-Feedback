/**
 * Student – Available Surveys list
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
    const published = surveys.filter((s) => s.status === 'published');
    renderList(container, published);
  } catch (err) {
    UI.handleError(err);
    UI.showEmpty(container, 'Error', 'Could not load surveys');
  }
});

function renderList(container, surveys) {
  container.textContent = '';
  if (!surveys.length) {
    UI.showEmpty(container, 'No surveys available', 'There are no published surveys right now.');
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
    actions.appendChild(UI.statusBadge('available'));
    const btn = document.createElement('a');
    btn.className = 'btn btn-primary';
    btn.textContent = 'Start Survey';
    btn.href = appUrl(`student/survey.html?id=${s.id}`);
    actions.appendChild(btn);

    item.appendChild(info);
    item.appendChild(actions);
    container.appendChild(item);
  });
}
