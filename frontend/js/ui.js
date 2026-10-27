/**
 * Shared UI helpers – toasts, loading, empty states, modals, sidebar, badges.
 * Always use textContent for user-supplied data (never innerHTML).
 */

const UI = {
  // ─── Toasts ───────────────────────────────────────────────
  toast(message, type = 'info', title) {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const titles = { success: 'Success', error: 'Error', warning: 'Warning', info: 'Info' };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const body = document.createElement('div');
    body.className = 'toast-body';

    const titleEl = document.createElement('div');
    titleEl.className = 'toast-title';
    titleEl.textContent = title || titles[type] || 'Info';

    const msgEl = document.createElement('div');
    msgEl.className = 'toast-msg';
    msgEl.textContent = message;

    body.appendChild(titleEl);
    body.appendChild(msgEl);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => toast.remove());

    toast.appendChild(body);
    toast.appendChild(closeBtn);
    container.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, 4500);
  },

  // ─── Loading ──────────────────────────────────────────────
  showLoading(container, message = 'Loading...') {
    if (typeof container === 'string') container = document.querySelector(container);
    if (!container) return;
    container.textContent = '';
    const wrap = document.createElement('div');
    wrap.className = 'loading-spinner';
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    const text = document.createElement('span');
    text.textContent = message;
    wrap.appendChild(spinner);
    wrap.appendChild(text);
    container.appendChild(wrap);
  },

  // ─── Empty state ──────────────────────────────────────────
  showEmpty(container, title, message) {
    if (typeof container === 'string') container = document.querySelector(container);
    if (!container) return;
    container.textContent = '';
    const wrap = document.createElement('div');
    wrap.className = 'empty-state';
    const h3 = document.createElement('h3');
    h3.textContent = title;
    const p = document.createElement('p');
    p.textContent = message;
    wrap.appendChild(h3);
    wrap.appendChild(p);
    container.appendChild(wrap);
  },

  // ─── Status badge ─────────────────────────────────────────
  statusBadge(status) {
    const span = document.createElement('span');
    const s = (status || '').toLowerCase();
    let cls = 'badge-info';
    let label = status || '';
    if (s === 'published' || s === 'available' || s === 'completed') {
      cls = 'badge-published';
      label = s.charAt(0).toUpperCase() + s.slice(1);
    } else if (s === 'draft') {
      cls = 'badge-draft';
      label = 'Draft';
    } else if (s === 'closed') {
      cls = 'badge-closed';
      label = 'Closed';
    }
    span.className = `badge ${cls}`;
    span.textContent = label;
    return span;
  },

  // ─── Format date ──────────────────────────────────────────
  formatDate(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return iso;
    }
  },

  // ─── Stars display ────────────────────────────────────────
  stars(rating) {
    const span = document.createElement('span');
    span.className = 'stars';
    const r = Number(rating);
    if (!r && r !== 0) {
      span.textContent = '—';
    } else {
      span.textContent = `${Number(r).toFixed(r % 1 ? 1 : 0)}/5`;
    }
    return span;
  },

  // ─── Avatar initials ──────────────────────────────────────
  avatar(name, index = 0) {
    const span = document.createElement('span');
    span.className = `student-avatar avatar-${(index % 6) + 1}`;
    const parts = (name || '?').trim().split(/\s+/);
    const initials =
      parts.length >= 2
        ? (parts[0][0] + parts[1][0]).toUpperCase()
        : (parts[0] || '?').substring(0, 2).toUpperCase();
    span.textContent = initials;
    return span;
  },

  // ─── Confirm modal ────────────────────────────────────────
  confirm(title, message) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';

      const modal = document.createElement('div');
      modal.className = 'modal';

      const header = document.createElement('div');
      header.className = 'modal-header';
      const h3 = document.createElement('h3');
      h3.textContent = title;
      const closeBtn = document.createElement('button');
      closeBtn.className = 'modal-close';
      closeBtn.textContent = '×';
      header.appendChild(h3);
      header.appendChild(closeBtn);

      const body = document.createElement('div');
      body.className = 'modal-body';
      const p = document.createElement('p');
      p.textContent = message;
      body.appendChild(p);

      const footer = document.createElement('div');
      footer.className = 'modal-footer';
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn btn-secondary';
      cancelBtn.textContent = 'Cancel';
      const okBtn = document.createElement('button');
      okBtn.className = 'btn btn-danger';
      okBtn.textContent = 'Confirm';
      footer.appendChild(cancelBtn);
      footer.appendChild(okBtn);

      modal.appendChild(header);
      modal.appendChild(body);
      modal.appendChild(footer);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      requestAnimationFrame(() => overlay.classList.add('show'));

      const cleanup = (result) => {
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 200);
        resolve(result);
      };

      closeBtn.addEventListener('click', () => cleanup(false));
      cancelBtn.addEventListener('click', () => cleanup(false));
      okBtn.addEventListener('click', () => cleanup(true));
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) cleanup(false);
      });
    });
  },

  // ─── Sidebar toggle (mobile) ──────────────────────────────
  initSidebar() {
    const toggle = document.querySelector('.menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    let overlay = document.querySelector('.sidebar-overlay');

    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'sidebar-overlay';
      document.body.appendChild(overlay);
    }

    if (toggle && sidebar) {
      toggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('show');
      });
      overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('show');
      });
    }
  },

  // ─── Populate user info in sidebar / topbar ───────────────
  populateUserInfo() {
    const user = Auth.getUser();
    if (!user) return;

    document.querySelectorAll('[data-user-name]').forEach((el) => {
      el.textContent = user.name || 'User';
    });
    document.querySelectorAll('[data-user-email]').forEach((el) => {
      el.textContent = user.email || '';
    });
    document.querySelectorAll('[data-user-role]').forEach((el) => {
      el.textContent = user.role === 'admin' ? 'Administrator' : 'Student';
    });
    document.querySelectorAll('[data-user-initials]').forEach((el) => {
      const parts = (user.name || 'U').trim().split(/\s+/);
      el.textContent =
        parts.length >= 2
          ? (parts[0][0] + parts[1][0]).toUpperCase()
          : (parts[0] || 'U').substring(0, 2).toUpperCase();
    });
  },

  // ─── Bind logout buttons ──────────────────────────────────
  bindLogout() {
    document.querySelectorAll('[data-logout]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        Auth.logout();
      });
    });
  },

  // ─── Highlight active nav item ────────────────────────────
  setActiveNav(page) {
    document.querySelectorAll('.nav-item').forEach((item) => {
      item.classList.toggle('active', item.dataset.page === page);
    });
  },

  // ─── Handle API errors consistently ───────────────────────
  handleError(err) {
    if (err.status === 403) {
      this.toast('You are not allowed to perform this action.', 'error', 'Forbidden');
    } else if (err.status === 401) {
      // api.js already redirects
    } else {
      this.toast(err.message || 'Something went wrong', 'error');
    }
  },
};

window.UI = UI;
