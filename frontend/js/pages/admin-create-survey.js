/**
 * Admin – Create / Edit Survey
 */
let questions = [];
let editId = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth('admin')) return;
  UI.initSidebar();
  UI.populateUserInfo();
  UI.bindLogout();
  UI.setActiveNav('surveys');

  const params = new URLSearchParams(window.location.search);
  editId = params.get('id');

  document.getElementById('add-question-btn').addEventListener('click', () => addQuestion());
  document.getElementById('save-draft-btn').addEventListener('click', () => save('draft'));
  document.getElementById('publish-btn').addEventListener('click', () => save('published'));

  if (editId) {
    document.getElementById('page-title').textContent = 'Edit Survey';
    UI.showLoading(document.getElementById('questions-list'), 'Loading survey...');
    try {
      const survey = await API.getSurvey(editId);
      document.getElementById('survey-title').value = survey.title || '';
      document.getElementById('survey-description').value = survey.description || '';
      if (survey.dueDate) {
        document.getElementById('survey-due').value = survey.dueDate.substring(0, 10);
      }
      questions = (survey.questions || []).map((q) => ({
        id: q.id,
        type: q.type,
        text: q.text,
        required: q.required,
        options: q.options ? [...q.options] : ['Option 1', 'Option 2'],
      }));
      renderQuestions();
    } catch (err) {
      UI.handleError(err);
      UI.toast('Could not load survey', 'error');
    }
  } else {
    addQuestion(); // start with one empty question
  }
});

function addQuestion(type = 'text') {
  questions.push({
    id: null,
    type,
    text: '',
    required: true,
    options: ['Option 1', 'Option 2'],
  });
  renderQuestions();
}

function removeQuestion(index) {
  questions.splice(index, 1);
  renderQuestions();
}

function renderQuestions() {
  const container = document.getElementById('questions-list');
  container.textContent = '';

  if (!questions.length) {
    UI.showEmpty(container, 'No questions', 'Click "Add Question" to start building your survey.');
    return;
  }

  questions.forEach((q, idx) => {
    const card = document.createElement('div');
    card.className = 'question-card';

    // header
    const header = document.createElement('div');
    header.className = 'question-card-header';
    const num = document.createElement('span');
    num.className = 'question-number';
    num.textContent = `Question ${idx + 1}`;
    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn-sm btn-danger';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => removeQuestion(idx));
    header.appendChild(num);
    header.appendChild(removeBtn);
    card.appendChild(header);

    // type select
    const typeGroup = document.createElement('div');
    typeGroup.className = 'form-group';
    const typeLabel = document.createElement('label');
    typeLabel.className = 'form-label';
    typeLabel.textContent = 'Type';
    const typeSelect = document.createElement('select');
    typeSelect.className = 'form-control';
    [
      { v: 'text', l: 'Text' },
      { v: 'multiple_choice', l: 'Multiple Choice' },
      { v: 'rating', l: 'Rating (1–5)' },
    ].forEach((o) => {
      const opt = document.createElement('option');
      opt.value = o.v;
      opt.textContent = o.l;
      if (q.type === o.v) opt.selected = true;
      typeSelect.appendChild(opt);
    });
    typeSelect.addEventListener('change', () => {
      questions[idx].type = typeSelect.value;
      renderQuestions();
    });
    typeGroup.appendChild(typeLabel);
    typeGroup.appendChild(typeSelect);
    card.appendChild(typeGroup);

    // question text
    const textGroup = document.createElement('div');
    textGroup.className = 'form-group';
    const textLabel = document.createElement('label');
    textLabel.className = 'form-label';
    textLabel.textContent = 'Question Text';
    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.className = 'form-control';
    textInput.placeholder = 'Enter your question...';
    textInput.value = q.text;
    textInput.addEventListener('input', () => {
      questions[idx].text = textInput.value;
    });
    textGroup.appendChild(textLabel);
    textGroup.appendChild(textInput);
    card.appendChild(textGroup);

    // required
    const reqGroup = document.createElement('div');
    reqGroup.className = 'form-check';
    const reqCheck = document.createElement('input');
    reqCheck.type = 'checkbox';
    reqCheck.id = `req-${idx}`;
    reqCheck.checked = q.required;
    reqCheck.addEventListener('change', () => {
      questions[idx].required = reqCheck.checked;
    });
    const reqLabel = document.createElement('label');
    reqLabel.htmlFor = `req-${idx}`;
    reqLabel.textContent = 'Required';
    reqGroup.appendChild(reqCheck);
    reqGroup.appendChild(reqLabel);
    card.appendChild(reqGroup);

    // options for multiple choice
    if (q.type === 'multiple_choice') {
      const optGroup = document.createElement('div');
      optGroup.className = 'form-group mt-2';
      const optLabel = document.createElement('label');
      optLabel.className = 'form-label';
      optLabel.textContent = 'Options';
      optGroup.appendChild(optLabel);

      (q.options || []).forEach((opt, oi) => {
        const row = document.createElement('div');
        row.className = 'option-row';
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'form-control';
        input.value = opt;
        input.addEventListener('input', () => {
          questions[idx].options[oi] = input.value;
        });
        const rm = document.createElement('button');
        rm.className = 'option-remove';
        rm.textContent = '×';
        rm.addEventListener('click', () => {
          questions[idx].options.splice(oi, 1);
          renderQuestions();
        });
        row.appendChild(input);
        row.appendChild(rm);
        optGroup.appendChild(row);
      });

      const addOpt = document.createElement('button');
      addOpt.className = 'btn btn-sm btn-outline mt-1';
      addOpt.textContent = '+ Add Option';
      addOpt.type = 'button';
      addOpt.addEventListener('click', () => {
        questions[idx].options.push('New option');
        renderQuestions();
      });
      optGroup.appendChild(addOpt);
      card.appendChild(optGroup);
    }

    container.appendChild(card);
  });
}

