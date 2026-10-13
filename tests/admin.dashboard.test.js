import test from 'node:test';
import assert from 'node:assert/strict';
import { resetRuntimeEnv } from './helpers/env.js';

let createApp;
let store;
let server;
let baseUrl;

const ADMIN_TOKEN = 'test-supervisor-token-xyz';

test.before(async () => {
  resetRuntimeEnv();
  process.env.ADMIN_API_TOKEN = ADMIN_TOKEN;
  ({ createApp } = await import('../app.js'));
  ({ store } = await import('../node-backend/services/store.js'));

  const app = createApp();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  if (!server) return;
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

test('GET /admin serves the supervisor portal page', async () => {
  const res = await fetch(`${baseUrl}/admin`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Supervisor & Operations Hub/);
  assert.match(html, /Field Work Orders & Dispatch Queue/);
});

test('POST /api/admin/verify rejects invalid token and accepts valid token', async () => {
  const bad = await fetch(`${baseUrl}/api/admin/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': 'wrong-token' },
    body: JSON.stringify({ token: 'wrong-token' }),
  });
  assert.equal(bad.status, 401);

  const good = await fetch(`${baseUrl}/api/admin/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': ADMIN_TOKEN },
    body: JSON.stringify({ token: ADMIN_TOKEN }),
  });
  assert.equal(good.status, 200);
  const json = await good.json();
  assert.equal(json.authorized, true);
  assert.equal(json.role, 'supervisor');
});

test('GET /api/admin/stats returns aggregate operations metrics', async () => {
  const res = await fetch(`${baseUrl}/api/admin/stats`, {
    headers: { 'x-admin-token': ADMIN_TOKEN },
  });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.ok('total_work_orders' in json.stats);
  assert.ok('total_revenue_collected' in json.stats);
  assert.ok('pending_confirmation' in json.stats);
});

test('Admin can list, inspect, and update work orders', async () => {
  // Seed a work order
  const orderId = 'wo_adm_test_' + Date.now();
  await store.upsertWorkOrder({
    id: orderId,
    client_name: 'Jane Doe',
    phone: '0712345678',
    service_type: 'Mowing & Edging',
    status: 'pending_confirmation',
    created_at: new Date().toISOString(),
  });

  // 1. List
  const listRes = await fetch(`${baseUrl}/api/admin/work-orders`, {
    headers: { 'x-admin-token': ADMIN_TOKEN },
  });
  assert.equal(listRes.status, 200);
  const listJson = await listRes.json();
  assert.ok(Array.isArray(listJson.orders));
  assert.ok(listJson.orders.some((o) => o.id === orderId));

  // 2. Get single
  const getRes = await fetch(`${baseUrl}/api/admin/work-orders/${orderId}`, {
    headers: { 'x-admin-token': ADMIN_TOKEN },
  });
  assert.equal(getRes.status, 200);
  const getJson = await getRes.json();
  assert.equal(getJson.order.id, orderId);

  // 3. Patch dispatch details
  const patchRes = await fetch(`${baseUrl}/api/admin/work-orders/${orderId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': ADMIN_TOKEN,
    },
    body: JSON.stringify({
      status: 'dispatched',
      crew_name: 'Delta Crew',
      crew_lead: 'Alex Kibet',
      crew_lat: -1.295,
      crew_lng: 36.82,
      checklist: [
        { task: 'Survey turf edges', status: 'completed' },
        { task: 'Mow lawn', status: 'in_progress' },
      ],
    }),
  });
  assert.equal(patchRes.status, 200);
  const patchJson = await patchRes.json();
  assert.equal(patchJson.order.status, 'dispatched');
  assert.equal(patchJson.order.crew_lead, 'Alex Kibet');
  assert.equal(patchJson.order.crew_lat, -1.295);
  assert.equal(patchJson.order.checklist.length, 2);
});

test('Admin can retrieve invoices, payments, quotes and leads', async () => {
  const headers = { 'x-admin-token': ADMIN_TOKEN };
  const [inv, pay, quotes, leads] = await Promise.all([
    fetch(`${baseUrl}/api/admin/invoices`, { headers }),
    fetch(`${baseUrl}/api/admin/payments`, { headers }),
    fetch(`${baseUrl}/api/admin/quotes`, { headers }),
    fetch(`${baseUrl}/api/admin/leads`, { headers }),
  ]);

  assert.equal(inv.status, 200);
  assert.equal(pay.status, 200);
  assert.equal(quotes.status, 200);
  assert.equal(leads.status, 200);

  const invJson = await inv.json();
  const payJson = await pay.json();
  const quotesJson = await quotes.json();
  const leadsJson = await leads.json();

  assert.ok(Array.isArray(invJson.invoices));
  assert.ok(Array.isArray(payJson.payments));
  assert.ok(Array.isArray(quotesJson.quotes));
  assert.ok(Array.isArray(leadsJson.leads));
});
