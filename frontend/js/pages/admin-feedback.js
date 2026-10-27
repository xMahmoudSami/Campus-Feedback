/**
 * Admin – All Student Feedback
 */
document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth('admin')) return;
  UI.initSidebar();
  UI.populateUserInfo();
  UI.bindLogout();
  UI.setActiveNav('feedback');

  const container = document.getElementById('feedback-list');
  UI.showLoading(container);

  try {
    const feedback = await API.getFeedback();
    renderFeedback(container, feedback);
  } catch (err) {
    UI.handleError(err);
    UI.showEmpty(container, 'Error', 'Could not load feedback');
  }
});

function renderFeedback(container, feedback) {
  container.textContent = '';
  if (!feedback || !feedback.length) {
    UI.showEmpty(container, 'No feedback', 'Student feedback will appear here.');
    return;
  }

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  ['Student', 'Rating', 'Message', 'Date'].forEach((h) => {
    const th = document.createElement('th');
    th.textContent = h;
    hr.appendChild(th);
  });
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  feedback.forEach((f, i) => {
    const tr = document.createElement('tr');

    const tdStudent = document.createElement('td');
    const wrap = document.createElement('div');
    wrap.className = 'd-flex align-center gap-1';
    wrap.appendChild(UI.avatar(f.studentName, i));
    const nameWrap = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'fw-600 text-sm';
    name.textContent = f.studentName;
    const email = document.createElement('div');
    email.className = 'text-xs text-muted';
    email.textContent = f.studentEmail || '';
    nameWrap.appendChild(name);
    nameWrap.appendChild(email);
    wrap.appendChild(nameWrap);
    tdStudent.appendChild(wrap);

    const tdRating = document.createElement('td');
    if (f.rating) {
      tdRating.appendChild(UI.stars(f.rating));
    } else {
      tdRating.textContent = '—';
    }

    const tdMsg = document.createElement('td');
    tdMsg.textContent = f.message || f.comment || '—';

    const tdDate = document.createElement('td');
    tdDate.textContent = f.date || UI.formatDate(f.createdAt);

    tr.appendChild(tdStudent);
    tr.appendChild(tdRating);
    tr.appendChild(tdMsg);
    tr.appendChild(tdDate);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  const wrapper = document.createElement('div');
  wrapper.className = 'table-wrapper';
  wrapper.appendChild(table);
  container.appendChild(wrapper);
}
