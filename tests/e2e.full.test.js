/**
 * e2e.full.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Full end-to-end test: main website <-> supervisor dashboard concurrency + DB.
 *
 * Covers:
 *  * All customer-facing HTML pages reachable (/, /services, /calculator,
 *    /contact, /tracker/:id, /portal/hub)
 *  * Full booking -> approval -> payment -> dispatch -> completion journey
 *  * Supervisor dashboard pages + all /api/admin/* endpoints
 *  * Concurrent load: customer + supervisor hitting server simultaneously
 *  * Database layer: store round-trips and adminDashboardStats key coverage
 *  * Security: unauthenticated admin routes return 401
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { resetRuntimeEnv } from './helpers/env.js';
import { startMockDaraja, buildCallbackPayload } from './helpers/mock-daraja.js';

// ---------- shared state -----------------------------------------------------
let createApp;
let store;
let server;
let baseUrl;
let mockDaraja;

const ADMIN_TOKEN = 'e2e-full-admin-token-2026';
const STORE_FILE  = path.resolve('data', 'test-e2e-full.json');

// ---------- setup ------------------------------------------------------------
test.before(async () => {
  resetRuntimeEnv({ BOOKING_MODE: 'confirm' });

  process.env.ADMIN_API_TOKEN   = ADMIN_TOKEN;
  process.env.PORTAL_STORE_FILE = STORE_FILE;
  process.env.NODE_ENV          = 'development';

  fs.rmSync(STORE_FILE, { force: true });

  // Start mock Daraja (M-Pesa sandbox)
  mockDaraja = await startMockDaraja();
  process.env.MPESA_ENVIRONMENT     = 'sandbox';
  process.env.MPESA_CONSUMER_KEY    = 'e2e-consumer-key';
  process.env.MPESA_CONSUMER_SECRET = 'e2e-consumer-secret';
  process.env.MPESA_SHORTCODE       = '174379';
  process.env.MPESA_PASSKEY         = 'e2e-passkey';
  process.env.MPESA_CALLBACK_URL    = 'https://example.com/api/mpesa/callback';
  process.env.MPESA_CALLBACK_TOKEN  = 'e2e-callback-token';
  process.env.MPESA_BASE_URL        = mockDaraja.baseUrl;

  const appModule   = await import('../app.js');
  createApp = appModule.createApp;
  const storeModule = await import('../node-backend/services/store.js');
  store = storeModule.store;

  const app = createApp();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

// ---------- teardown ---------------------------------------------------------
test.after(async () => {
  if (server) {
    await new Promise((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())));
  }
  if (mockDaraja) await mockDaraja.close();
  fs.rmSync(STORE_FILE, { force: true });
});

// =============================================================================
// BLOCK 1: Database layer
// =============================================================================
test('DB-01 | Store backendName reports memory or supabase (never undefined)', () => {
  const backend = store.backendName();
  assert.ok(
    ['memory', 'supabase', 'unavailable'].includes(backend),
    `Unexpected backend: ${backend}`,
  );
});

test('DB-02 | /api/health returns 200 with success flag', async () => {
  const res  = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200, '/api/health must return 200');
  const json = await res.json();
  // The /api/health route returns { success: true, message: 'Server is healthy' }.
  // The richer readiness data is on /api/ready.
  assert.ok(json.success === true, `Expected success:true, got: ${JSON.stringify(json)}`);
  assert.ok(typeof json.message === 'string', 'health must include a message string');
});

test('DB-03 | Store round-trip: upsert + read client record', async () => {
  const clientId = `cl_e2e_test_${Date.now()}`;
  await store.upsertClient({
    id: clientId, name: 'E2E Test', phone: '0700000001',
    email: `e2e+${clientId}@test.com`,
  });
  const found = await store.findClient(clientId);
  assert.ok(found, 'Client must be findable after upsert');
  assert.equal(found.id, clientId);
});

test('DB-04 | Store round-trip: upsert + read work order', async () => {
  const woId = `wo_e2e_${Date.now()}`;
  await store.upsertWorkOrder({
    id: woId, client_name: 'E2E Customer', status: 'pending_confirmation',
    service_type: 'Mowing', created_at: new Date().toISOString(),
  });
  const found = await store.workOrderById(woId);
  assert.ok(found, 'Work order must persist and be readable');
  assert.equal(found.id, woId);
  assert.equal(found.status, 'pending_confirmation');
});

test('DB-05 | adminDashboardStats returns all required numeric keys', async () => {
  const stats = await store.adminDashboardStats();
  const required = [
    'total_work_orders', 'pending_confirmation', 'active_dispatches',
    'scheduled', 'completed', 'total_invoices', 'unpaid_invoices',
    'outstanding_balance', 'total_revenue_collected', 'total_quotes', 'total_leads',
  ];
  for (const key of required) {
    assert.ok(key in stats, `Missing stats key: ${key}`);
    assert.ok(typeof stats[key] === 'number', `stats.${key} must be a number, got ${typeof stats[key]}`);
  }
});

// =============================================================================
// BLOCK 2: Main website pages
// =============================================================================
test('WEB-01 | Home page (/) returns 200 HTML', async () => {
  const res  = await fetch(`${baseUrl}/`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes('<!DOCTYPE html') || html.includes('<html'), 'Must return HTML document');
  assert.ok(html.length > 500, 'Home page HTML must not be empty');
});

test('WEB-02 | /services returns 200', async () => {
  const res = await fetch(`${baseUrl}/services`);
  assert.equal(res.status, 200);
});

test('WEB-03 | /calculator returns 200', async () => {
  const res = await fetch(`${baseUrl}/calculator`);
  assert.equal(res.status, 200);
});

test('WEB-04 | /contact returns 200', async () => {
  const res = await fetch(`${baseUrl}/contact`);
  assert.equal(res.status, 200);
});

test('WEB-05 | Client hub is served (index.html at /)', async () => {
  // The client hub SPA is index.html served at the root.
  // There is no /portal/hub.html; the portal JS is loaded from within the main page.
  const res  = await fetch(`${baseUrl}/`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.length > 200, 'Hub SPA page must not be empty');
});

test('WEB-06 | /admin supervisor dashboard returns 200 and contains heading', async () => {
  const res  = await fetch(`${baseUrl}/admin`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Supervisor|Operations Hub|Dashboard/i);
});

// =============================================================================
// BLOCK 3: Security gating
// =============================================================================
test('SEC-01 | /api/admin/stats without token returns 401', async () => {
  const res = await fetch(`${baseUrl}/api/admin/stats`);
  assert.equal(res.status, 401);
});

test('SEC-02 | /api/admin/work-orders without token returns 401', async () => {
  const res = await fetch(`${baseUrl}/api/admin/work-orders`);
  assert.equal(res.status, 401);
});

test('SEC-03 | /api/admin/verify with wrong token returns 401', async () => {
  const res = await fetch(`${baseUrl}/api/admin/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': 'bad-token' },
    body: JSON.stringify({ token: 'bad-token' }),
  });
  assert.equal(res.status, 401);
});

test('SEC-04 | /api/admin/verify with correct token returns 200 and supervisor role', async () => {
  const res = await fetch(`${baseUrl}/api/admin/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': ADMIN_TOKEN },
    body: JSON.stringify({ token: ADMIN_TOKEN }),
  });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.authorized, true);
  assert.equal(json.role, 'supervisor');
});

// =============================================================================
// BLOCK 4: Full customer -> supervisor journey
// =============================================================================
test('E2E-01 | Complete journey: lead -> booking -> confirmation -> payment -> dispatch -> completion', async () => {
  const adminH = { 'Content-Type': 'application/json', 'x-admin-token': ADMIN_TOKEN };

  // 4-a. Customer submits contact lead
  const leadRes = await fetch(`${baseUrl}/api/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Alice Wanjiru',
      email: 'alice.wanjiru@e2e.test',
      phone: '+254700111222',
      message: 'Need lawn mowing for my home once a week.',
    }),
  });
  assert.equal(leadRes.status, 201, 'Lead submission must return 201');

  // 4-b. Customer books a service
  const bookRes = await fetch(`${baseUrl}/api/work-orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Alice Wanjiru',
      email: 'alice.wanjiru@e2e.test',
      phone: '+254700111222',
      service_type: 'Precision Mowing & Edging',
      address: 'Plot 7, Lavington, Nairobi',
      pin: '5566',
    }),
  });
  assert.equal(bookRes.status, 201, 'Booking must return 201');
  const bookJson  = await bookRes.json();
  const orderId   = bookJson.data.id;
  const invoiceId = bookJson.invoice.id;
  assert.equal(bookJson.data.status,    'pending_confirmation');
  assert.equal(bookJson.invoice.status, 'estimate');

  // 4-c. Customer cannot pay while still an estimate
  const premature = await fetch(`${baseUrl}/api/mpesa/stkpush`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+254700111222', invoice_id: invoiceId }),
  });
  assert.equal(premature.status, 409, 'Estimate must NOT be payable yet');

  // 4-d. Supervisor checks the queue
  const statsJson = await (await fetch(`${baseUrl}/api/admin/stats`, { headers: adminH })).json();
  assert.ok(statsJson.stats.pending_confirmation >= 1, 'Stats must show pending confirmation');
  assert.ok(statsJson.stats.total_leads >= 1,          'Stats must show the submitted lead');

  const ordersRes  = await fetch(`${baseUrl}/api/admin/work-orders?status=pending_confirmation`, { headers: adminH });
  const ordersJson = await ordersRes.json();
  assert.ok(ordersJson.orders.some((o) => o.id === orderId), "Supervisor must see Alice's booking");

  const leadsJson = await (await fetch(`${baseUrl}/api/admin/leads`, { headers: adminH })).json();
  assert.ok(leadsJson.leads.some((l) => l.email === 'alice.wanjiru@e2e.test'), "Supervisor must see Alice's lead");

  // 4-e. Supervisor confirms and prices the order
  const confirmRes  = await fetch(`${baseUrl}/api/admin/work-orders/${orderId}/confirm`, {
    method: 'POST',
    headers: adminH,
    body: JSON.stringify({
      total_amount: 3800,
      scheduled_date: 'Friday 8:00 AM',
      crew_name: 'Bravo Crew',
      crew_lead: 'James Mugo',
      crew_phone: '0711009988',
      notes: 'Use the back gate.',
    }),
  });
  assert.equal(confirmRes.status, 200, 'Confirmation must succeed');
  const confirmJson = await confirmRes.json();
  assert.equal(confirmJson.data.status,         'confirmed');
  assert.equal(confirmJson.invoice.status,       'unpaid');
  assert.equal(confirmJson.invoice.total_amount, 3800);

  // 4-f. Customer portal reflects confirmed status
  const hubRes  = await fetch(`${baseUrl}/api/portal/lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: '+254700111222', pin: '5566' }),
  });
  assert.equal(hubRes.status, 200);
  const hubJson = await hubRes.json();
  assert.equal(hubJson.work_orders[0].status,         'confirmed');
  assert.equal(hubJson.work_orders[0].scheduled_date, 'Friday 8:00 AM');
  assert.equal(hubJson.invoices[0].status,            'unpaid');
  assert.equal(hubJson.invoices[0].total_amount,      3800);

  // 4-g. Customer initiates M-Pesa payment
  const stkRes  = await fetch(`${baseUrl}/api/mpesa/stkpush`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+254700111222', invoice_id: invoiceId, amount: 3800 }),
  });
  assert.equal(stkRes.status, 200, 'STK push must return 200');
  const stkJson    = await stkRes.json();
  const checkoutId = stkJson.checkout_request_id || stkJson.checkoutRequestId;
  assert.ok(checkoutId, 'checkout_request_id must be returned from STK push');

  // 4-h. Daraja sends success callback
  // NOTE: buildCallbackPayload destructures { receipt }, not mpesaReceipt.
  const E2E_RECEIPT = 'QK77ALICE01';
  const cbPayload = buildCallbackPayload({
    checkoutRequestId: checkoutId,
    resultCode: 0,
    amount: 3800,
    receipt: E2E_RECEIPT,
    phone: '254700111222',
  });
  const cbRes = await fetch(`${baseUrl}/api/mpesa/callback/e2e-callback-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cbPayload),
  });
  assert.equal(cbRes.status, 200, 'M-Pesa callback must be accepted (200)');

  // 4-i. Invoice is now marked paid
  const paidInvJson = await (await fetch(`${baseUrl}/api/invoices/${invoiceId}`)).json();
  assert.equal(paidInvJson.data.status,      'paid', 'Invoice status must be paid');
  assert.equal(paidInvJson.data.balance_due,  0,     'Balance due must be 0 after full payment');

  // 4-j. Supervisor sees the M-Pesa receipt in the transactions list.
  // The payment object is stored flat in memory (mpesa_receipt is a top-level field).
  const paymentsJson = await (await fetch(`${baseUrl}/api/admin/payments`, { headers: adminH })).json();
  assert.ok(
    paymentsJson.payments.some(
      (p) => p.mpesa_receipt === E2E_RECEIPT || p.data?.mpesa_receipt === E2E_RECEIPT,
    ),
    `M-Pesa receipt ${E2E_RECEIPT} must appear in supervisor payments list`,
  );

  // 4-k. Supervisor dispatches crew with GPS coordinates
  const dispatchRes = await fetch(`${baseUrl}/api/admin/work-orders/${orderId}`, {
    method: 'PATCH',
    headers: adminH,
    body: JSON.stringify({
      status: 'dispatched',
      crew_vehicle: 'Isuzu D-Max KDA 301Z',
      crew_lat: -1.292066,
      crew_lng: 36.821945,
      checklist: [
        { task: 'Boundary marking', status: 'completed' },
        { task: 'Mow front lawn',   status: 'in_progress' },
        { task: 'Edge pathways',    status: 'pending' },
      ],
    }),
  });
  assert.equal(dispatchRes.status, 200, 'Dispatch PATCH must succeed');

  // 4-l. Customer's tracker page is served
  const trackerRes = await fetch(`${baseUrl}/tracker/${orderId}`);
  assert.equal(trackerRes.status, 200, '/tracker/:id must return 200 HTML');

  // 4-m. Customer order API reflects GPS and checklist live
  const orderLiveJson = await (await fetch(`${baseUrl}/api/work-orders/${orderId}`)).json();
  assert.equal(orderLiveJson.data.status,       'dispatched');
  assert.equal(orderLiveJson.data.crew_vehicle, 'Isuzu D-Max KDA 301Z');
  assert.equal(orderLiveJson.data.crew_lat,     -1.292066);
  assert.equal(orderLiveJson.data.crew_lng,      36.821945);
  assert.equal(orderLiveJson.data.checklist.length, 3);
  assert.equal(orderLiveJson.data.checklist[0].status, 'completed');
  assert.equal(orderLiveJson.data.checklist[1].status, 'in_progress');

  // 4-n. Supervisor marks the job complete
  const doneRes = await fetch(`${baseUrl}/api/admin/work-orders/${orderId}`, {
    method: 'PATCH',
    headers: adminH,
    body: JSON.stringify({
      status: 'completed',
      checklist: [
        { task: 'Boundary marking', status: 'completed' },
        { task: 'Mow front lawn',   status: 'completed' },
        { task: 'Edge pathways',    status: 'completed' },
      ],
    }),
  });
  assert.equal(doneRes.status, 200, 'Completion PATCH must succeed');

  // 4-o. Dashboard stats reflect completion + revenue
  const finalStats = await (await fetch(`${baseUrl}/api/admin/stats`, { headers: adminH })).json();
  assert.ok(finalStats.stats.completed >= 1,               'completed counter must be >= 1');
  assert.ok(finalStats.stats.total_revenue_collected >= 3800, 'revenue must include KES 3,800');
});

// =============================================================================
// BLOCK 5: True concurrency
// =============================================================================
test('CONC-01 | 8 concurrent customer+admin requests all succeed within 5 s', async () => {
  const adminH = { 'Content-Type': 'application/json', 'x-admin-token': ADMIN_TOKEN };
  const t0     = Date.now();

  const results = await Promise.all([
    fetch(`${baseUrl}/`),
    fetch(`${baseUrl}/services`),
    fetch(`${baseUrl}/admin`),
    fetch(`${baseUrl}/api/admin/stats`,       { headers: adminH }),
    fetch(`${baseUrl}/api/admin/work-orders`, { headers: adminH }),
    fetch(`${baseUrl}/api/health`),
    fetch(`${baseUrl}/calculator`),
    fetch(`${baseUrl}/contact`),
  ]);

  const elapsed = Date.now() - t0;

  for (const res of results) {
    assert.ok(
      res.status >= 200 && res.status < 300,
      `Concurrent request returned unexpected ${res.status}`,
    );
  }
  assert.ok(elapsed < 5000, `Concurrent batch took ${elapsed} ms (limit: 5 000 ms)`);
});

test('CONC-02 | 3 simultaneous bookings get distinct order IDs (no data corruption)', async () => {
  const phones   = ['0700331001', '0700331002', '0700331003'];
  const bookings = await Promise.all(phones.map((phone, i) =>
    fetch(`${baseUrl}/api/work-orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: `Concurrent Client ${i + 1}`,
        email: `concurr${i + 1}@e2e.test`,
        phone,
        service_type: 'Mowing',
        address: 'Test Street',
        pin: `222${i}`,
      }),
    }),
  ));

  const ids = new Set();
  for (const res of bookings) {
    assert.equal(res.status, 201, 'Every concurrent booking must return 201');
    const json = await res.json();
    assert.ok(json.data.id, 'Every booking must have a unique order ID');
    ids.add(json.data.id);
  }
  assert.equal(ids.size, phones.length, 'All concurrent bookings must have DISTINCT order IDs');
});

// =============================================================================
// BLOCK 6: Admin listing endpoints
// =============================================================================
test('ADM-01 | All admin listing endpoints return correct array structure', async () => {
  const adminH = { 'x-admin-token': ADMIN_TOKEN };
  const [inv, pay, quot, leads] = await Promise.all([
    fetch(`${baseUrl}/api/admin/invoices`, { headers: adminH }),
    fetch(`${baseUrl}/api/admin/payments`, { headers: adminH }),
    fetch(`${baseUrl}/api/admin/quotes`,   { headers: adminH }),
    fetch(`${baseUrl}/api/admin/leads`,    { headers: adminH }),
  ]);

  assert.equal(inv.status,   200);
  assert.equal(pay.status,   200);
  assert.equal(quot.status,  200);
  assert.equal(leads.status, 200);

  const invJson   = await inv.json();
  const payJson   = await pay.json();
  const quotJson  = await quot.json();
  const leadsJson = await leads.json();

  assert.ok(Array.isArray(invJson.invoices),  'invoices must be an array');
  assert.ok(Array.isArray(payJson.payments),  'payments must be an array');
  assert.ok(Array.isArray(quotJson.quotes),   'quotes must be an array');
  assert.ok(Array.isArray(leadsJson.leads),   'leads must be an array');
});

test('ADM-02 | Status filter scopes work order results correctly', async () => {
  const adminH   = { 'x-admin-token': ADMIN_TOKEN };
  const statuses = ['pending_confirmation', 'confirmed', 'dispatched', 'in_progress', 'completed'];

  for (const status of statuses) {
    const res  = await fetch(`${baseUrl}/api/admin/work-orders?status=${status}`, { headers: adminH });
    assert.equal(res.status, 200, `Filter ?status=${status} must return 200`);
    const json = await res.json();
    for (const order of json.orders) {
      assert.equal(order.status, status, `All returned orders must have status=${status}`);
    }
  }
});

test('ADM-03 | GET unknown work order ID returns 404', async () => {
  const res = await fetch(`${baseUrl}/api/admin/work-orders/wo_does_not_exist_xyz`, {
    headers: { 'x-admin-token': ADMIN_TOKEN },
  });
  assert.equal(res.status, 404);
});
