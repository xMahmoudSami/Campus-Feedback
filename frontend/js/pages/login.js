/**
 * Login page – form, demo chips, quote carousel, password toggle
 */
function initLogin() {
  Auth.redirectIfLoggedIn();

  const form = document.getElementById('login-form');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const submitBtn = document.getElementById('login-btn');
  const errorEl = document.getElementById('login-error');
  const togglePw = document.getElementById('toggle-pw');
  if (!form) return;

  // Password visibility
  if (togglePw) {
    togglePw.addEventListener('click', () => {
      const isPw = passwordInput.type === 'password';
      passwordInput.type = isPw ? 'text' : 'password';
      togglePw.textContent = isPw ? 'Hide' : 'Show';
    });
  }

  // Demo account chips
  document.querySelectorAll('.demo-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      emailInput.value = chip.dataset.email || '';
      passwordInput.value = chip.dataset.pass || '';
      emailInput.focus();
      chip.classList.add('pulse-once');
      setTimeout(() => chip.classList.remove('pulse-once'), 400);
    });
  });

  // Quote carousel
  const quotes = document.querySelectorAll('.auth-quote');
  const dots = document.querySelectorAll('.auth-quote-dots .dot');
  let qIndex = 0;
  function showQuote(i) {
    quotes.forEach((q, idx) => q.classList.toggle('active', idx === i));
    dots.forEach((d, idx) => d.classList.toggle('active', idx === i));
    qIndex = i;
  }
  dots.forEach((d) => {
    d.addEventListener('click', () => showQuote(Number(d.dataset.dot)));
  });
  if (quotes.length > 1) {
    setInterval(() => showQuote((qIndex + 1) % quotes.length), 5500);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    errorEl.style.display = 'none';

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      errorEl.textContent = 'Please enter both email and password.';
      errorEl.style.display = 'block';
      return;
    }

    submitBtn.disabled = true;
    const btnText = submitBtn.querySelector('.btn-text');
    if (btnText) btnText.textContent = 'Signing in…';
    else submitBtn.textContent = 'Signing in…';

    try {
      const { token, user } = await API.login(email, password);
      Auth.setSession(token, user);
      UI.toast(`Hey ${user.name.split(' ')[0]} — you're in.`, 'success', 'Welcome back');

      setTimeout(() => {
        if (user.role === 'admin') Auth.go('admin/dashboard.html');
        else Auth.go('student/dashboard.html');
      }, 350);
    } catch (err) {
      errorEl.textContent = err.message || 'Login failed. Check your credentials.';
      errorEl.style.display = 'block';
      errorEl.classList.add('shake');
      setTimeout(() => errorEl.classList.remove('shake'), 500);
      submitBtn.disabled = false;
      if (btnText) btnText.textContent = 'Sign in';
      else submitBtn.textContent = 'Sign in';
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLogin);
} else {
  initLogin();
}
