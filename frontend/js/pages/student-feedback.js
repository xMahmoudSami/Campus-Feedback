/**
 * Student – Send feedback + list my feedback / responses
 */
document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth('student')) return;
  UI.initSidebar();
  UI.populateUserInfo();
  UI.bindLogout();
  UI.setActiveNav('feedback');

  const form = document.getElementById('feedback-form');
  form.addEventListener('submit', handleSubmit);

  // Rating buttons
  document.querySelectorAll('.rating-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.rating-btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      document.getElementById('feedback-rating').value = btn.dataset.value;
    });
  });

  loadMyData();
});

async function handleSubmit(e) {
  e.preventDefault();
  const message = document.getElementById('feedback-message').value.trim();
  const rating = document.getElementById('feedback-rating').value;

  if (!message) {
    UI.toast('Please enter your feedback message', 'warning');
    return;
  }

  const btn = document.getElementById('submit-feedback-btn');
  btn.disabled = true;
  btn.textContent = 'Sending...';

  try {
    await API.submitFeedback({
      message,
      rating: rating ? Number(rating) : undefined,
    });
    UI.toast('Feedback submitted successfully!', 'success');
    document.getElementById('feedback-message').value = '';
    document.getElementById('feedback-rating').value = '';
    document.querySelectorAll('.rating-btn').forEach((b) => b.classList.remove('selected'));
    loadMyData();
  } catch (err) {
    UI.handleError(err);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Submit Feedback';
  }
}

async function loadMyData() {
  const feedbackEl = document.getElementById('my-feedback');
  const responsesEl = document.getElementById('my-responses');
  UI.showLoading(feedbackEl);
  UI.showLoading(responsesEl);

  try {
    const [allFeedback, myResponses] = await Promise.all([
      API.getFeedback(),
      API.getMyResponses(),
    ]);

    const user = Auth.getUser();
    const mine = allFeedback.filter(
      (f) => f.studentEmail === user.email || f.studentName === user.name
    );
    renderMyFeedback(feedbackEl, mine);
    renderMyResponses(responsesEl, myResponses);
  } catch (err) {
    UI.handleError(err);
    UI.showEmpty(feedbackEl, 'Error', 'Could not load data');
  }
}

function renderMyFeedback(container, feedback) {
  container.textContent = '';
  if (!feedback.length) {
    UI.showEmpty(container, 'No feedback yet', 'Submit feedback using the form above.');
    return;
  }

  feedback.forEach((f) => {
    const item = document.createElement('div');
    item.className = 'survey-item';
    const info = document.createElement('div');
    info.className = 'survey-item-info';
    const msg = document.createElement('div');
    msg.className = 'survey-item-title';
    msg.textContent = f.message || f.comment;
    const meta = document.createElement('div');
    meta.className = 'survey-item-meta';
    meta.textContent = f.date || UI.formatDate(f.createdAt);
    info.appendChild(msg);
    info.appendChild(meta);
    const actions = document.createElement('div');
    actions.className = 'survey-item-actions';
    if (f.rating) actions.appendChild(UI.stars(f.rating));
    item.appendChild(info);
    item.appendChild(actions);
    container.appendChild(item);
  });
}

function renderMyResponses(container, responses) {
  container.textContent = '';
  if (!responses.length) {
    UI.showEmpty(container, 'No responses yet', 'Complete surveys to see them here.');
    return;
  }

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  ['Survey', 'Completed On', 'Status'].forEach((h) => {
    const th = document.createElement('th');
    th.textContent = h;
    hr.appendChild(th);
  });
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  responses.forEach((r) => {
    const tr = document.createElement('tr');
    const td1 = document.createElement('td');
    td1.textContent = r.surveyTitle;
    const td2 = document.createElement('td');
    td2.textContent = r.completedOn || UI.formatDate(r.submittedAt);
    const td3 = document.createElement('td');
    td3.appendChild(UI.statusBadge(r.status || 'Completed'));
    tr.appendChild(td1);
    tr.appendChild(td2);
    tr.appendChild(td3);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  const wrapper = document.createElement('div');
  wrapper.className = 'table-wrapper';
  wrapper.appendChild(table);
  container.appendChild(wrapper);
}
