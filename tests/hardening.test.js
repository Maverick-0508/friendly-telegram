// Regression tests for the production-hardening fixes: forged payment
// callbacks, client-controlled pricing, profile takeover via phone number,
// PostgREST filter injection, STK push abuse, and lost-callback recovery.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resetRuntimeEnv } from './helpers/env.js';
import fs from 'node:fs';
import path from 'node:path';
import { startMockDaraja, buildCallbackPayload } from './helpers/mock-daraja.js';
import { priceWorkOrder } from '../node-backend/config/pricing.js';
import { verifyCallbackToken, isMpesaConfigured } from '../node-backend/services/mpesa.js';

let server;
let baseUrl;
let mockDaraja;
// Imported after PORTAL_STORE_FILE is set so this suite gets its own store.
let store;
let quoteFilterValue;

test.before(async () => {
  resetRuntimeEnv({ BOOKING_MODE: 'instant' });
  process.env.PORTAL_STORE_FILE = path.resolve('data', 'test-hardening.json');
  fs.rmSync(process.env.PORTAL_STORE_FILE, { force: true });
  ({ store, quoteFilterValue } = await import('../node-backend/services/store.js'));
  process.env.NODE_ENV = 'development';
  process.env.STK_MAX_PER_PHONE = '2';
  process.env.MPESA_STATUS_QUERY_AFTER_MS = '0';

  mockDaraja = await startMockDaraja();
  process.env.MPESA_ENVIRONMENT = 'sandbox';
  process.env.MPESA_CONSUMER_KEY = 'test-consumer-key';
  process.env.MPESA_CONSUMER_SECRET = 'test-consumer-secret';
  process.env.MPESA_SHORTCODE = '174379';
  process.env.MPESA_PASSKEY = 'test-passkey';
  process.env.MPESA_CALLBACK_URL = 'https://example.com/api/mpesa/callback';
  process.env.MPESA_CALLBACK_TOKEN = 'test-callback-token';
  process.env.MPESA_BASE_URL = mockDaraja.baseUrl;

  const { createApp } = await import('../app.js');
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (mockDaraja) await mockDaraja.close();
});

async function post(path, payload) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { response, body: await response.json().catch(() => null) };
}

async function get(path) {
  const response = await fetch(`${baseUrl}${path}`);
  return { response, body: await response.json().catch(() => null) };
}

// ---------------- Payments ----------------

test('callback verification fails closed in production when no token is configured', () => {
  const previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    assert.equal(verifyCallbackToken('anything', { callbackToken: '' }), false);
    assert.equal(verifyCallbackToken(undefined, { callbackToken: '' }), false);
    assert.equal(verifyCallbackToken('s', { callbackToken: 's' }), true);
    // ...and payments are reported as not configured without the token.
    const token = process.env.MPESA_CALLBACK_TOKEN;
    delete process.env.MPESA_CALLBACK_TOKEN;
    assert.equal(isMpesaConfigured(), false);
    process.env.MPESA_CALLBACK_TOKEN = token;
    assert.equal(isMpesaConfigured(), true);
  } finally {
    process.env.NODE_ENV = previous;
  }
});

test('a callback confirming less than the balance does not settle the invoice', async () => {
  const order = await post('/api/work-orders', {
    client_name: 'Underpay Client',
    phone: '+254700900001',
    service_type: 'Core Aeration', // 8500
  });
  const invoiceId = order.body.invoice.id;
  assert.equal(order.body.invoice.total_amount, 8500);

  const push = await post('/api/mpesa/stkpush', { phone: '+254700900001', invoice_id: invoiceId });
  assert.equal(push.response.status, 200);
  const checkoutId = push.body.checkout_request_id;

  const cb = await post(
    '/api/mpesa/callback/test-callback-token',
    buildCallbackPayload({ checkoutRequestId: checkoutId, amount: 500, receipt: 'PARTIAL01' })
  );
  assert.equal(cb.response.status, 200);

  const invoice = await get(`/api/invoices/${invoiceId}`);
  assert.equal(invoice.body.data.status, 'partially_paid');
  assert.equal(invoice.body.data.balance_due, 8000);

  // A replayed callback must not reduce the balance twice.
  await post('/api/mpesa/callback/test-callback-token',
    buildCallbackPayload({ checkoutRequestId: checkoutId, amount: 500, receipt: 'PARTIAL01' }));
  const again = await get(`/api/invoices/${invoiceId}`);
  assert.equal(again.body.data.balance_due, 8000);

  // The remaining balance is payable; the next push is priced at the balance.
  const second = await post('/api/mpesa/stkpush', { phone: '+254700900001', invoice_id: invoiceId });
  assert.equal(second.response.status, 200);
  assert.equal(second.body.amount, 8000);
});

