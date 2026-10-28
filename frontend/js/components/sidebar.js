/**
 * Standalone Sidebar Component – Campus Feedback
 * Centralized, single source of truth for the application sidebar.
 * Automatically mounts on `<aside class="sidebar">` across all pages.
 */

const SidebarComponent = {
  /**
   * Returns the HTML template for the sidebar.
   * @param {string} activePage - 'dashboard' | 'surveys' | 'feedback' | ''
   * @param {object|null} user - Current authenticated user
   */
  getTemplate(activePage = '', user = null) {
    const isStudent = !user || user.role !== 'admin';
    const roleIcon = isStudent ? 'assets/student.svg' : 'assets/admin.svg';
    const logoSrc = typeof appUrl === 'function' ? appUrl('assets/logo.svg') : '../assets/logo.svg';
    const iconSrc = typeof appUrl === 'function' ? appUrl(roleIcon) : `../${roleIcon}`;
    const userName = user ? (user.name || 'User') : (isStudent ? 'Student' : 'Admin');
    const userEmail = user ? (user.email || '') : (isStudent ? 'student@example.com' : 'admin@example.com');
    const altText = isStudent ? 'Student Account' : 'Admin Account';

    return `
      <div class="sidebar-header">
        <img src="${logoSrc}" alt="Campus Feedback" class="sidebar-logo-img" />
        <div class="sidebar-title">Campus Feedback</div>
      </div>
      <nav class="sidebar-nav">
        <a class="nav-item ${activePage === 'dashboard' ? 'active' : ''}" data-page="dashboard" href="dashboard.html">
          Dashboard
        </a>
        <a class="nav-item ${activePage === 'surveys' ? 'active' : ''}" data-page="surveys" href="surveys.html">
          Surveys
        </a>
        <a class="nav-item ${activePage === 'feedback' ? 'active' : ''}" data-page="feedback" href="feedback.html">
          Feedback
        </a>
      </nav>
      <div class="sidebar-footer">
        <div class="user-info">
          <div class="user-avatar" data-user-initials>
            <img src="${iconSrc}" alt="${altText}" class="role-avatar-img" />
          </div>
          <div class="user-details">
            <div class="user-name" data-user-name>${userName}</div>
            <div class="user-email" data-user-email>${userEmail}</div>
          </div>
          <button class="btn-logout" data-logout title="Logout" aria-label="Logout">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
          </button>
        </div>
      </div>
    `;
  },

  /**
   * Renders the sidebar into the target container.
   * @param {string|HTMLElement} target - CSS selector or DOM element
   * @param {string} [activePage] - Active nav item identifier
   */
  render(target, activePage) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return;

    const user = typeof Auth !== 'undefined' && typeof Auth.getUser === 'function' ? Auth.getUser() : null;
    const page = activePage || el.dataset.active || '';

    el.innerHTML = this.getTemplate(page, user);

    // Bind logout button immediately
    const logoutBtn = el.querySelector('[data-logout]');
    if (logoutBtn && typeof Auth !== 'undefined' && typeof Auth.logout === 'function') {
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        Auth.logout();
      });
    }
  },

  /**
   * Initializes the sidebar on page load.
   * Finds `<aside class="sidebar">` and mounts the component.
   */
  init(activePage) {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
      this.render(sidebar, activePage || sidebar.dataset.active || '');
    }
  }
};

// Expose globally
window.SidebarComponent = SidebarComponent;

// Auto-mount immediately or on DOM ready
(function () {
  const mount = () => {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar && !sidebar.querySelector('.sidebar-header')) {
      SidebarComponent.init();
    }
  };

  mount();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  }
})();
