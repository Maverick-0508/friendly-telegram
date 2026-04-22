/**
 * Supervisor Dashboard – JavaScript
 *
 * Handles:
 *   - Login / logout (JWT stored in localStorage)
 *   - View routing (sidebar navigation)
 *   - Data fetching from the FastAPI backend (/api/…)
 *   - Rendering: stats, work order tables, KPI report, exceptions, property search
 *   - Work order status updates via inline modal
 */

// ─── Configuration ───────────────────────────────────────────────────────────

// API_BASE defaults to '/api' (same-origin, works when frontend is served by
// the backend). To point at a different backend host, set a global variable
// before this script runs:
//   <script>window.DASHBOARD_API_BASE = 'https://your-api.example.com/api';</script>
const API_BASE = (typeof window !== 'undefined' && window.DASHBOARD_API_BASE)
  ? window.DASHBOARD_API_BASE
  : '/api';

// ─── State ───────────────────────────────────────────────────────────────────

let currentUser = null;
let currentView = 'overview';
let workOrderDetailId = null;
let modalLastFocusedElement = null;

// ─── Auth helpers ─────────────────────────────────────────────────────────────

function getToken() {
  return localStorage.getItem('dashboard_token');
}

function setToken(token) {
  localStorage.setItem('dashboard_token', token);
}

function clearToken() {
  localStorage.removeItem('dashboard_token');
  localStorage.removeItem('dashboard_user');
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getToken()}`,
  };
}

async function apiFetch(path, options = {}) {
  const resp = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: authHeaders(),
  });

  if (resp.status === 401) {
    clearToken();
    showLogin();
    throw new Error('Session expired – please log in again.');
  }

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${resp.status}`);
  }

  // 204 No Content
  if (resp.status === 204) return null;

  return resp.json();
}

// ─── Login / Logout ───────────────────────────────────────────────────────────

function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').classList.remove('visible');
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').classList.add('visible');
}

