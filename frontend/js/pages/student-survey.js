/**
 * Student – Take a Survey
 */
let survey = null;
const answers = {}; // questionId -> value

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth('student')) return;
  UI.initSidebar();
  UI.populateUserInfo();
  UI.bindLogout();
  UI.setActiveNav('surveys');

  const params = new URLSearchParams(window.location.search);
  const surveyId = params.get('id');
  if (!surveyId) {
    UI.toast('No survey specified', 'error');
    return;
  }

  const container = document.getElementById('survey-form');
  UI.showLoading(container);

  try {
    survey = await API.getSurvey(surveyId);
    if (survey.status !== 'published') {
      UI.showEmpty(container, 'Not available', 'This survey is not currently open for responses.');
      return;
    }
    renderSurvey(container);
  } catch (err) {
    UI.handleError(err);
    UI.showEmpty(container, 'Error', 'Could not load survey');
  }
});

function renderSurvey(container) {
  container.textContent = '';

  const header = document.createElement('div');
  header.className = 'mb-3';
  const h1 = document.createElement('h1');
  h1.style.fontSize = '1.4rem';
  h1.style.fontWeight = '700';
  h1.textContent = survey.title;
  const desc = document.createElement('p');
  desc.className = 'text-muted';
  desc.textContent = survey.description || '';
  header.appendChild(h1);
  header.appendChild(desc);
  container.appendChild(header);

  (survey.questions || []).forEach((q, idx) => {
    const card = document.createElement('div');
    card.className = 'card mb-2';
    const body = document.createElement('div');
    body.className = 'card-body';

    const label = document.createElement('div');
    label.className = 'form-label';
    label.textContent = `${idx + 1}. ${q.text}`;
    if (q.required) {
      const req = document.createElement('span');
      req.className = 'required';
      req.textContent = ' *';
      label.appendChild(req);
    }
    body.appendChild(label);

    if (q.type === 'text') {
      const textarea = document.createElement('textarea');
      textarea.className = 'form-control';
      textarea.rows = 3;
      textarea.placeholder = 'Your answer...';
      textarea.dataset.qid = q.id;
      textarea.addEventListener('input', () => {
        answers[q.id] = textarea.value;
      });
      body.appendChild(textarea);
    } else if (q.type === 'multiple_choice') {
      (q.options || []).forEach((opt, oi) => {
        const check = document.createElement('div');
        check.className = 'form-check';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = `q-${q.id}`;
        radio.id = `q-${q.id}-${oi}`;
        radio.value = opt;
        radio.addEventListener('change', () => {
          answers[q.id] = opt;
        });
        const lbl = document.createElement('label');
        lbl.htmlFor = `q-${q.id}-${oi}`;
        lbl.textContent = opt;
        check.appendChild(radio);
        check.appendChild(lbl);
        body.appendChild(check);
      });
    } else if (q.type === 'rating') {
      const group = document.createElement('div');
      group.className = 'rating-group';
      for (let i = 1; i <= 5; i++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'rating-btn';
        btn.textContent = String(i);
        btn.dataset.value = i;
        btn.addEventListener('click', () => {
          answers[q.id] = i;
          group.querySelectorAll('.rating-btn').forEach((b) => b.classList.remove('selected'));
          btn.classList.add('selected');
        });
        group.appendChild(btn);
      }
      body.appendChild(group);
    }

    card.appendChild(body);
    container.appendChild(card);
  });

  const actions = document.createElement('div');
  actions.className = 'd-flex gap-2 mt-3';
  const submitBtn = document.createElement('button');
  submitBtn.className = 'btn btn-primary btn-lg';
  submitBtn.textContent = 'Submit Response';
  submitBtn.id = 'submit-btn';
  submitBtn.addEventListener('click', handleSubmit);
  const cancelBtn = document.createElement('a');
  cancelBtn.className = 'btn btn-secondary btn-lg';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.href = appUrl('student/surveys.html');
  actions.appendChild(submitBtn);
  actions.appendChild(cancelBtn);
  container.appendChild(actions);
}

async function handleSubmit() {
  // Validate required
  for (const q of survey.questions || []) {
    if (q.required && (answers[q.id] === undefined || answers[q.id] === '')) {
      UI.toast(`Please answer: "${q.text}"`, 'warning');
      return;
    }
  }

  const answerList = Object.entries(answers).map(([questionId, value]) => ({
    questionId: Number(questionId),
    value,
  }));

  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.textContent = 'Submitting...';

  try {
    await API.submitResponse(survey.id, answerList);
    Auth.go('student/confirmation.html');
  } catch (err) {
    UI.handleError(err);
    btn.disabled = false;
    btn.textContent = 'Submit Response';
  }
}
