/**
 * Student – Take or Preview a Survey
 */
let survey = null;
let isReadOnly = false;
const answers = {}; // questionId -> value

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth('student')) return;
  UI.initSidebar();
  UI.populateUserInfo();
  UI.bindLogout();
  UI.setActiveNav('surveys');

  const params = new URLSearchParams(window.location.search);
  const surveyId = params.get('id');
  const requestedPreview = params.get('mode') === 'preview';

  if (!surveyId) {
    UI.toast('No survey specified', 'error');
    return;
  }

  const container = document.getElementById('survey-form');
  UI.showLoading(container);

  try {
    survey = await API.getSurvey(surveyId);

    const isClosed = survey.status === 'closed';
    const isExpired = Boolean(survey.isExpired || survey.is_expired || (typeof UI !== 'undefined' && UI.isSurveyExpired(survey.dueDate)));
    const hasSubmitted = Boolean(survey.hasSubmitted);
    isReadOnly = requestedPreview || isClosed || isExpired || hasSubmitted;

    // Students cannot view draft surveys
    if (survey.status === 'draft') {
      UI.showEmpty(container, 'Not available', 'This survey is not currently available.');
      return;
    }

    // Build map of submitted answers if reviewing
    const userAnswersMap = {};
    if (survey.myResponse?.answers && Array.isArray(survey.myResponse.answers)) {
      survey.myResponse.answers.forEach((ans) => {
        userAnswersMap[ans.question_id ?? ans.questionId] = ans;
      });
    } else if (hasSubmitted) {
      try {
        const myResponses = await API.getMyResponses();
        const myResp = myResponses.find(
          (r) => Number(r.surveyId || r.survey_id) === Number(surveyId)
        );
        if (myResp?.answers && Array.isArray(myResp.answers)) {
          myResp.answers.forEach((ans) => {
            userAnswersMap[ans.question_id ?? ans.questionId] = ans;
          });
        }
      } catch (e) {
        console.warn('[Responses Fallback Warning]', e);
      }
    }

    renderSurvey(container, isReadOnly, userAnswersMap);
  } catch (err) {
    UI.handleError(err);
    UI.showEmpty(container, 'Error', 'Could not load survey');
  }
});

