const TOKEN_KEY = 'lawncraft_admin_token';
const state = { token: sessionStorage.getItem(TOKEN_KEY) || '', orders: [], invoices: [], view: 'overview' };
const unsupportedViews = new Set(['loyalty', 'receipts', 'dunning', 'inventory', 'purchasing', 'payroll', 'timesheets', 'fleet', 'automation', 'quotes', 'contracts', 'clients', 'territory', 'widget', 'exceptions', 'report', 'property', 'control', 'permissions', 'audit', 'settings', 'monitoring', 'financial']);
const titles = {
  overview: 'Overview', queue: 'Incoming Queue', planning: 'Planning Board', active: 'Active Jobs',
  workorders: 'All Work Orders', invoices: 'Client Invoices & Billing', mpesa: 'M-Pesa & Payments',
};

const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
const money = (value) => `KSh ${Math.round(Number(value) || 0).toLocaleString('en-KE')}`;
const date = (value) => value ? new Date(value).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const statusLabel = (value) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

function headers() {
  return { 'Content-Type': 'application/json', 'x-admin-token': state.token, Authorization: `Bearer ${state.token}` };
}

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message || `Request failed (${response.status})`);
  return body;
}

function toast(message, type = 'success') {
  const target = $('toast');
  if (!target) return;
  target.textContent = message;
  target.className = `toast visible toast-${type}`;
  setTimeout(() => target.classList.remove('visible'), 3500);
}

function showLogin(message = '') {
  $('login-screen').style.display = 'flex';
  $('app').classList.remove('visible');
  if ($('login-error')) {
    $('login-error').textContent = message;
    $('login-error').classList.toggle('visible', Boolean(message));
  }
}

function showApp() {
  $('login-screen').style.display = 'none';
  $('app').classList.add('visible');
  $('user-avatar').textContent = 'SO';
  $('user-name').textContent = 'Supervisor';
  $('user-role').textContent = 'Operations';
}

function closeModals() {
  document.querySelectorAll('.modal-backdrop, .modal-overlay').forEach((modal) => {
    modal.classList.remove('visible', 'open', 'active');
    modal.setAttribute('aria-hidden', 'true');
  });
}

function localizeKenyanLabels() {
  document.querySelectorAll('body *').forEach((element) => {
    if (element.children.length === 0 && element.textContent.includes('$')) {
      element.textContent = element.textContent.replaceAll('$', 'KSh ');
    }
    for (const attribute of ['placeholder', 'aria-label', 'title']) {
      if (element.hasAttribute(attribute)) element.setAttribute(attribute, element.getAttribute(attribute).replaceAll('$', 'KSh '));
    }
  });
}

function setActiveView(view) {
  state.view = view;
  document.querySelectorAll('.view-section').forEach((section) => section.classList.remove('active'));
  document.querySelectorAll('[data-view]').forEach((item) => item.classList.toggle('active', item.getAttribute('data-view') === view));
  $(`view-${view}`)?.classList.add('active');
  if ($('page-title')) $('page-title').textContent = titles[view] || statusLabel(view);
  window.location.hash = view;
}

function renderUnsupported(view) {
  const section = $(`view-${view}`);
  if (!section || section.dataset.migratedNotice) return;
  section.dataset.migratedNotice = 'true';
  section.innerHTML = `<div class="alert alert-info"><strong>${esc(statusLabel(view))}</strong><br>This workspace is not connected to the current Supabase/API contract yet. Core supervisor operations remain available in Overview, Queue, Planning, Active Jobs, Invoices, and M-Pesa.</div>`;
}

function renderStats(stats) {
  const data = stats || {};
  const cards = [
    ['Incoming requests', data.pending_confirmation || 0, 'warning-card', 'Awaiting confirmation'],
    ['Active dispatches', data.active_dispatches || 0, 'blue-card', 'Crew en route or on-site'],
    ['M-Pesa revenue', money(data.total_revenue_collected), 'success-card', 'Settled payments'],
    ['Outstanding balance', money(data.outstanding_balance), 'danger-card', 'Pending customer payments'],
  ];
  const target = $('stats-container');
  if (!target) return;
  target.innerHTML = cards.map(([label, value, tone, sub]) => `<div class="stat-card ${tone}"><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-sub">${sub}</div></div>`).join('');
  const queueCount = data.pending_confirmation || 0;
  if ($('queue-badge')) $('queue-badge').textContent = queueCount;
  if ($('invoices-badge')) $('invoices-badge').textContent = data.unpaid_invoices || 0;
}