test('STK push is throttled per phone and de-duplicated per invoice', async () => {
  const order = await post('/api/work-orders', {
    client_name: 'Throttle Client',
    phone: '+254700900002',
    service_type: 'Lawn Mowing',
  });
  const invoiceId = order.body.invoice.id;

  const first = await post('/api/mpesa/stkpush', { phone: '+254700900002', invoice_id: invoiceId });
  assert.equal(first.response.status, 200);

  // Same invoice moments later: the pending checkout is handed back, no new prompt.
  const dup = await post('/api/mpesa/stkpush', { phone: '+254700900002', invoice_id: invoiceId });
  assert.equal(dup.response.status, 409);
  assert.equal(dup.body.error.code, 'PAYMENT_IN_PROGRESS');
  assert.equal(dup.body.checkout_request_id, first.body.checkout_request_id);

  // Per-phone cap (STK_MAX_PER_PHONE=2 in this suite) on invoice-less pushes.
  const two = await post('/api/mpesa/stkpush', { phone: '+254700900002', amount: 100 });
  assert.equal(two.response.status, 200);
  const three = await post('/api/mpesa/stkpush', { phone: '+254700900002', amount: 100 });
  assert.equal(three.response.status, 429);
  assert.equal(three.body.error.code, 'TOO_MANY_PAYMENT_REQUESTS');
});

test('status polling recovers a lost callback by querying Daraja directly', async () => {
  const order = await post('/api/work-orders', {
    client_name: 'Lost Callback Client',
    phone: '+254700900003',
    service_type: 'Full Landscape Maintenance', // 12000, matches the mock query amount
  });
  const invoiceId = order.body.invoice.id;
  const push = await post('/api/mpesa/stkpush', { phone: '+254700900003', invoice_id: invoiceId });
  const checkoutId = push.body.checkout_request_id;

  // No callback ever arrives; the status endpoint asks Daraja (grace = 0 here).
  const status = await get(`/api/mpesa/status/${checkoutId}`);
  assert.equal(status.body.data.status, 'success');
  assert.equal(status.body.data.mpesa_receipt, 'NLJ7RT61SV');
  assert.ok(mockDaraja.queried.includes(checkoutId));

  const invoice = await get(`/api/invoices/${invoiceId}`);
  assert.equal(invoice.body.data.status, 'paid');
});

// ---------------- Confirmed-quote booking flow ----------------