function renderSurvey(container, readOnly, userAnswersMap = {}) {
  container.textContent = '';

  const header = document.createElement('div');
  header.className = 'mb-3';

  const titleRow = document.createElement('div');
  titleRow.className = 'd-flex align-center justify-between flex-wrap gap-2 mb-1';

  const h1 = document.createElement('h1');
  h1.style.fontSize = '1.4rem';
  h1.style.fontWeight = '700';
  h1.textContent = survey.title;
  titleRow.appendChild(h1);

  const statusWrap = document.createElement('div');
  statusWrap.className = 'd-flex align-center gap-1';
  const isExpired = Boolean(survey.isExpired || survey.is_expired || (typeof UI !== 'undefined' && UI.isSurveyExpired(survey.dueDate)));
  if (survey.status === 'closed') {
    statusWrap.appendChild(UI.statusBadge('closed'));
  } else if (isExpired) {
    statusWrap.appendChild(UI.statusBadge('expired'));
  }
  if (survey.hasSubmitted) {
    statusWrap.appendChild(UI.statusBadge('completed'));
  } else if (survey.status === 'published' && !isExpired) {
    statusWrap.appendChild(UI.statusBadge('available'));
  }
  titleRow.appendChild(statusWrap);
  header.appendChild(titleRow);

  if (survey.description) {
    const desc = document.createElement('p');
    desc.className = 'text-muted mb-2';
    desc.textContent = survey.description;
    header.appendChild(desc);
  }

  // Notice banners when in read-only / preview mode
  if (readOnly) {
    const alertDiv = document.createElement('div');
    if (survey.hasSubmitted) {
      alertDiv.className = 'alert alert-info';
      alertDiv.innerHTML = `
        <div class="alert-icon">ℹ️</div>
        <div>
          <strong>Submitted Response (Read-Only Mode)</strong>
          <div>You have completed this survey. Your submitted answers are displayed below.</div>
        </div>
      `;
    } else if (survey.status === 'closed') {
      alertDiv.className = 'alert alert-warning';
      alertDiv.innerHTML = `
        <div class="alert-icon">⚠️</div>
        <div>
          <strong>Survey Closed (Read-Only Preview)</strong>
          <div>This survey is closed and is no longer accepting new responses. You are viewing it in read-only mode.</div>
        </div>
      `;
    } else if (isExpired) {
      alertDiv.className = 'alert alert-warning';
      alertDiv.innerHTML = `
        <div class="alert-icon">⏰</div>
        <div>
          <strong>Survey Expired (Read-Only Preview)</strong>
          <div>This survey expired on ${UI.formatDate(survey.dueDate)} and is no longer accepting responses. You are viewing it in read-only mode.</div>
        </div>
      `;
    } else {
      alertDiv.className = 'alert alert-info';
      alertDiv.innerHTML = `
        <div class="alert-icon">👁️</div>
        <div>
          <strong>Read-Only Preview Mode</strong>
          <div>You are previewing this survey. Form fields are disabled.</div>
        </div>
      `;
    }
    header.appendChild(alertDiv);
  }

  container.appendChild(header);

  (survey.questions || []).forEach((q, idx) => {
    const card = document.createElement('div');
    card.className = 'card mb-2';
    const body = document.createElement('div');
    body.className = 'card-body';

    const label = document.createElement('div');
    label.className = 'form-label';
    label.textContent = `${idx + 1}. ${q.text}`;
    if (q.required && !readOnly) {
      const req = document.createElement('span');
      req.className = 'required';
      req.textContent = ' *';
      label.appendChild(req);
    }
    body.appendChild(label);

    const savedAns = userAnswersMap[q.id];

    if (q.type === 'text') {
      const textarea = document.createElement('textarea');
      textarea.className = 'form-control';
      textarea.rows = 3;
      textarea.dataset.qid = q.id;

      if (readOnly) {
        textarea.readOnly = true;
        textarea.value = savedAns?.answer_text || savedAns?.answerText || savedAns?.value || '';
        if (!textarea.value) {
          textarea.placeholder = '(No answer provided)';
        }
        textarea.style.backgroundColor = 'var(--gray-50, #f8fafc)';
        textarea.style.cursor = 'default';
      } else {
        textarea.placeholder = 'Your answer...';
        textarea.addEventListener('input', () => {
          answers[q.id] = textarea.value;
        });
      }
      body.appendChild(textarea);
    } else if (q.type === 'multiple_choice') {
      const savedChoice = savedAns?.answer_text || savedAns?.answerText || savedAns?.value;

      (q.options || []).forEach((opt, oi) => {
        const check = document.createElement('div');
        check.className = 'form-check';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = `q-${q.id}`;
        radio.id = `q-${q.id}-${oi}`;
        radio.value = opt;

        const isChosen = savedChoice === opt;

        if (readOnly) {
          radio.disabled = true;
          if (isChosen) {
            radio.checked = true;
            check.classList.add('form-check-selected');
          }
        } else {
          radio.addEventListener('change', () => {
            answers[q.id] = opt;
          });
        }

        const lbl = document.createElement('label');
        lbl.htmlFor = `q-${q.id}-${oi}`;
        lbl.textContent = opt;

        if (readOnly && isChosen) {
          const yourBadge = document.createElement('span');
          yourBadge.className = 'badge badge-primary';
          yourBadge.style.marginLeft = '8px';
          yourBadge.style.fontSize = '0.72rem';
          yourBadge.textContent = 'Your Answer';
          lbl.appendChild(yourBadge);
        }

        check.appendChild(radio);
        check.appendChild(lbl);
        body.appendChild(check);
      });
    } else if (q.type === 'rating') {
      const group = document.createElement('div');
      group.className = 'rating-group';

      const savedRating = savedAns?.rating !== undefined
        ? Number(savedAns.rating)
        : (savedAns?.rating_value !== undefined
            ? Number(savedAns.rating_value)
            : (savedAns?.value !== undefined ? Number(savedAns.value) : null));

      for (let i = 1; i <= 5; i++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'rating-btn';
        btn.textContent = String(i);
        btn.dataset.value = i;

        if (readOnly) {
          btn.disabled = true;
          if (savedRating === i) {
            btn.classList.add('selected');
          }
        } else {
          btn.addEventListener('click', () => {
            answers[q.id] = i;
            group.querySelectorAll('.rating-btn').forEach((b) => b.classList.remove('selected'));
            btn.classList.add('selected');
          });
        }
        group.appendChild(btn);
      }

      if (readOnly && savedRating) {
        const ratingLabel = document.createElement('span');
        ratingLabel.className = 'badge badge-primary';
        ratingLabel.style.marginLeft = '12px';
        ratingLabel.style.alignSelf = 'center';
        ratingLabel.textContent = `Your Rating: ${savedRating} / 5 ★`;
        group.appendChild(ratingLabel);
      }

      body.appendChild(group);
    }

    card.appendChild(body);
    container.appendChild(card);
  });

  const actions = document.createElement('div');
  actions.className = 'd-flex gap-2 mt-3';

  if (readOnly) {
    const backBtn = document.createElement('a');
    backBtn.className = 'btn btn-primary btn-lg';
    backBtn.textContent = 'Back to Surveys';
    backBtn.href = appUrl('student/surveys.html');
    actions.appendChild(backBtn);
  } else {
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
  }

  container.appendChild(actions);
}

async function handleSubmit() {
  const isExpired = Boolean(survey?.isExpired || survey?.is_expired || (typeof UI !== 'undefined' && UI.isSurveyExpired(survey?.dueDate)));
  if (isReadOnly || isExpired || survey?.status === 'closed') {
    UI.toast('This survey is no longer accepting responses.', 'warning');
    return;
  }

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