async function save(status) {
  const title = document.getElementById('survey-title').value.trim();
  const description = document.getElementById('survey-description').value.trim();
  const dueDate = document.getElementById('survey-due').value || null;

  if (!title) {
    UI.toast('Survey title is required', 'warning');
    return;
  }
  if (!questions.length) {
    UI.toast('Add at least one question', 'warning');
    return;
  }
  for (let i = 0; i < questions.length; i++) {
    if (!questions[i].text.trim()) {
      UI.toast(`Question ${i + 1} text is required`, 'warning');
      return;
    }
    if (questions[i].type === 'multiple_choice') {
      const opts = (questions[i].options || []).filter((o) => o.trim());
      if (opts.length < 2) {
        UI.toast(`Question ${i + 1} needs at least 2 options`, 'warning');
        return;
      }
    }
  }

  const payload = {
    title,
    description,
    status,
    dueDate,
    questions: questions.map((q) => ({
      id: q.id || undefined,
      type: q.type,
      text: q.text.trim(),
      required: q.required,
      options: q.type === 'multiple_choice' ? q.options.filter((o) => o.trim()) : undefined,
    })),
  };

  const draftBtn = document.getElementById('save-draft-btn');
  const pubBtn = document.getElementById('publish-btn');
  draftBtn.disabled = true;
  pubBtn.disabled = true;

  try {
    if (editId) {
      await API.updateSurvey(editId, payload);
      UI.toast('Survey updated successfully', 'success');
    } else {
      await API.createSurvey(payload);
      UI.toast(status === 'published' ? 'Survey published!' : 'Draft saved', 'success');
    }
    setTimeout(() => {
      Auth.go('admin/surveys.html');
    }, 800);
  } catch (err) {
    UI.handleError(err);
    draftBtn.disabled = false;
    pubBtn.disabled = false;
  }
}