async function login(email, password) {
  const resp = await fetch(`${API_BASE}/auth/login/json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.detail || 'Invalid credentials');
  }

  const data = await resp.json();
  setToken(data.access_token);
}

async function loadCurrentUser() {
  const user = await apiFetch('/auth/me');
  currentUser = user;
  localStorage.setItem('dashboard_user', JSON.stringify(user));

  // Update sidebar user info
  const initials = (user.full_name || user.email || '?')
    .split(' ')
    .map(p => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  document.getElementById('user-avatar').textContent = initials;
  document.getElementById('user-name').textContent = user.full_name || user.email;
  document.getElementById('user-role').textContent = user.role || 'supervisor';
  return user;
}

function logout() {
  clearToken();
  currentUser = null;
  showLogin();
}

function isDashboardRoleAllowed(user) {
  const role = String(user?.role || '').toLowerCase();
  return role === 'supervisor' || role === 'admin';
}

function clearLoginMessages() {
  document.getElementById('login-error').classList.remove('visible');
  document.getElementById('login-info').classList.remove('visible');
}

function showLoginError(message) {
  const errorEl = document.getElementById('login-error');
  errorEl.textContent = message;
  errorEl.classList.add('visible');
}

function showLoginInfo(message) {
  const infoEl = document.getElementById('login-info');
  infoEl.textContent = message;
  infoEl.classList.add('visible');
}

function handleUnauthorizedDashboardAccess() {
  clearToken();
  currentUser = null;
  showLogin();
  clearLoginMessages();
  showLoginInfo('Access restricted: Supervisor and Admin accounts only.');
}

// ─── Toast notifications ──────────────────────────────────────────────────────

let toastTimer = null;

function showToast(message, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = `toast visible toast-${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 3500);
}

// ─── View routing ─────────────────────────────────────────────────────────────

function navigate(viewId) {
  currentView = viewId;

  // Update active link
  document.querySelectorAll('.sidebar-nav a').forEach(a => {
    a.classList.toggle('active', a.dataset.view === viewId);
  });

  // Show/hide sections
  document.querySelectorAll('.view-section').forEach(s => {
    s.classList.toggle('active', s.id === `view-${viewId}`);
  });

  // Update top-bar title
  const titles = {
    overview:   'Overview',
    queue:      'Incoming Queue',
    planning:   'Planning Board',
    active:     'Active Jobs',
    exceptions: 'Exceptions',
    report:     'KPI Report',
    workorders: 'All Work Orders',
    property:   'Property History',
  };
  document.getElementById('page-title').textContent = titles[viewId] || viewId;

  // Load data for the view
  loadView(viewId);

  // Close mobile sidebar
  closeMobileSidebar();
}

async function loadView(viewId) {
  switch (viewId) {
    case 'overview':
      await loadStats();
      break;
    case 'queue':
      await loadWorkOrderTable('queue', '/supervisor/queue');
      break;
    case 'planning':
      await loadWorkOrderTable('planning', '/supervisor/planning');
      break;
    case 'active':
      await loadWorkOrderTable('active', '/supervisor/active');
      break;
    case 'exceptions':
      await loadExceptions();
      break;
    case 'report':
      await loadReport();
      break;
    case 'workorders':
      await loadWorkOrderTable('workorders', '/work-orders');
      break;
    case 'property':
      // Property search – don't auto-load
      break;
  }
}

// ─── Stats / Overview ─────────────────────────────────────────────────────────

async function loadStats() {
  const container = document.getElementById('stats-container');
  container.innerHTML = `<div class="stat-card"><div class="spinner"></div> Loading…</div>`;

  try {
    const data = await apiFetch('/supervisor/stats');
    const byStatus = data.work_orders_by_status || {};

    const totalOpen = (byStatus.incoming || 0) + (byStatus.reviewed || 0) + (byStatus.planned || 0) + (byStatus.in_progress || 0);

    container.innerHTML = `
      <div class="stat-card accent-card">
        <div class="stat-label">Incoming</div>
        <div class="stat-value">${byStatus.incoming || 0}</div>
        <div class="stat-sub">awaiting review</div>
      </div>
      <div class="stat-card blue-card">
        <div class="stat-label">Planned</div>
        <div class="stat-value">${(byStatus.reviewed || 0) + (byStatus.planned || 0)}</div>
        <div class="stat-sub">reviewed + planned</div>
      </div>
      <div class="stat-card accent-card">
        <div class="stat-label">In Progress</div>
        <div class="stat-value">${byStatus.in_progress || 0}</div>
        <div class="stat-sub">currently active</div>
      </div>
      <div class="stat-card green-card">
        <div class="stat-label">Completed</div>
        <div class="stat-value">${(byStatus.completed || 0) + (byStatus.verified || 0)}</div>
        <div class="stat-sub">completed + verified</div>
      </div>
      <div class="stat-card red-card">
        <div class="stat-label">Open Issues</div>
        <div class="stat-value">${data.open_issues || 0}</div>
        <div class="stat-sub">unresolved</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Pending Tasks</div>
        <div class="stat-value">${data.pending_tasks || 0}</div>
        <div class="stat-sub">across all jobs</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Open</div>
        <div class="stat-value">${totalOpen}</div>
        <div class="stat-sub">active work orders</div>
      </div>
      <div class="stat-card red-card">
        <div class="stat-label">Cancelled</div>
        <div class="stat-value">${byStatus.cancelled || 0}</div>
        <div class="stat-sub">all time</div>
      </div>
    `;

    // Update sidebar queue badge
    const badge = document.getElementById('queue-badge');
    if (badge) badge.textContent = byStatus.incoming || 0;

  } catch (err) {
    container.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

// ─── Generic work order table ─────────────────────────────────────────────────

async function loadWorkOrderTable(viewId, endpoint) {
  const tbody = document.getElementById(`tbody-${viewId}`);
  const countEl = document.getElementById(`count-${viewId}`);

  tbody.innerHTML = `<tr class="loading-row"><td colspan="7"><span class="spinner"></span> Loading…</td></tr>`;

  try {
    const data = await apiFetch(endpoint);
    const items = Array.isArray(data) ? data : [];

    if (countEl) countEl.textContent = `${items.length} record${items.length !== 1 ? 's' : ''}`;

    if (items.length === 0) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="7">No work orders found.</td></tr>`;
      return;
    }

    tbody.innerHTML = items.map(wo => renderWorkOrderRow(wo)).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="alert alert-danger">${err.message}</div></td></tr>`;
  }
}

function renderWorkOrderRow(wo) {
  const targetDate = wo.target_date ? formatDate(wo.target_date) : '—';
  const created = formatDate(wo.created_at);

  return `
    <tr>
      <td>
        <span class="td-link td-main" onclick="openWorkOrderDetail(${wo.id})">#${wo.id} ${esc(wo.title)}</span>
      </td>
      <td>
        <div>${esc(wo.client_name)}</div>
        ${wo.client_email ? `<div class="td-addr">${esc(wo.client_email)}</div>` : ''}
      </td>
      <td class="td-addr">${esc(wo.property_address)}</td>
      <td><span class="badge-status status-${wo.status}">${labelStatus(wo.status)}</span></td>
      <td><span class="badge-priority priority-${wo.priority}">${esc(wo.priority)}</span></td>
      <td>${targetDate}</td>
      <td>${created}</td>
    </tr>
  `;
}

// ─── Exceptions ───────────────────────────────────────────────────────────────

async function loadExceptions() {
  const container = document.getElementById('exceptions-container');
  container.innerHTML = `<div class="alert alert-info"><span class="spinner"></span> Loading exceptions…</div>`;

  try {
    const data = await apiFetch('/supervisor/exceptions');

    let html = '';

    html += renderExceptionGroup(
      'Overdue',
      data.overdue || [],
      'dot-danger',
      'These jobs have passed their target date.'
    );
    html += renderExceptionGroup(
      'Blocked – High-Severity Issues',
      data.blocked || [],
      'dot-warning',
      'These jobs have unresolved high-severity issues.'
    );
    html += renderExceptionGroup(
      'Missing Field Logs',
      data.missing_field_logs || [],
      'dot-info',
      'In-progress or completed jobs with no field log submitted.'
    );

    container.innerHTML = html || `<div class="alert alert-success">No exceptions found. All clear!</div>`;
  } catch (err) {
    container.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

function renderExceptionGroup(title, items, dotClass, description) {
  const tableRows = items.length === 0
    ? `<tr class="empty-row"><td colspan="6">None</td></tr>`
    : items.map(wo => renderWorkOrderRow(wo)).join('');

  return `
    <div class="exception-group">
      <h2>
        <span class="dot ${dotClass}"></span>
        ${title}
        <span style="color:var(--text-light);font-weight:400">(${items.length})</span>
      </h2>
      <p style="font-size:0.82rem;color:var(--text-light);margin-bottom:0.6rem">${description}</p>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Work Order</th>
              <th>Client</th>
              <th>Address</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Target Date</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </div>
  `;
}

// ─── KPI Report ───────────────────────────────────────────────────────────────

async function loadReport(days = 30) {
  const container = document.getElementById('report-container');
  container.innerHTML = `<div class="alert alert-info"><span class="spinner"></span> Loading report…</div>`;

  try {
    const data = await apiFetch(`/supervisor/report?days=${days}`);

    container.innerHTML = `
      <div class="kpi-grid">

        <div class="kpi-card">
          <h3>Work Orders – last ${data.period_days} days</h3>
          <div class="kpi-row">
            <span class="kpi-label">Total created</span>
            <span class="kpi-val">${data.work_orders.total}</span>
          </div>
          <div class="kpi-row">
            <span class="kpi-label">Completed / verified</span>
            <span class="kpi-val">${data.work_orders.completed}</span>
          </div>
          <div class="kpi-row">
            <span class="kpi-label">Completion rate</span>
            <span class="kpi-val">${data.work_orders.total > 0
              ? Math.round((data.work_orders.completed / data.work_orders.total) * 100) + '%'
              : '—'}</span>
          </div>
        </div>

        <div class="kpi-card">
          <h3>Task Completion</h3>
          <div class="kpi-big">${data.tasks.completion_rate_pct}%</div>
          <div class="kpi-sub">of all planned tasks completed</div>
          <div class="kpi-row" style="margin-top:0.75rem">
            <span class="kpi-label">Planned</span>
            <span class="kpi-val">${data.tasks.total_planned}</span>
          </div>
          <div class="kpi-row">
            <span class="kpi-label">Completed</span>
            <span class="kpi-val">${data.tasks.completed}</span>
          </div>
        </div>

        <div class="kpi-card">
          <h3>Labour Hours</h3>
          <div class="kpi-big">${data.labour.total_hours.toFixed(1)}</div>
          <div class="kpi-sub">total hours logged</div>
          <div class="kpi-row" style="margin-top:0.75rem">
            <span class="kpi-label">Avg per field log</span>
            <span class="kpi-val">${data.labour.avg_hours_per_log.toFixed(1)} hrs</span>
          </div>
        </div>

        <div class="kpi-card">
          <h3>Turnaround Time</h3>
          <div class="kpi-big">${(data.turnaround.avg_hours_to_complete / 24).toFixed(1)}</div>
          <div class="kpi-sub">avg days from creation to completion</div>
          <div class="kpi-row" style="margin-top:0.75rem">
            <span class="kpi-label">Avg hours</span>
            <span class="kpi-val">${data.turnaround.avg_hours_to_complete.toFixed(1)} hrs</span>
          </div>
        </div>

        <div class="kpi-card">
          <h3>Issues & Rework</h3>
          <div class="kpi-row">
            <span class="kpi-label">Total issues logged</span>
            <span class="kpi-val">${data.issues.total}</span>
          </div>
          <div class="kpi-row">
            <span class="kpi-label">Resolved</span>
            <span class="kpi-val">${data.issues.resolved}</span>
          </div>
          <div class="kpi-row">
            <span class="kpi-label">Resolution rate</span>
            <span class="kpi-val">${data.issues.resolution_rate_pct}%</span>
          </div>
        </div>

      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

// ─── Property search ──────────────────────────────────────────────────────────

async function searchProperty() {
  const input = document.getElementById('property-search-input');
  const query = input.value.trim();
  if (!query) return;

  const tbody = document.getElementById('tbody-property');
  const countEl = document.getElementById('count-property');

  tbody.innerHTML = `<tr class="loading-row"><td colspan="7"><span class="spinner"></span> Searching…</td></tr>`;

  try {
    const data = await apiFetch(`/supervisor/property?address=${encodeURIComponent(query)}`);
    const items = Array.isArray(data) ? data : [];

    if (countEl) countEl.textContent = `${items.length} record${items.length !== 1 ? 's' : ''}`;

    if (items.length === 0) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="7">No work orders found for this address.</td></tr>`;
      return;
    }

    tbody.innerHTML = items.map(wo => renderWorkOrderRow(wo)).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="alert alert-danger">${err.message}</div></td></tr>`;
  }
}

// ─── Work Order Detail Modal ──────────────────────────────────────────────────

async function openWorkOrderDetail(id) {
  workOrderDetailId = id;
  const overlay = document.getElementById('wo-modal');
  modalLastFocusedElement = document.activeElement;
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');

  const body = document.getElementById('modal-body-content');
  body.innerHTML = `<div class="alert alert-info"><span class="spinner"></span> Loading…</div>`;

  try {
    const wo = await apiFetch(`/work-orders/${id}`);
    renderWorkOrderModal(wo);
    const closeBtn = document.getElementById('modal-close-btn');
    if (closeBtn) closeBtn.focus();
  } catch (err) {
    body.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

function renderWorkOrderModal(wo) {
  document.getElementById('modal-title').textContent = `#${wo.id} – ${wo.title}`;

  const statusOptions = ['incoming', 'reviewed', 'planned', 'in_progress', 'completed', 'verified', 'cancelled']
    .map(s => `<option value="${s}" ${s === wo.status ? 'selected' : ''}>${labelStatus(s)}</option>`)
    .join('');

  document.getElementById('modal-body-content').innerHTML = `
    <div class="detail-grid">
      <div class="detail-item">
        <label>Status</label>
        <span><span class="badge-status status-${wo.status}">${labelStatus(wo.status)}</span></span>
      </div>
      <div class="detail-item">
        <label>Priority</label>
        <span><span class="badge-priority priority-${wo.priority}">${esc(wo.priority)}</span></span>
      </div>
      <div class="detail-item">
        <label>Client</label>
        <span>${esc(wo.client_name)}</span>
      </div>
      <div class="detail-item">
        <label>Service Type</label>
        <span>${esc(wo.service_type || '—')}</span>
      </div>
      <div class="detail-item">
        <label>Phone</label>
        <span>${esc(wo.client_phone || '—')}</span>
      </div>
      <div class="detail-item">
        <label>Email</label>
        <span>${esc(wo.client_email || '—')}</span>
      </div>
      <div class="detail-item detail-full">
        <label>Property Address</label>
        <span>${esc(wo.property_address)}</span>
      </div>
      <div class="detail-item">
        <label>Target Date</label>
        <span>${wo.target_date ? formatDate(wo.target_date) : '—'}</span>
      </div>
      <div class="detail-item">
        <label>Created</label>
        <span>${formatDate(wo.created_at)}</span>
      </div>
      <div class="detail-item">
        <label>Started</label>
        <span>${wo.started_at ? formatDate(wo.started_at) : '—'}</span>
      </div>
      <div class="detail-item">
        <label>Completed</label>
        <span>${wo.completed_at ? formatDate(wo.completed_at) : '—'}</span>
      </div>
      ${wo.description ? `
      <div class="detail-item detail-full">
        <label>Description</label>
        <div class="detail-notes">${esc(wo.description)}</div>
      </div>` : ''}
      ${wo.supervisor_notes ? `
      <div class="detail-item detail-full">
        <label>Supervisor Notes</label>
        <div class="detail-notes">${esc(wo.supervisor_notes)}</div>
      </div>` : ''}
    </div>

    <div class="status-update-row">
      <label for="modal-status-select">Update Status</label>
      <select id="modal-status-select">${statusOptions}</select>
      <button class="btn-save" onclick="saveStatusUpdate(${wo.id})">Save</button>
    </div>
  `;
}

async function saveStatusUpdate(id) {
  const select = document.getElementById('modal-status-select');
  const newStatus = select.value;

  try {
    await apiFetch(`/work-orders/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status: newStatus }),
    });
    showToast(`Status updated to "${labelStatus(newStatus)}".`, 'success');
    closeModal();
    // Refresh current view
    loadView(currentView);
    // Refresh overview badge
    if (currentView !== 'overview') loadStats();
  } catch (err) {
    showToast(`Failed to update: ${err.message}`, 'error');
  }
}

function closeModal() {
  const overlay = document.getElementById('wo-modal');
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  workOrderDetailId = null;
  if (modalLastFocusedElement && typeof modalLastFocusedElement.focus === 'function') {
    modalLastFocusedElement.focus();
  }
  modalLastFocusedElement = null;
}

function getModalFocusableElements() {
  const modal = document.querySelector('#wo-modal .modal');
  if (!modal) return [];

  return [...modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter(el => !el.disabled && el.offsetParent !== null);
}

function handleModalKeydown(e) {
  const overlay = document.getElementById('wo-modal');
  if (!overlay.classList.contains('open')) return;

  if (e.key === 'Escape') {
    e.preventDefault();
    closeModal();
    return;
  }

  if (e.key !== 'Tab') return;

  const focusable = getModalFocusableElements();
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

// ─── Mobile sidebar ───────────────────────────────────────────────────────────

function openMobileSidebar() {
  document.querySelector('.sidebar').classList.add('open');
  document.querySelector('.sidebar-overlay').classList.add('open');
}

function closeMobileSidebar() {
  document.querySelector('.sidebar').classList.remove('open');
  document.querySelector('.sidebar-overlay').classList.remove('open');
}

// ─── Utility helpers ──────────────────────────────────────────────────────────

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function labelStatus(s) {
  const map = {
    incoming:    'Incoming',
    reviewed:    'Reviewed',
    planned:     'Planned',
    in_progress: 'In Progress',
    completed:   'Completed',
    verified:    'Verified',
    cancelled:   'Cancelled',
  };
  return map[s] || s;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  // Wire up login form
  document.getElementById('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btn      = e.target.querySelector('button[type=submit]');

    clearLoginMessages();
    btn.disabled = true;
    btn.textContent = 'Signing in…';

    try {
      await login(email, password);
      const user = await loadCurrentUser();
      if (!isDashboardRoleAllowed(user)) {
        handleUnauthorizedDashboardAccess();
        return;
      }
      showApp();
      navigate('overview');
    } catch (err) {
      showLoginError(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  });

  // Wire up sidebar nav
  document.querySelectorAll('.sidebar-nav a[data-view]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      navigate(a.dataset.view);
    });
  });

  // Logout button
  document.getElementById('logout-btn').addEventListener('click', logout);

  // Hamburger
  document.querySelector('.hamburger-btn').addEventListener('click', openMobileSidebar);
  document.querySelector('.sidebar-overlay').addEventListener('click', closeMobileSidebar);

  // Refresh button
  document.getElementById('refresh-btn').addEventListener('click', () => loadView(currentView));

  // Modal close
  document.getElementById('modal-close-btn').addEventListener('click', closeModal);
  document.getElementById('wo-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('wo-modal')) closeModal();
  });
  document.getElementById('wo-modal').addEventListener('keydown', handleModalKeydown);

  // KPI period select
  document.getElementById('report-days-select').addEventListener('change', e => {
    loadReport(Number(e.target.value));
  });

  // Property search
  document.getElementById('property-search-btn').addEventListener('click', searchProperty);
  document.getElementById('property-search-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') searchProperty();
  });

  // Keyboard: close modal on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModal();
      closeMobileSidebar();
    }
  });

  // Check for existing session
  if (getToken()) {
    try {
      const user = await loadCurrentUser();
      if (!isDashboardRoleAllowed(user)) {
        handleUnauthorizedDashboardAccess();
        return;
      }
      showApp();
      navigate('overview');
    } catch {
      showLogin();
    }
  } else {
    showLogin();
  }
}

document.addEventListener('DOMContentLoaded', init);
