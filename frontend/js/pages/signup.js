/**
 * Sign up page – student registration
 */
document.addEventListener('DOMContentLoaded', () => {
  Auth.redirectIfLoggedIn();

  const form = document.getElementById('signup-form');
  const nameInput = document.getElementById('name');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const password2Input = document.getElementById('password2');
  const submitBtn = document.getElementById('signup-btn');
  const errorEl = document.getElementById('signup-error');
  const togglePw = document.getElementById('toggle-pw');

  if (togglePw) {
    togglePw.addEventListener('click', () => {
      const isPw = passwordInput.type === 'password';
      passwordInput.type = isPw ? 'text' : 'password';
      togglePw.textContent = isPw ? 'Hide' : 'Show';
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    errorEl.style.display = 'none';

    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const password2 = password2Input.value;

    if (!name || !email || !password) {
      showErr('Please fill in all fields.');
      return;
    }
    if (password.length < 6) {
      showErr('Password must be at least 6 characters.');
      return;
    }
    if (password !== password2) {
      showErr('Passwords do not match.');
      return;
    }

    submitBtn.disabled = true;
    const btnText = submitBtn.querySelector('.btn-text');
    if (btnText) btnText.textContent = 'Creating account…';

    try {
      const { token, user } = await API.register({ name, email, password, role: 'student' });
      Auth.setSession(token, user);
      UI.toast(`Account ready — welcome, ${user.name.split(' ')[0]}!`, 'success', 'You\'re in');
      setTimeout(() => Auth.go('student/dashboard.html'), 400);
    } catch (err) {
      showErr(err.message || 'Could not create account.');
      submitBtn.disabled = false;
      if (btnText) btnText.textContent = 'Create account';
    }
  });

  function showErr(msg) {
    errorEl.textContent = msg;
    errorEl.style.display = 'block';
    errorEl.classList.add('shake');
    setTimeout(() => errorEl.classList.remove('shake'), 500);
  }
});