function renderActivityAndLocations() {
  const recent = [...state.orders]
    .sort((left, right) => String(right.updated_at || right.created_at || '').localeCompare(String(left.updated_at || left.created_at || '')))
    .slice(0, 6);
  const feed = $('live-feed-container');
  if (feed) {
    feed.innerHTML = recent.length
      ? recent.map((order) => `<div class="activity-item">
          <span class="dot dot-${order.status === 'pending_confirmation' ? 'warning' : 'success'}"></span>
          <div class="activity-main"><div class="activity-title">${esc(order.client_name || 'Customer')} · ${statusLabel(order.status)}</div><div class="activity-meta">${esc(order.address || 'Address pending')} · ${esc(order.service_type || 'Lawn care')}</div></div>
          <div class="activity-time">${date(order.updated_at || order.created_at)}</div>
        </div>`).join('')
      : '<div class="activity-empty">No work-order activity yet.</div>';
  }
  const map = $('live-map-container');
  if (map) {
    const locations = state.orders.filter((order) => order.address).slice(0, 8);
    map.innerHTML = locations.length
      ? `<div class="map-legend">${locations.length} service location${locations.length === 1 ? '' : 's'} loaded from current work orders</div><div class="activity-feed-list">${locations.map((order) => `<button type="button" class="btn-subtle" data-order-id="${esc(order.id)}" style="text-align:left;"><strong>${esc(order.client_name || 'Customer')}</strong><br><span class="td-addr">${esc(order.address)}</span></button>`).join('')}</div>`
      : '<div class="activity-empty">No service locations available yet.</div>';
  }
}

function renderOrderRows(items, view) {
  const target = $(`tbody-${view}`);
  if (!target) return;
  if (!items.length) {
    target.innerHTML = `<tr class="empty-row"><td colspan="8">No ${view === 'queue' ? 'incoming requests' : 'matching work orders'} found.</td></tr>`;
    return;
  }
  target.innerHTML = items.map((order) => `<tr>
    <td><button class="td-link td-main" data-order-id="${esc(order.id)}">#${esc(order.id)}</button><div class="td-addr">${esc(order.title || order.service_type || 'Lawn care service')}</div></td>
    <td><strong>${esc(order.client_name || 'Customer')}</strong><div class="td-addr">${esc(order.client_phone || '')}</div></td>
    <td class="td-addr">${esc(order.address || 'Address pending')}</td>
    <td><span class="badge-status status-${esc(order.status)}">${statusLabel(order.status)}</span></td>
    <td>${money(order.total_price)}</td>
    <td>${esc(order.scheduled_date || 'Not scheduled')}</td>
    <td>${date(order.created_at)}</td>
    <td><button class="btn-primary btn-sm" data-action="review" data-order-id="${esc(order.id)}">${order.status === 'pending_confirmation' ? 'Review & Approve' : 'Open'}</button></td>
  </tr>`).join('');
}

function renderInvoices(items) {
  const target = $('tbody-invoices');
  if (!target) return;
  target.innerHTML = items.length ? items.map((invoice) => `<tr>
    <td><strong>${esc(invoice.invoice_number || invoice.id)}</strong></td>
    <td>${esc(invoice.client_name || 'Customer')}</td>
    <td>${esc(invoice.client_phone || '')}</td>
    <td>${money(invoice.total_amount)}</td>
    <td>${money(invoice.balance_due)}</td>
    <td><span class="status-badge status-${esc(invoice.status)}">${statusLabel(invoice.status)}</span></td>
    <td>${invoice.balance_due > 0 ? `<button class="btn-primary btn-sm" data-action="payment" data-invoice-id="${esc(invoice.id)}">Record payment</button>` : 'Settled'}</td>
  </tr>`).join('') : '<tr class="empty-row"><td colspan="7">No invoices found.</td></tr>';
}

function renderPayments(items) {
  const target = $('mpesa-txns-tbody');
  if (!target) return;
  target.innerHTML = items.length ? items.map((payment) => `<tr>
    <td><code>${esc(payment.mpesa_receipt || payment.id || 'Pending')}</code></td>
    <td>${esc(payment.phone || payment.client_phone || '—')}</td>
    <td>${esc(payment.invoice_id || '—')}</td>
    <td>${money(payment.amount)}</td>
    <td>${esc(payment.channel || 'M-Pesa')}</td>
    <td>${date(payment.created_at || payment.updated_at)}</td>
    <td>${statusLabel(payment.status)}</td>
    <td>${payment.invoice_id ? `<a class="btn-secondary btn-sm" href="/receipt/${encodeURIComponent(payment.invoice_id)}" target="_blank">Receipt</a>` : '—'}</td>
  </tr>`).join('') : '<tr><td colspan="8">No M-Pesa payments recorded yet.</td></tr>';
}

async function loadOrders() {
  const response = await api('/admin/work-orders?limit=200');
  state.orders = response.orders || [];
  renderOrderRows(state.orders.filter((item) => item.status === 'pending_confirmation'), 'queue');
  renderOrderRows(state.orders.filter((item) => ['confirmed', 'scheduled'].includes(item.status)), 'planning');
  renderOrderRows(state.orders.filter((item) => ['dispatched', 'in_progress'].includes(item.status)), 'active');
  renderOrderRows(state.orders, 'workorders');
}

