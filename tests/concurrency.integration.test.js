import test from 'node:test';
import assert from 'node:assert/strict';
import { resetRuntimeEnv } from './helpers/env.js';
import fs from 'node:fs';
import path from 'node:path';
import { startMockDaraja, buildCallbackPayload } from './helpers/mock-daraja.js';

let createApp;
let server;
let baseUrl;
let mockDaraja;

const ADMIN_TOKEN = 'secret-ops-token-2026';

test.before(async () => {
  resetRuntimeEnv({ BOOKING_MODE: 'confirm' });
  process.env.ADMIN_API_TOKEN = ADMIN_TOKEN;
  process.env.PORTAL_STORE_FILE = path.resolve('data', 'test-concurrency.json');
  fs.rmSync(process.env.PORTAL_STORE_FILE, { force: true });
  process.env.NODE_ENV = 'development';

  mockDaraja = await startMockDaraja();
  process.env.MPESA_ENVIRONMENT = 'sandbox';
  process.env.MPESA_CONSUMER_KEY = 'test-consumer-key';
  process.env.MPESA_CONSUMER_SECRET = 'test-consumer-secret';
  process.env.MPESA_SHORTCODE = '174379';
  process.env.MPESA_PASSKEY = 'test-passkey';
  process.env.MPESA_CALLBACK_URL = 'https://example.com/api/mpesa/callback';
  process.env.MPESA_CALLBACK_TOKEN = 'test-callback-token';
  process.env.MPESA_BASE_URL = mockDaraja.baseUrl;

  const appModule = await import('../app.js');
  createApp = appModule.createApp;

  const app = createApp();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
  if (mockDaraja) await mockDaraja.close();
  if (process.env.PORTAL_STORE_FILE) {
    fs.rmSync(process.env.PORTAL_STORE_FILE, { force: true });
  }
});

