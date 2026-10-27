/**
 * Admin – Survey Responses + Statistics
 */
document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth('admin')) return;
  UI.initSidebar();
  UI.populateUserInfo();
  UI.bindLogout();
  UI.setActiveNav('surveys');

  const params = new URLSearchParams(window.location.search);
  const surveyId = params.get('id');
  if (!surveyId) {
    UI.toast('No survey ID provided', 'error');
    return;
  }

  const titleEl = document.getElementById('survey-title');
  const statsEl = document.getElementById('statistics');
  const listEl = document.getElementById('responses-list');

  UI.showLoading(statsEl);
  UI.showLoading(listEl);

  try {
    const [survey, data] = await Promise.all([
      API.getSurvey(surveyId),
      API.getSurveyResponses(surveyId),
    ]);
    titleEl.textContent = survey.title;
    renderStatistics(statsEl, data.statistics || []);
    renderResponses(listEl, data.responses || []);
  } catch (err) {
    UI.handleError(err);
    UI.showEmpty(statsEl, 'Error', 'Could not load responses');
  }
});

function renderStatistics(container, statistics) {
  container.textContent = '';
  if (!statistics.length) {
    UI.showEmpty(container, 'No statistics', 'No responses yet to generate statistics.');
    return;
  }

  statistics.forEach((stat) => {
    const card = document.createElement('div');
    card.className = 'card mb-2';
    const body = document.createElement('div');
    body.className = 'card-body';

    const h4 = document.createElement('h4');
    h4.style.fontSize = '0.95rem';
    h4.style.marginBottom = '0.75rem';
    h4.textContent = stat.questionText;
    body.appendChild(h4);

    if (stat.type === 'rating' && stat.stats) {
      const avg = document.createElement('p');
      avg.className = 'text-sm text-muted mb-1';
      avg.textContent = `Average: ${Number(stat.stats.average).toFixed(1)} / 5`;
      body.appendChild(avg);

      const dist = stat.stats.distribution || {};
      const total = Object.values(dist).reduce((a, b) => a + b, 0) || 1;
      for (let i = 5; i >= 1; i--) {
        const bar = document.createElement('div');
        bar.className = 'stat-bar';
        const label = document.createElement('div');
        label.className = 'stat-bar-label';
        const left = document.createElement('span');
        left.textContent = `${i}`;
        const right = document.createElement('span');
        right.textContent = String(dist[i] || 0);
        label.appendChild(left);
        label.appendChild(right);
        const track = document.createElement('div');
        track.className = 'stat-bar-track';
        const fill = document.createElement('div');
        fill.className = 'stat-bar-fill';
        fill.style.width = ((dist[i] || 0) / total * 100) + '%';
        track.appendChild(fill);
        bar.appendChild(label);
        bar.appendChild(track);
        body.appendChild(bar);
      }
    } else if (stat.type === 'multiple_choice' && stat.stats) {
      const counts = stat.stats.counts || {};
      const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
      Object.entries(counts).forEach(([opt, count]) => {
        const bar = document.createElement('div');
        bar.className = 'stat-bar';
        const label = document.createElement('div');
        label.className = 'stat-bar-label';
        const left = document.createElement('span');
        left.textContent = opt;
        const right = document.createElement('span');
        right.textContent = String(count);
        label.appendChild(left);
        label.appendChild(right);
        const track = document.createElement('div');
        track.className = 'stat-bar-track';
        const fill = document.createElement('div');
        fill.className = 'stat-bar-fill';
        fill.style.width = (count / total * 100) + '%';
        track.appendChild(fill);
        bar.appendChild(label);
        bar.appendChild(track);
        body.appendChild(bar);
      });
    } else {
      const p = document.createElement('p');
      p.className = 'text-sm text-muted';
      p.textContent = 'Text responses – see individual answers below.';
      body.appendChild(p);
    }

    card.appendChild(body);
    container.appendChild(card);
  });
}

function renderResponses(container, responses) {
  container.textContent = '';
  if (!responses.length) {
    UI.showEmpty(container, 'No responses', 'No one has submitted this survey yet.');
    return;
  }

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  ['Student', 'Submitted', 'Answers'].forEach((h) => {
    const th = document.createElement('th');
    th.textContent = h;
    hr.appendChild(th);
  });
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  responses.forEach((r, i) => {
    const tr = document.createElement('tr');

    const tdStudent = document.createElement('td');
    const wrap = document.createElement('div');
    wrap.className = 'd-flex align-center gap-1';
    wrap.appendChild(UI.avatar(r.studentName, i));
    const nameWrap = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'fw-600 text-sm';
    name.textContent = r.studentName;
    const email = document.createElement('div');
    email.className = 'text-xs text-muted';
    email.textContent = r.studentEmail || '';
    nameWrap.appendChild(name);
    nameWrap.appendChild(email);
    wrap.appendChild(nameWrap);
    tdStudent.appendChild(wrap);

    const tdDate = document.createElement('td');
    tdDate.textContent = UI.formatDate(r.submittedAt);

    const tdAnswers = document.createElement('td');
    const ansList = document.createElement('div');
    ansList.className = 'text-sm';
    (r.answers || []).forEach((a) => {
      const line = document.createElement('div');
      line.textContent = `Q${a.questionId}: ${a.value}`;
      ansList.appendChild(line);
    });
    tdAnswers.appendChild(ansList);

    tr.appendChild(tdStudent);
    tr.appendChild(tdDate);
    tr.appendChild(tdAnswers);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  const wrapper = document.createElement('div');
  wrapper.className = 'table-wrapper';
  wrapper.appendChild(table);
  container.appendChild(wrapper);
}
