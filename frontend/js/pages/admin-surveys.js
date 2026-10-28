/**
 * Admin – Surveys list
 */
document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth('admin')) return;
  UI.initSidebar();
  UI.populateUserInfo();
  UI.bindLogout();
  UI.setActiveNav('surveys');

  const container = document.getElementById('surveys-table');
  UI.showLoading(container);

  try {
    const surveys = await API.getSurveys();
    renderTable(container, surveys);
  } catch (err) {
    UI.handleError(err);
    UI.showEmpty(container, 'Error', 'Could not load surveys');
  }
});

function renderTable(container, surveys) {
  container.textContent = '';

  if (!surveys || !surveys.length) {
    UI.showEmpty(container, 'No surveys', 'Create your first survey to get started.');
    return;
  }

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  ['Title', 'Status', 'Questions', 'Responses', 'Due Date', 'Updated', 'Actions'].forEach((h) => {
    const th = document.createElement('th');
    th.textContent = h;
    hr.appendChild(th);
  });
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  surveys.forEach((s) => {
    const tr = document.createElement('tr');

    const tdTitle = document.createElement('td');
    const titleEl = document.createElement('div');
    titleEl.className = 'fw-600';
    titleEl.textContent = s.title;
    const descEl = document.createElement('div');
    descEl.className = 'text-xs text-muted';
    descEl.textContent = s.description ? s.description.substring(0, 60) + (s.description.length > 60 ? '…' : '') : '';
    tdTitle.appendChild(titleEl);
    tdTitle.appendChild(descEl);

    const tdStatus = document.createElement('td');
    const isExpired = Boolean(s.isExpired || s.is_expired || (typeof UI !== 'undefined' && UI.isSurveyExpired(s.dueDate)));
    if (s.status === 'published' && isExpired) {
      tdStatus.appendChild(UI.statusBadge('expired'));
    } else {
      tdStatus.appendChild(UI.statusBadge(s.status));
    }

    const tdQ = document.createElement('td');
    tdQ.textContent = String(s.questionCount ?? '—');

    const tdR = document.createElement('td');
    tdR.textContent = String(s.responseCount ?? 0);

    const tdDue = document.createElement('td');
    tdDue.textContent = s.dueDate ? UI.formatDate(s.dueDate) : '—';

    const tdUpd = document.createElement('td');
    tdUpd.textContent = UI.formatDate(s.updatedAt);

    const tdActions = document.createElement('td');
    const group = document.createElement('div');
    group.className = 'btn-group';

    // View responses
    const viewBtn = document.createElement('a');
    viewBtn.className = 'btn btn-sm btn-outline';
    viewBtn.textContent = 'Responses';
    viewBtn.href = appUrl(`admin/responses.html?id=${s.id}`);
    group.appendChild(viewBtn);

    // Edit
    const editBtn = document.createElement('a');
    editBtn.className = 'btn btn-sm btn-outline';
    editBtn.textContent = 'Edit';
    editBtn.href = appUrl(`admin/create-survey.html?id=${s.id}`);
    group.appendChild(editBtn);

    // Publish / Close
    if (s.status === 'draft') {
      const pubBtn = document.createElement('button');
      pubBtn.className = 'btn btn-sm btn-success';
      pubBtn.textContent = 'Publish';
      pubBtn.addEventListener('click', () => changeStatus(s.id, 'published'));
      group.appendChild(pubBtn);
    } else if (s.status === 'published') {
      const closeBtn = document.createElement('button');
      closeBtn.className = 'btn btn-sm btn-secondary';
      closeBtn.textContent = 'Close';
      closeBtn.addEventListener('click', () => changeStatus(s.id, 'closed'));
      group.appendChild(closeBtn);
    } else if (s.status === 'closed') {
      const reopenBtn = document.createElement('button');
      reopenBtn.className = 'btn btn-sm btn-success';
      reopenBtn.textContent = 'Reopen';
      reopenBtn.addEventListener('click', () => changeStatus(s.id, 'published'));
      group.appendChild(reopenBtn);
    }

    // Delete
    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-sm btn-danger';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => handleDelete(s.id, s.title));
    group.appendChild(delBtn);

    tdActions.appendChild(group);

    tr.appendChild(tdTitle);
    tr.appendChild(tdStatus);
    tr.appendChild(tdQ);
    tr.appendChild(tdR);
    tr.appendChild(tdDue);
    tr.appendChild(tdUpd);
    tr.appendChild(tdActions);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  const wrapper = document.createElement('div');
  wrapper.className = 'table-wrapper';
  wrapper.appendChild(table);
  container.appendChild(wrapper);
}

async function changeStatus(id, status) {
  try {
    await API.updateSurveyStatus(id, status);
    UI.toast(`Survey ${status === 'published' ? 'published' : 'closed'} successfully`, 'success');
    // reload
    const surveys = await API.getSurveys();
    renderTable(document.getElementById('surveys-table'), surveys);
  } catch (err) {
    UI.handleError(err);
  }
}

async function handleDelete(id, title) {
  const ok = await UI.confirm('Delete Survey', `Are you sure you want to delete "${title}"? This cannot be undone.`);
  if (!ok) return;
  try {
    await API.deleteSurvey(id);
    UI.toast('Survey deleted', 'success');
    const surveys = await API.getSurveys();
    renderTable(document.getElementById('surveys-table'), surveys);
  } catch (err) {
    UI.handleError(err);
  }
}