async function loadOverview() {
  const response = await api('/admin/stats');
  renderStats(response.stats);
  await loadOrders();
  renderActivityAndLocations();
}

async function loadInvoices() {
  const response = await api('/admin/invoices?limit=200');
  state.invoices = response.invoices || [];
  renderInvoices(state.invoices);
}

async function loadPayments() {
  const response = await api('/admin/payments?limit=200');
  renderPayments(response.payments || []);
}

async function navigate(view) {
  setActiveView(view);
  try {
    if (view === 'overview') await loadOverview();
    else if (['queue', 'planning', 'active', 'workorders'].includes(view)) await loadOrders();
    else if (view === 'invoices') await loadInvoices();
    else if (view === 'mpesa') await loadPayments();
    else renderUnsupported(view);
    if ($('last-updated')) $('last-updated').textContent = `Synced ${new Date().toLocaleTimeString('en-KE')}`;
  } catch (error) {
    toast(error.message, 'error');
  }
}

function openConfirm(order) {
  $('conf-order-id').value = order.id;
  $('conf-client-name').value = order.client_name || '';
  $('conf-client-phone').value = order.client_phone || '';
  $('conf-service-address').value = `${order.service_type || 'Lawn care'} - ${order.address || ''}`;
  $('conf-price').value = Math.round(Number(order.total_price) || 0);
  $('conf-date').value = order.scheduled_date || '';
  $('conf-crew-lead').value = order.crew_lead || '';
  $('conf-crew-phone').value = order.crew_phone || '';
  $('conf-notes').value = order.supervisor_notes || '';
  $('modal-confirm').classList.add('visible');
}

async function confirmOrder(event) {
  event.preventDefault();
  const id = $('conf-order-id').value;
  await api(`/admin/work-orders/${encodeURIComponent(id)}/confirm`, { method: 'POST', body: JSON.stringify({
    total_amount: Number($('conf-price').value), scheduled_date: $('conf-date').value.trim(),
    crew_lead: $('conf-crew-lead').value.trim(), crew_phone: $('conf-crew-phone').value.trim(), notes: $('conf-notes').value.trim(),
  }) });
  closeModals();
  toast('Work order confirmed and invoice opened for payment.');
  await navigate(state.view);
}

async function openOrder(id) {
  const response = await api(`/admin/work-orders/${encodeURIComponent(id)}`);
  if (response.order.status === 'pending_confirmation') openConfirm(response.order);
  else toast(`${response.order.title || response.order.service_type}: ${statusLabel(response.order.status)}`, 'info');
}

async function authenticate(event) {
  event.preventDefault();
  const token = $('login-token').value.trim();
  if (!token) return;
  state.token = token;
  try {
    await api('/admin/verify', { method: 'POST' });
    sessionStorage.setItem(TOKEN_KEY, token);
    showApp();
    localizeKenyanLabels();
    await navigate(location.hash.slice(1) || 'overview');
  } catch (error) {
    state.token = '';
    showLogin(error.message || 'Invalid supervisor token.');
  }
}

function logout() {
  sessionStorage.removeItem(TOKEN_KEY);
  state.token = '';
  closeModals();
  showLogin('Session locked.');
}

document.addEventListener('click', (event) => {
  const viewTarget = event.target.closest('[data-view]');
  if (viewTarget) {
    event.preventDefault();
    navigate(viewTarget.getAttribute('data-view'));
    return;
  }
  const action = event.target.closest('[data-action]');
  if (action) {
    const id = action.getAttribute('data-order-id');
    if (action.dataset.action === 'review') openOrder(id).catch((error) => toast(error.message, 'error'));
    return;
  }
  const orderTarget = event.target.closest('[data-order-id]');
  if (orderTarget) openOrder(orderTarget.getAttribute('data-order-id')).catch((error) => toast(error.message, 'error'));
});

$('login-form').addEventListener('submit', authenticate);
$('logout-btn')?.addEventListener('click', logout);
$('refresh-btn')?.addEventListener('click', () => navigate(state.view));
$('btn-lock-session')?.addEventListener('click', logout);
$('theme-toggle-btn')?.addEventListener('click', () => document.body.classList.toggle('theme-dark'));
$('form-confirm-order')?.addEventListener('submit', (event) => confirmOrder(event).catch((error) => toast(error.message, 'error')));
$('widget-embed-code')?.addEventListener('click', (event) => event.currentTarget.select());
$('close-timesheet-panel')?.addEventListener('click', () => { $('timesheet-clockin-panel').style.display = 'none'; });
document.querySelectorAll('[data-close="modal-confirm"]').forEach((button) => button.addEventListener('click', closeModals));

if (state.token) {
  api('/admin/verify').then(() => { showApp(); localizeKenyanLabels(); return navigate(location.hash.slice(1) || 'overview'); }).catch(() => { sessionStorage.removeItem(TOKEN_KEY); state.token = ''; showLogin(); });
} else {
  showLogin();
}
