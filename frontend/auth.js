(function () {
  'use strict';

  const STORAGE_KEY_TOKEN = 'lawncraft_access_token';
  const STORAGE_KEY_USER = 'lawncraft_user';

  function resolveApiBase() {
    if (typeof window === 'undefined') return '/api';
    if (window.LAWNCRAFT_API_BASE) return window.LAWNCRAFT_API_BASE;

    const { protocol, hostname } = window.location;
    if (protocol === 'file:') return 'http://127.0.0.1:3001/api';
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://127.0.0.1:3001/api';
    }
    return '/api';
  }

  const API_BASE = resolveApiBase();

  function getStoredToken() {
    try {
      return localStorage.getItem(STORAGE_KEY_TOKEN);
    } catch {
      return null;
    }
  }

  function getStoredUser() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_USER);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function setSession(token, user) {
    try {
      localStorage.setItem(STORAGE_KEY_TOKEN, token);
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
    } catch {
      // localStorage unavailable
    }
  }

  function clearSession() {
    try {
      localStorage.removeItem(STORAGE_KEY_TOKEN);
      localStorage.removeItem(STORAGE_KEY_USER);
    } catch {
      // localStorage unavailable
    }
  }

  async function parseJsonSafe(res) {
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      return res.json();
    }
    const text = await res.text();
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const hint = isLocalhost
      ? ' Make sure the backend server is running on http://127.0.0.1:3001'
      : '';
    throw new Error(`Server returned an error page (status ${res.status}).${hint}`);
  }

  async function apiPost(path, body) {
    let res;
    try {
      res = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const hint = isLocalhost ? ' Make sure the backend server is running on http://127.0.0.1:3001' : '';
      throw new Error(`Could not reach the server.${hint}`);
    }
    const data = await parseJsonSafe(res);
    if (!res.ok) {
      const msg = data?.error?.message || data?.detail || 'Something went wrong';
      throw new Error(msg);
    }
    return data;
  }

  async function apiGet(path) {
    const token = getStoredToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let res;
    try {
      res = await fetch(`${API_BASE}${path}`, { headers });
    } catch {
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const hint = isLocalhost ? ' Make sure the backend server is running on http://127.0.0.1:3001' : '';
      throw new Error(`Could not reach the server.${hint}`);
    }
    const data = await parseJsonSafe(res);
    if (!res.ok) {
      const msg = data?.error?.message || data?.detail || 'Something went wrong';
      throw new Error(msg);
    }
    return data;
  }

  async function signup(email, password, fullName) {
    return apiPost('/auth/register', { email, password, fullName });
  }

  async function login(email, password) {
    const data = await apiPost('/auth/login', { email, password });
    setSession(data.session.access_token, data.user);
    return data;
  }

  async function logout() {
    clearSession();
    window.location.href = '/';
  }

  async function fetchUser() {
    const token = getStoredToken();
    if (!token) return null;
    try {
      const data = await apiGet('/auth/me');
      return data.user;
    } catch {
      clearSession();
      return null;
    }
  }

  function isLoggedIn() {
    return !!getStoredToken();
  }

  // ── Password visibility toggle ──

  function setupPasswordToggles() {
    document.querySelectorAll('.password-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = btn.parentElement.querySelector('input');
        if (!input) return;
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        btn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
        btn.innerHTML = isPassword
          ? '<i class="fa-regular fa-eye-slash"></i>'
          : '<i class="fa-regular fa-eye"></i>';
      });
    });
  }

  // ── Inline validation helpers ──

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function showFieldError(input, message) {
    const formGroup = input.closest('.form-group');
    if (!formGroup) return;
    const errorSpan = formGroup.querySelector('.error-message');
    formGroup.classList.add('error');
    formGroup.classList.remove('success');
    if (errorSpan) {
      errorSpan.textContent = message;
      errorSpan.classList.add('show');
    }
  }

  function showFieldSuccess(input) {
    const formGroup = input.closest('.form-group');
    if (!formGroup) return;
    const errorSpan = formGroup.querySelector('.error-message');
    formGroup.classList.remove('error');
    formGroup.classList.add('success');
    if (errorSpan) {
      errorSpan.textContent = '';
      errorSpan.classList.remove('show');
    }
  }

  function clearFieldValidation(input) {
    const formGroup = input.closest('.form-group');
    if (!formGroup) return;
    const errorSpan = formGroup.querySelector('.error-message');
    formGroup.classList.remove('error', 'success');
    if (errorSpan) {
      errorSpan.textContent = '';
      errorSpan.classList.remove('show');
    }
  }

  // ── Form handlers ──

  function setupLoginForm() {
    const form = document.getElementById('loginForm');
    if (!form) return;

    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const formError = document.getElementById('formError');
    const formSuccess = document.getElementById('formSuccess');
    const submitBtn = form.querySelector('button[type="submit"]');

    emailInput.addEventListener('blur', () => {
      const val = emailInput.value.trim();
      if (!val) {
        showFieldError(emailInput, 'Email is required');
      } else if (!validateEmail(val)) {
        showFieldError(emailInput, 'Please enter a valid email address');
      } else {
        showFieldSuccess(emailInput);
      }
    });

    emailInput.addEventListener('input', () => {
      if (validateEmail(emailInput.value.trim())) {
        clearFieldValidation(emailInput);
      }
    });

    passwordInput.addEventListener('blur', () => {
      if (!passwordInput.value) {
        showFieldError(passwordInput, 'Password is required');
      } else if (passwordInput.value.length < 6) {
        showFieldError(passwordInput, 'Password must be at least 6 characters');
      } else {
        showFieldSuccess(passwordInput);
      }
    });

    passwordInput.addEventListener('input', () => {
      if (passwordInput.value.length >= 6) {
        clearFieldValidation(passwordInput);
      }
    });

    function showError(message) {
      if (!formError) return;
      formError.textContent = message;
      formError.style.display = 'flex';
      if (formSuccess) formSuccess.style.display = 'none';
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (formError) formError.style.display = 'none';

      const email = emailInput.value.trim();
      const password = passwordInput.value;

      let valid = true;
      if (!email) { showFieldError(emailInput, 'Email is required'); valid = false; }
      else if (!validateEmail(email)) { showFieldError(emailInput, 'Please enter a valid email address'); valid = false; }
      if (!password) { showFieldError(passwordInput, 'Password is required'); valid = false; }
      else if (password.length < 6) { showFieldError(passwordInput, 'Password must be at least 6 characters'); valid = false; }

      if (!valid) return;

      submitBtn.classList.add('loading');
      submitBtn.disabled = true;

      try {
        await login(email, password);
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
        if (formSuccess) formSuccess.style.display = 'flex';
        form.style.display = 'none';
        setTimeout(() => {
          window.location.href = '/';
        }, 1500);
      } catch (err) {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
        showError(err.message);
      }
    });
  }

  function setupSignupForm() {
    const form = document.getElementById('signupForm');
    if (!form) return;

    const nameInput = document.getElementById('fullName');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const formError = document.getElementById('formError');
    const formSuccess = document.getElementById('formSuccess');
    const submitBtn = form.querySelector('button[type="submit"]');

    nameInput.addEventListener('blur', () => {
      if (!nameInput.value.trim()) {
        showFieldError(nameInput, 'Name is required');
      } else if (nameInput.value.trim().length < 2) {
        showFieldError(nameInput, 'Name must be at least 2 characters');
      } else {
        showFieldSuccess(nameInput);
      }
    });

    nameInput.addEventListener('input', () => {
      if (nameInput.value.trim().length >= 2) {
        clearFieldValidation(nameInput);
      }
    });

    emailInput.addEventListener('blur', () => {
      const val = emailInput.value.trim();
      if (!val) {
        showFieldError(emailInput, 'Email is required');
      } else if (!validateEmail(val)) {
        showFieldError(emailInput, 'Please enter a valid email address');
      } else {
        showFieldSuccess(emailInput);
      }
    });

    emailInput.addEventListener('input', () => {
      if (validateEmail(emailInput.value.trim())) {
        clearFieldValidation(emailInput);
      }
    });

    passwordInput.addEventListener('blur', () => {
      if (!passwordInput.value) {
        showFieldError(passwordInput, 'Password is required');
      } else if (passwordInput.value.length < 6) {
        showFieldError(passwordInput, 'Password must be at least 6 characters');
      } else {
        showFieldSuccess(passwordInput);
      }
    });

    passwordInput.addEventListener('input', () => {
      if (passwordInput.value.length >= 6) {
        clearFieldValidation(passwordInput);
      }
    });

    function showError(message) {
      if (!formError) return;
      formError.textContent = message;
      formError.style.display = 'flex';
      if (formSuccess) formSuccess.style.display = 'none';
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (formError) formError.style.display = 'none';

      const name = nameInput.value.trim();
      const email = emailInput.value.trim();
      const password = passwordInput.value;

      let valid = true;
      if (!name) { showFieldError(nameInput, 'Name is required'); valid = false; }
      else if (name.length < 2) { showFieldError(nameInput, 'Name must be at least 2 characters'); valid = false; }
      if (!email) { showFieldError(emailInput, 'Email is required'); valid = false; }
      else if (!validateEmail(email)) { showFieldError(emailInput, 'Please enter a valid email address'); valid = false; }
      if (!password) { showFieldError(passwordInput, 'Password is required'); valid = false; }
      else if (password.length < 6) { showFieldError(passwordInput, 'Password must be at least 6 characters'); valid = false; }

      if (!valid) return;

      submitBtn.classList.add('loading');
      submitBtn.disabled = true;

      try {
        await signup(email, password, name);
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
        if (formSuccess) formSuccess.style.display = 'flex';
        form.style.display = 'none';
        setTimeout(() => {
          window.location.href = '/login.html';
        }, 1500);
      } catch (err) {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
        showError(err.message);
      }
    });
  }

  // ── Navigation injection ──

  function injectAuthNav() {
    const navList = document.querySelector('.nav-links');
    if (!navList) return;

    const existing = navList.querySelector('.nav-auth-link');
    if (existing) {
      // Update existing link on auth pages
      if (isLoggedIn()) {
        existing.textContent = 'My Account';
        existing.href = '#';
        if (!existing.dataset.authHandler) {
          existing.dataset.authHandler = '1';
          existing.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
          });
        }
      }
      return;
    }

    const li = document.createElement('li');
    const a = document.createElement('a');
    a.className = 'nav-auth-link';

    if (isLoggedIn()) {
      a.textContent = 'Sign Out';
      a.href = '#';
      a.addEventListener('click', (e) => {
        e.preventDefault();
        logout();
      });
    } else {
      a.textContent = 'Sign In';
      a.href = '/login.html';
    }

    li.appendChild(a);
    navList.appendChild(li);
  }

  function injectDirectoryAuth() {
    const directoryGrid = document.querySelector('.directory-grid');
    if (!directoryGrid) return;

    const existingSection = directoryGrid.querySelector('.directory-auth-section');
    if (existingSection) return;

    const col = document.createElement('div');
    col.className = 'directory-column directory-auth-section';

    if (isLoggedIn()) {
      const user = getStoredUser();
      col.innerHTML = `
        <h3>Account</h3>
        <span style="font-size:0.85rem;color:var(--text-light);display:block;margin-bottom:0.4rem;">${user?.email || 'Signed in'}</span>
        <a href="#" id="directoryLogout">Sign Out</a>
      `;
      setTimeout(() => {
        const logoutLink = document.getElementById('directoryLogout');
        if (logoutLink) {
          logoutLink.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
          });
        }
      }, 0);
    } else {
      col.innerHTML = `
        <h3>Account</h3>
        <a href="/login.html">Sign In</a>
        <a href="/signup.html">Create Account</a>
      `;
    }

    directoryGrid.appendChild(col);
  }

  // ── Redirect logged-in users away from auth pages ──

  function redirectIfAuthed() {
    const path = window.location.pathname;
    const isLoginPage = path === '/login' || path === '/login.html' || path.endsWith('/login.html');
    const isSignupPage = path === '/signup' || path === '/signup.html' || path.endsWith('/signup.html');

    if (isLoggedIn() && (isLoginPage || isSignupPage)) {
      window.location.replace('/');
      return true;
    }
    return false;
  }

  // ── Init ──

  function setCurrentYear() {
    const el = document.getElementById('currentYear');
    if (el) el.textContent = new Date().getFullYear();
  }

  function init() {
    if (redirectIfAuthed()) return;
    setCurrentYear();
    setupPasswordToggles();
    injectAuthNav();
    injectDirectoryAuth();
    setupLoginForm();
    setupSignupForm();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
