import test from 'node:test';
import assert from 'node:assert/strict';
import { resetRuntimeEnv } from './helpers/env.js';
import fs from 'node:fs';
import path from 'node:path';
import { startMockDaraja } from './helpers/mock-daraja.js';

let server;
let baseUrl;
let mockDaraja;
// Imported after PORTAL_STORE_FILE is set so this suite gets its own store.
let store;

test.before(async () => {
  resetRuntimeEnv({ BOOKING_MODE: 'instant' });
  process.env.PORTAL_STORE_FILE = path.resolve('data', 'test-reconcile.json');
  fs.rmSync(process.env.PORTAL_STORE_FILE, { force: true });
  ({ store } = await import('../node-backend/services/store.js'));
  process.env.NODE_ENV = 'development';

  const queryResults = {};
  mockDaraja = await startMockDaraja({ queryResults });
  process.env.MPESA_ENVIRONMENT = 'sandbox';
  process.env.MPESA_CONSUMER_KEY = 'test-consumer-key';
  process.env.MPESA_CONSUMER_SECRET = 'test-consumer-secret';
  process.env.MPESA_SHORTCODE = '174379';
  process.env.MPESA_PASSKEY = 'test-passkey';
  process.env.MPESA_CALLBACK_URL = 'https://example.com/api/mpesa/callback';
  process.env.MPESA_CALLBACK_TOKEN = 'test-callback-token';
  process.env.MPESA_BASE_URL = mockDaraja.baseUrl;

  const appModule = await import('../app.js');
  const app = appModule.createApp();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;

  // Keep the shared queryResults map mutable so tests can program results for
  // specific checkout IDs after the STK push happens.
  globalThis.__reconTestQueryResults = queryResults;
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  if (mockDaraja) await mockDaraja.close();
});

async function post(path, payload) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => null);
  return { response, body };
}

// Create a work order + invoice, and initiate a real (mock) STK push so a
// pending payment exists. Then backdate it so reconciliation treats it as stale.
async function createStalePendingPayment(name, phone, serviceType) {
  const order = await post('/api/work-orders', {
    client_name: name,
    phone,
    service_type: serviceType,
    address: '88 Reconciliation Rd',
  });
  assert.equal(order.response.status, 201);
  const invoiceId = order.body.invoice.id;

  const mpesa = await post('/api/mpesa/stkpush', {
    phone,
    amount: order.body.invoice.total_amount,
    invoice_id: invoiceId,
  });
  assert.equal(mpesa.response.status, 200);
  const checkoutId = mpesa.body.checkout_request_id;
  assert.ok(checkoutId);

  // Backdate pending payments so the default grace period is exceeded.
  const now = new Date().toISOString();
  const pending = await store.pendingPaymentsOlderThan(now, 100);
  const target = pending.find((p) => p.checkout_request_id === checkoutId);
  assert.ok(target, 'pending payment should exist before reconciliation');
  target.created_at = new Date(Date.now() - 86400000).toISOString();
  await store.upsertPayment(target);

  return { invoiceId, checkoutId };
}

test('reconciliation settles a stale pending payment whose callback was lost', async () => {
  const { invoiceId, checkoutId } = await createStalePendingPayment(
    'Recon Success Client',
    '+254700777001',
    'Core Aeration'
  );

  // Vercel Cron calls the endpoint with GET.
  const reconResponse = await fetch(`${baseUrl}/api/mpesa/reconcile`);
  const recon = { response: reconResponse, body: await reconResponse.json() };
  assert.equal(recon.response.status, 200);
  assert.equal(recon.body.success, true);
  assert.ok(recon.body.checked >= 1, 'should have checked at least one payment');
  assert.ok(recon.body.settled >= 1, 'the stale payment should be settled');
  assert.ok(mockDaraja.queried.includes(checkoutId), 'reconciliation must query Daraja');

  const invoice = await fetch(`${baseUrl}/api/invoices/${invoiceId}`);
  const invoiceBody = await invoice.json();
  assert.equal(invoiceBody.data.status, 'paid');
  assert.equal(invoiceBody.data.mpesa_receipt, 'NLJ7RT61SV');
});

test('reconciliation marks stale pending payments cancelled when Daraja says so', async () => {
  const { invoiceId, checkoutId } = await createStalePendingPayment(
    'Recon Cancel Client',
    '+254700777002',
    'Lawn Mowing'
  );
  globalThis.__reconTestQueryResults[checkoutId] = { resultCode: '1032', resultDesc: 'Request cancelled by user' };

  const recon = await post('/api/mpesa/reconcile', {});
  assert.equal(recon.body.success, true);
  assert.ok(recon.body.cancellations >= 1, 'the cancelled payment should be marked cancelled');

  const invoice = await fetch(`${baseUrl}/api/invoices/${invoiceId}`);
  const invoiceBody = await invoice.json();
  assert.equal(invoiceBody.data.status, 'unpaid');
});