test('Concurrent operation: Customer on main site and supervisor on dashboard work in lockstep', async () => {
  const adminHeaders = {
    'Content-Type': 'application/json',
    'x-admin-token': ADMIN_TOKEN,
  };

  // -------------------------------------------------------------
  // STEP 1: Main Website - Pages are healthy and reachable
  // -------------------------------------------------------------
  const homeRes = await fetch(`${baseUrl}/`);
  assert.equal(homeRes.status, 200, 'Home page must be reachable');
  const servicesRes = await fetch(`${baseUrl}/services`);
  assert.equal(servicesRes.status, 200, 'Services page must be reachable');
  const calcRes = await fetch(`${baseUrl}/calculator`);
  assert.equal(calcRes.status, 200, 'Calculator page must be reachable');

  // Customer submits contact inquiry on marketing site
  const leadRes = await fetch(`${baseUrl}/api/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'David Kimani',
      email: 'david.kimani@example.com',
      phone: '+254711223344',
      message: 'Looking for weekly estate lawn mowing and weed control.',
    }),
  });
  assert.equal(leadRes.status, 201, 'Contact inquiry should be created');

  // -------------------------------------------------------------
  // STEP 2: Customer books a service on main site
  // -------------------------------------------------------------
  const orderRes = await fetch(`${baseUrl}/api/work-orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'David Kimani',
      email: 'david.kimani@example.com',
      phone: '+254711223344',
      service_type: 'Precision Mowing & Edging',
      address: 'House 42, Karen Green Estate, Nairobi',
      pin: '8899',
    }),
  });
  assert.equal(orderRes.status, 201, 'Booking should be created');
  const orderJson = await orderRes.json();
  const orderId = orderJson.data.id;
  const invoiceId = orderJson.invoice.id;

  assert.equal(orderJson.data.status, 'pending_confirmation');
  assert.equal(orderJson.invoice.status, 'estimate');

  // Customer cannot pay yet while it is an estimate
  const prematurePay = await fetch(`${baseUrl}/api/mpesa/stkpush`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+254711223344', invoice_id: invoiceId }),
  });
  assert.equal(prematurePay.status, 409, 'Estimate should not be payable');

  // -------------------------------------------------------------
  // STEP 3: Supervisor Dashboard - Checks queue and leads
  // -------------------------------------------------------------
  const adminPageRes = await fetch(`${baseUrl}/admin`);
  assert.equal(adminPageRes.status, 200, 'Supervisor dashboard page must be reachable');

  // Verify auth
  const verifyRes = await fetch(`${baseUrl}/api/admin/verify`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ token: ADMIN_TOKEN }),
  });
  assert.equal(verifyRes.status, 200, 'Supervisor auth should be valid');

  // Check stats show pending confirmation
  const statsRes = await fetch(`${baseUrl}/api/admin/stats`, { headers: adminHeaders });
  assert.equal(statsRes.status, 200);
  const stats = (await statsRes.json()).stats;
  assert.ok(stats.pending_confirmation >= 1, 'Stats must reflect order pending confirmation');
  assert.ok(stats.total_leads >= 1, 'Stats must reflect the submitted lead');

  // Find order in work orders list
  const ordersListRes = await fetch(`${baseUrl}/api/admin/work-orders?status=pending_confirmation`, {
    headers: adminHeaders,
  });
  assert.equal(ordersListRes.status, 200);
  const ordersList = (await ordersListRes.json()).orders;
  const targetOrder = ordersList.find((o) => o.id === orderId);
  assert.ok(targetOrder, 'Supervisor should see David Kimani order in the queue');

  // Find lead in leads list
  const leadsListRes = await fetch(`${baseUrl}/api/admin/leads`, { headers: adminHeaders });
  assert.equal(leadsListRes.status, 200);
  const leadsList = (await leadsListRes.json()).leads;
  assert.ok(leadsList.some((l) => l.email === 'david.kimani@example.com'), 'Supervisor should see the contact inquiry');

  // -------------------------------------------------------------
  // STEP 4: Supervisor confirms order and sets schedule/crew
  // -------------------------------------------------------------
  const confirmRes = await fetch(`${baseUrl}/api/admin/work-orders/${orderId}/confirm`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      total_amount: 5200,
      scheduled_date: 'Tomorrow 10:00 AM',
      crew_name: 'Echo Crew',
      crew_lead: 'Samuel Njoroge',
      crew_phone: '0722001122',
      notes: 'Customer requested front lawn cut first.',
    }),
  });
  assert.equal(confirmRes.status, 200, 'Confirmation must succeed');
  const confirmJson = await confirmRes.json();
  assert.equal(confirmJson.data.status, 'confirmed');
  assert.equal(confirmJson.invoice.status, 'unpaid');
  assert.equal(confirmJson.invoice.total_amount, 5200);

  // -------------------------------------------------------------
  // STEP 5: Customer Hub & Pay Page reflect confirmed status
  // -------------------------------------------------------------
  const hubLookup = await fetch(`${baseUrl}/api/portal/lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: '+254711223344', pin: '8899' }),
  });
  assert.equal(hubLookup.status, 200);
  const hubJson = await hubLookup.json();
  assert.equal(hubJson.work_orders[0].status, 'confirmed');
  assert.equal(hubJson.work_orders[0].scheduled_date, 'Tomorrow 10:00 AM');
  assert.equal(hubJson.invoices[0].status, 'unpaid');
  assert.equal(hubJson.invoices[0].total_amount, 5200);

  // Customer checks invoice
  const invRes = await fetch(`${baseUrl}/api/invoices/${invoiceId}`);
  assert.equal(invRes.status, 200);
  const invJson = await invRes.json();
  assert.equal(invJson.data.status, 'unpaid');
  assert.equal(invJson.data.balance_due, 5200);

  // Customer initiates M-Pesa Payment
  const payPush = await fetch(`${baseUrl}/api/mpesa/stkpush`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+254711223344', invoice_id: invoiceId, amount: 5200 }),
  });
  assert.equal(payPush.status, 200);
  const payJson = await payPush.json();
  const checkoutId = payJson.checkout_request_id || payJson.checkoutRequestId;
  assert.ok(checkoutId, 'checkout_request_id must be returned');

  // Daraja webhook completes payment
  const callbackPayload = buildCallbackPayload({
    checkoutRequestId: checkoutId,
    resultCode: 0,
    amount: 5200,
    mpesaReceipt: 'QG91LC8899',
    phone: '254711223344',
  });
  const cbRes = await fetch(`${baseUrl}/api/mpesa/callback/test-callback-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(callbackPayload),
  });
  assert.equal(cbRes.status, 200);

  // Customer invoice is now settled
  const settledInv = await fetch(`${baseUrl}/api/invoices/${invoiceId}`);
  const settledJson = await settledInv.json();
  assert.equal(settledJson.data.status, 'paid');
  assert.equal(settledJson.data.balance_due, 0);

  // -------------------------------------------------------------
  // STEP 6: Supervisor Dispatches Crew & Sends Live GPS
  // -------------------------------------------------------------
  const dispatchRes = await fetch(`${baseUrl}/api/admin/work-orders/${orderId}`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({
      status: 'dispatched',
      crew_vehicle: 'Toyota Hilux KDF 102Z',
      crew_lat: -1.286389,
      crew_lng: 36.817223,
      checklist: [
        { task: 'Property Boundary Survey', status: 'completed' },
        { task: 'Precision Mowing & Edging', status: 'in_progress' },
        { task: 'Clippings Sweeping & Haul', status: 'pending' },
      ],
    }),
  });
  assert.equal(dispatchRes.status, 200, 'Dispatch update should succeed');

  // Customer opens tracker and inspects live order
  const trackerRes = await fetch(`${baseUrl}/tracker/${orderId}`);
  assert.equal(trackerRes.status, 200, 'Tracker page must serve 200 HTML');

  const customerOrder = await fetch(`${baseUrl}/api/work-orders/${orderId}`);
  assert.equal(customerOrder.status, 200);
  const custOrderJson = await customerOrder.json();
  assert.equal(custOrderJson.data.status, 'dispatched');
  assert.equal(custOrderJson.data.crew_vehicle, 'Toyota Hilux KDF 102Z');
  assert.equal(custOrderJson.data.crew_lat, -1.286389);
  assert.equal(custOrderJson.data.crew_lng, 36.817223);
  assert.equal(custOrderJson.data.checklist.length, 3);
  assert.equal(custOrderJson.data.checklist[0].status, 'completed');
  assert.equal(custOrderJson.data.checklist[1].status, 'in_progress');

  // -------------------------------------------------------------
  // STEP 7: Crew finishes job -> Supervisor completes order
  // -------------------------------------------------------------
  const finishRes = await fetch(`${baseUrl}/api/admin/work-orders/${orderId}`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({
      status: 'completed',
      checklist: [
        { task: 'Property Boundary Survey', status: 'completed' },
        { task: 'Precision Mowing & Edging', status: 'completed' },
        { task: 'Clippings Sweeping & Haul', status: 'completed' },
      ],
    }),
  });
  assert.equal(finishRes.status, 200);

  // Final check on stats
  const finalStatsRes = await fetch(`${baseUrl}/api/admin/stats`, { headers: adminHeaders });
  const finalStats = (await finalStatsRes.json()).stats;
  assert.ok(finalStats.completed >= 1, 'Completed orders counter should have incremented');
  assert.ok(finalStats.total_revenue_collected >= 5200, 'Revenue counter should include the KES 5,200 payment');
});
