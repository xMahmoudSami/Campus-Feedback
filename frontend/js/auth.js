/**
 * Authentication helpers – JWT + role in localStorage, guards, logout.
 * Relative paths work with file:// and http servers.
 */

/** Resolve a project-root path (e.g. 'login.html', 'admin/dashboard.html') to a relative URL. */
function appUrl(path) {
  // Use href so file:// on Windows still detects /admin/ and /student/
  const href = (window.location.href || '').replace(/\\/g, '/');
  const inAdmin = href.includes('/admin/');
  const inStudent = href.includes('/student/');

  const clean = String(path || '').replace(/^\//, '');

  if (inAdmin) {
    if (clean === 'login.html' || clean === 'index.html' || clean === 'signup.html') {
      return '../' + clean;
    }
    if (clean.startsWith('admin/')) return clean.slice(6);
    if (clean.startsWith('student/')) return '../' + clean;
    return '../' + clean;
  }

  if (inStudent) {
    if (clean === 'login.html' || clean === 'index.html' || clean === 'signup.html') {
      return '../' + clean;
    }
    if (clean.startsWith('student/')) return clean.slice(8);
    if (clean.startsWith('admin/')) return '../' + clean;
    return '../' + clean;
  }

  return clean;
}

const Auth = {
  getToken() {
    return localStorage.getItem('token');
  },

  getUser() {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  },

  setSession(token, user) {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
  },

  clearSession() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },

  isLoggedIn() {
    return !!this.getToken() && !!this.getUser();
  },

  getRole() {
    const u = this.getUser();
    return u ? u.role : null;
  },

  isAdmin() {
    return this.getRole() === 'admin';
  },

  isStudent() {
    return this.getRole() === 'student';
  },

  go(path) {
    window.location.href = appUrl(path);
  },

  requireAuth(requiredRole) {
    if (!this.isLoggedIn()) {
      this.go('login.html');
      return false;
    }
    if (requiredRole && this.getRole() !== requiredRole) {
      if (this.isAdmin()) {
        this.go('admin/dashboard.html');
      } else if (this.isStudent()) {
        this.go('student/dashboard.html');
      } else {
        this.clearSession();
        this.go('login.html');
      }
      return false;
    }
    return true;
  },

  redirectIfLoggedIn() {
    if (!this.isLoggedIn()) return;
    if (this.isAdmin()) {
      this.go('admin/dashboard.html');
    } else if (this.isStudent()) {
      this.go('student/dashboard.html');
    }
  },

  async logout() {
    try {
      await window.API.logout();
    } catch (_) {
      /* ignore */
    }
    this.clearSession();
    this.go('login.html');
  },
};

window.Auth = Auth;
window.appUrl = appUrl;