test('default booking mode creates an estimate that cannot be paid until a supervisor confirms it', async () => {
  const prevMode = process.env.BOOKING_MODE;
  process.env.BOOKING_MODE = ''; // default = confirm
  process.env.ADMIN_API_TOKEN = 'test-admin-token';
  try {
    const order = await post('/api/work-orders', {
      client_name: 'Confirm Flow Client', phone: '+254700900030', service_type: 'Core Aeration', pin: '1212',
    });
    assert.equal(order.response.status, 201);
    assert.equal(order.body.booking_mode, 'confirm');
    assert.equal(order.body.data.status, 'pending_confirmation');
    assert.equal(order.body.invoice.status, 'estimate');
    assert.equal(order.body.invoice.total_amount, 8500);
    const orderId = order.body.data.id;
    const invoiceId = order.body.invoice.id;

    // Not payable yet.
    const push = await post('/api/mpesa/stkpush', { phone: '+254700900030', invoice_id: invoiceId });
    assert.equal(push.response.status, 409);
    assert.equal(push.body.error.code, 'INVOICE_NOT_CONFIRMED');

    // Confirmation requires the admin token.
    const anon = await post(`/api/admin/work-orders/${orderId}/confirm`, { total_amount: 9000 });
    assert.equal(anon.response.status, 401);

    const confirm = await fetch(`${baseUrl}/api/admin/work-orders/${orderId}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': 'test-admin-token' },
      body: JSON.stringify({ total_amount: 9000, scheduled_date: 'Tue 23 Sep, 8:00 AM', crew_name: 'Alpha Crew' }),
    });
    const confirmed = await confirm.json();
    assert.equal(confirm.status, 200);
    assert.equal(confirmed.data.status, 'confirmed');
    assert.equal(confirmed.data.scheduled_date, 'Tue 23 Sep, 8:00 AM');
    assert.equal(confirmed.invoice.status, 'unpaid');
    assert.equal(confirmed.invoice.total_amount, 9000);
    assert.equal(confirmed.invoice.balance_due, 9000);
    assert.equal(confirmed.invoice.items[0].amount, 9000);
    assert.equal(Math.round(confirmed.invoice.subtotal + confirmed.invoice.tax_vat), 9000);

    // Now payable, at the confirmed amount.
    const push2 = await post('/api/mpesa/stkpush', { phone: '+254700900030', invoice_id: invoiceId });
    assert.equal(push2.response.status, 200);
    assert.equal(push2.body.amount, 9000);

    // The hub shows the confirmed order and payable invoice.
    const hub = await post('/api/portal/lookup', { identifier: '+254700900030', pin: '1212' });
    assert.equal(hub.body.work_orders[0].status, 'confirmed');
    assert.equal(hub.body.invoices[0].status, 'unpaid');
  } finally {
    process.env.BOOKING_MODE = prevMode;
    process.env.ADMIN_API_TOKEN = '';
  }
});

// ---------------- Pricing ----------------

test('work order prices come from the catalogue, never from the request', () => {
  assert.equal(priceWorkOrder({ service_type: 'Core Aeration', price: 1 }).total, 8500);

  const cut = priceWorkOrder({ property_size: 5000, grass: 'kikuyu', frequency: 'biweekly' });
  assert.equal(cut.total, 3500); // 5000 * 0.70 = 3500 floor
  assert.match(cut.service_type, /Kikuyu Turf Cut/);

  const withAddons = priceWorkOrder({
    property_size: 10000, grass: 'buffalo', frequency: 'onetime', addons: ['edging', 'bogus'],
  });
  // 10000 * 0.9 = 9000 * 1.4 = 12600 + 1500 edging
  assert.equal(withAddons.subtotal, 14100);
  assert.equal(withAddons.total, 14100);
  assert.equal(withAddons.line_items.length, 2);

  const coupon = priceWorkOrder({ service_type: 'Full Landscape Maintenance', coupon_code: 'spring20' });
  assert.equal(coupon.discount, 2400);
  assert.equal(coupon.total, 9600);
  assert.equal(coupon.coupon.code, 'SPRING20');

  const badCoupon = priceWorkOrder({ service_type: 'Lawn Mowing', coupon_code: 'NOPE' });
  assert.equal(badCoupon.total, 4500);
  assert.equal(badCoupon.coupon_rejected, 'NOPE');

  // Unknown label with no lawn inputs is priced as a default 5000 sq ft cut.
  assert.equal(priceWorkOrder({ service_type: 'Something Custom' }).total, 3500);
  // Minimum order floor holds even after big fixed discounts.
  assert.equal(priceWorkOrder({ service_type: 'Lawn Edging', coupon_code: 'FIRSTCUT' }).total, 2500);
});

// ---------------- Profiles ----------------

test('an existing profile cannot be modified or claimed with only a phone number', async () => {
  const owner = await post('/api/portal/clients', {
    name: 'Owner', phone: '+254700900010', email: 'owner@example.com', address: 'Real Address', pin: '4321',
  });
  assert.equal(owner.response.status, 201);

  // Attacker knows the phone number only.
  const noPin = await post('/api/portal/clients', { name: 'Owner', phone: '+254700900010', address: 'Hijacked' });
  assert.equal(noPin.response.status, 403);
  const wrongPin = await post('/api/portal/clients', { name: 'Owner', phone: '+254700900010', address: 'Hijacked', pin: '0000' });
  assert.equal(wrongPin.response.status, 403);
  assert.equal(wrongPin.body.error.code, 'INVALID_PIN');

  const check = await post('/api/portal/lookup', { identifier: '+254700900010', pin: '4321' });
  assert.equal(check.body.client.address, 'Real Address');

  // Booking against someone else's PIN-protected profile is refused too.
  const hijackOrder = await post('/api/work-orders', {
    client_name: 'Owner', phone: '+254700900010', service_type: 'Lawn Mowing',
  });
  assert.equal(hijackOrder.response.status, 403);
  assert.equal(hijackOrder.body.error.code, 'ACCESS_PIN_REQUIRED');

  const ownOrder = await post('/api/work-orders', {
    client_name: 'Owner', phone: '+254700900010', service_type: 'Lawn Mowing', pin: '4321',
  });
  assert.equal(ownOrder.response.status, 201);
});

test('quote-only profiles without an email can be claimed with a PIN via a booking', async () => {
  await post('/api/quotes', { full_name: 'Phone Only', email: 'phone.only@example.com', phone: '+254700900011' });

  // Order without matching email: allowed, but the profile is not claimed.
  const order = await post('/api/work-orders', {
    client_name: 'Phone Only', phone: '+254700900011', service_type: 'Lawn Mowing', pin: '9999',
  });
  assert.equal(order.response.status, 201);
  const lookup = await post('/api/portal/lookup', { identifier: '+254700900011', pin: '9999' });
  assert.equal(lookup.response.status, 403);
  assert.equal(lookup.body.pin_required, true);

  // With the email on file the PIN is set and the hub opens.
  const claim = await post('/api/work-orders', {
    client_name: 'Phone Only', phone: '+254700900011', email: 'phone.only@example.com',
    service_type: 'Lawn Mowing', pin: '9999',
  });
  assert.equal(claim.response.status, 201);
  const opened = await post('/api/portal/lookup', { identifier: '+254700900011', pin: '9999' });
  assert.equal(opened.response.status, 200);
  assert.equal(opened.body.work_orders.length, 2);
});

// ---------------- Persistence ----------------

test('PostgREST filter values are quoted so identifiers cannot inject conditions', () => {
  assert.equal(quoteFilterValue('0712345678'), '"0712345678"');
  assert.equal(quoteFilterValue('x,id.neq.0'), '"x,id.neq.0"');
  assert.equal(quoteFilterValue('a"b\\c'), '"a\\"b\\\\c"');
});

test('a crafted identifier does not match unrelated profiles', async () => {
  await post('/api/portal/clients', { name: 'Victim', phone: '+254700900020', pin: '1111' });
  for (const identifier of ['x,id.neq.zzz', 'nobody@example.com,id.neq.zzz', '"),id.neq.zzz']) {
    const probe = await post('/api/portal/lookup', { identifier, pin: '1111' });
    assert.ok([400, 404].includes(probe.response.status), `${identifier} must not resolve a profile`);
    assert.equal(probe.body.success, false);
    assert.equal(await store.findClient(identifier), null);
  }
});

// ---------------- Frontend markup vs. CSP ----------------

test('public pages contain no inline event handlers (blocked by CSP script-src-attr)', () => {
  const dir = path.resolve('public');
  const offenders = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(dir, file), 'utf8');
    const m = html.match(/\son(?:load|click|submit|change|input|error|keyup|keydown)\s*=/gi);
    if (m) offenders.push(`${file} (${m.length})`);
  }
  assert.deepEqual(offenders, [], `inline handlers found: ${offenders.join(', ')}`);
});

test('PIN inputs use an HTML pattern that accepts digits', () => {
  // In a JS template literal `\d` collapses to `d`, so pattern="\d{4,6}" would
  // reject every real PIN with "Please match the requested format".
  const dir = path.resolve('public/portal');
  const src = [path.resolve('public/portal.js'), ...fs.readdirSync(dir).map((f) => path.join(dir, f))]
    .map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  assert.equal(/pattern="\\d/.test(src), false, 'portal sources still contain pattern="\\d..."');
  const patterns = [...src.matchAll(/id="(?:client-pin-input|reg-pin)"[^>]*pattern="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(patterns.length, 2);
  for (const p of patterns) assert.match('2468', new RegExp(`^(?:${p})$`), `pattern ${p} rejects 2468`);
});

test('email/password account routes are disabled unless ENABLE_ACCOUNT_AUTH=true', async () => {
  const reg = await post('/api/auth/register', { email: 'x@example.com', password: 'secret123' });
  assert.equal(reg.response.status, 404);
  const login = await post('/api/auth/login', { email: 'x@example.com', password: 'secret123' });
  assert.equal(login.response.status, 404);
  const me = await get('/api/auth/me');
  assert.equal(me.response.status, 404);
});

test('legacy /login and /signup pages hand off to the Client Hub', async () => {
  for (const p of ['/login', '/signup']) {
    const res = await fetch(`${baseUrl}${p}`);
    const html = await res.text();
    assert.equal(res.status, 200);
    assert.match(html, /url=\/\?client_portal=open/);
  }
  const authJs = fs.readFileSync(path.resolve('public/auth.js'), 'utf8');
  assert.equal(/\/api\/auth\//.test(authJs), false, 'auth.js must not call the account API');
});

test('static assets and pages are not counted against the API rate limit', async () => {
  const { createApp } = await import('../app.js');
  process.env.RATE_LIMIT_MAX = '3';
  const s = createApp().listen(0);
  await new Promise((r) => s.once('listening', r));
  try {
    const base = `http://127.0.0.1:${s.address().port}`;
    // Far more static requests than the API ceiling...
    for (let i = 0; i < 10; i += 1) assert.equal((await fetch(`${base}/styles.css`)).status, 200);
    assert.equal((await fetch(`${base}/services`)).status, 200);
    // ...and the API still answers until its own ceiling is reached.
    assert.equal((await fetch(`${base}/api/health`)).status, 200);
    assert.equal((await fetch(`${base}/api/health`)).status, 200);
    assert.equal((await fetch(`${base}/api/health`)).status, 200);
    const limited = await fetch(`${base}/api/health`);
    assert.equal(limited.status, 429);
    assert.equal((await limited.json()).error.code, 'RATE_LIMITED');
    // Pages keep working even when the API is limited.
    assert.equal((await fetch(`${base}/services`)).status, 200);
  } finally {
    process.env.RATE_LIMIT_MAX = '';
    await new Promise((r) => s.close(r));
  }
});

// ---------------- Misc ----------------

test('analytics payloads are trimmed to known fields and never error the page', async () => {
  const big = await post('/api/analytics', { page: '/', junk: 'x'.repeat(10000) });
  assert.equal(big.response.status, 200);
  const ok = await post('/api/analytics', { page: '/', referrer: 'r', loadTime: '1.2s' });
  assert.equal(ok.response.status, 200);
  // Over its own budget the beacon is dropped with a 200, not a 429.
  const { createApp } = await import('../app.js');
  process.env.ANALYTICS_RATE_LIMIT_MAX = '2';
  const s = createApp().listen(0);
  await new Promise((r) => s.once('listening', r));
  try {
    const url = `http://127.0.0.1:${s.address().port}/api/analytics`;
    const send = () => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"page":"/"}' });
    await send(); await send();
    const third = await send();
    assert.equal(third.status, 200);
    assert.equal((await third.json()).dropped, true);
  } finally {
    process.env.ANALYTICS_RATE_LIMIT_MAX = '';
    await new Promise((r) => s.close(r));
  }
});

test('unexpected server errors do not leak internal messages', async () => {
  const { createApp } = await import('../app.js');
  const app = createApp();
  // Register a throwing route and move it ahead of the catch-all so it is
  // reachable; the app's own error handler must then answer.
  app.get('/boom', () => { throw new Error('database password is hunter2'); });
  // Keep Express's own `query` and `expressInit` layers first.
  app._router.stack.splice(2, 0, app._router.stack.pop());
  const s = app.listen(0);
  await new Promise((r) => s.once('listening', r));
  try {
    const res = await fetch(`http://127.0.0.1:${s.address().port}/boom`);
    const body = await res.json();
    assert.equal(res.status, 500);
    assert.equal(body.error.message, 'Internal server error');
  } finally {
    await new Promise((r) => s.close(r));
  }
});
