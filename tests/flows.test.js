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

test.before(async () => {
  resetRuntimeEnv({ BOOKING_MODE: 'instant' });
  process.env.PORTAL_STORE_FILE = path.resolve('data', 'test-flows.json');
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
});

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json().catch(() => null);
  return { response, body };
}

function post(path, payload) {
  return request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

test('contact endpoint validates required fields', async () => {
  const missingName = await post('/api/contact', {
    email: 'client@example.com',
    phone: '+254700000000',
  });
  assert.equal(missingName.response.status, 400);
  assert.equal(missingName.body.error.code, 'VALIDATION_ERROR');

  const badEmail = await post('/api/contact', {
    name: 'Test Client',
    email: 'not-an-email',
    phone: '+254700000000',
  });
  assert.equal(badEmail.response.status, 400);
  assert.equal(badEmail.body.error.code, 'VALIDATION_ERROR');
});

test('quote endpoint validates required fields', async () => {
  const missingFields = await post('/api/quotes', {
    service_type: 'Lawn Mowing',
  });
  assert.equal(missingFields.response.status, 400);
  assert.equal(missingFields.body.error.code, 'VALIDATION_ERROR');
});

test('client profile create, update, and lookup flow works', async () => {
  const create = await post('/api/portal/clients', {
    name: 'Flow Client',
    phone: '+254700111222',
    email: 'flow.client@example.com',
    address: '10 Runda Drive',
    service_plan: 'Weekly Care',
    pin: '2468',
  });
  assert.equal(create.response.status, 201);
  assert.equal(create.body.success, true);
  const clientId = create.body.client.id;

  assert.equal('access_pin_hash' in create.body.client, false, 'PIN hash must never be returned');
  assert.equal('access_pin_salt' in create.body.client, false);

  // Updating an existing profile requires its PIN.
  const updateNoPin = await post('/api/portal/clients', {
    name: 'Flow Client',
    phone: '+254700111222',
    email: 'flow.client@example.com',
    address: '12 Runda Drive',
  });
  assert.equal(updateNoPin.response.status, 403);
  assert.equal(updateNoPin.body.error.code, 'ACCESS_PIN_REQUIRED');

  const update = await post('/api/portal/clients', {
    name: 'Flow Client',
    phone: '+254700111222',
    email: 'flow.client@example.com',
    address: '12 Runda Drive',
    pin: '2468',
  });
  assert.equal(update.response.status, 200);
  assert.equal(update.body.message.includes('updated'), true);
  assert.equal(update.body.client.address, '12 Runda Drive');
  assert.equal('access_pin_hash' in update.body.client, false);

  // Lookup is gated behind the access PIN.
  const noPin = await post('/api/portal/lookup', { identifier: '0700111222' });
  assert.equal(noPin.response.status, 403);
  assert.equal(noPin.body.error.code, 'ACCESS_PIN_REQUIRED');

  const wrongPin = await post('/api/portal/lookup', { identifier: '0700111222', pin: '0000' });
  assert.equal(wrongPin.response.status, 403);
  assert.equal(wrongPin.body.error.code, 'INVALID_PIN');

  const byPhone = await post('/api/portal/lookup', { identifier: '0700111222', pin: '2468' });
  assert.equal(byPhone.response.status, 200);
  assert.equal(byPhone.body.client.id, clientId);
  assert.equal('access_pin_hash' in byPhone.body.client, false);

  const byEmail = await post('/api/portal/lookup', { identifier: 'flow.client@example.com', pin: '2468' });
  assert.equal(byEmail.response.status, 200);
  assert.equal(byEmail.body.client.email, 'flow.client@example.com');

  // The PIN never travels in a URL: the GET variant is gone.
  const getLookup = await request('/api/portal/lookup?identifier=flow.client@example.com&pin=2468');
  assert.equal(getLookup.response.status, 404);
});

test('coupon validation handles valid, invalid, and minimum-order cases', async () => {
  const invalid = await post('/api/coupons/validate', { code: 'NOPE', amount: 5000 });
  assert.equal(invalid.response.status, 400);
  assert.equal(invalid.body.valid, false);
  assert.equal(invalid.body.code, 'INVALID_COUPON');

  const percent = await post('/api/coupons/validate', { code: 'SPRING20', amount: 10000 });
  assert.equal(percent.response.status, 200);
  assert.equal(percent.body.valid, true);
  assert.equal(percent.body.discount_amount, 2000);
  assert.equal(percent.body.final_amount, 8000);

  const fixed = await post('/api/coupons/validate', { code: 'FIRSTCUT', amount: 10000 });
  assert.equal(fixed.response.status, 200);
  assert.equal(fixed.body.valid, true);
  assert.equal(fixed.body.discount_amount, 1500);

  const minOrder = await post('/api/coupons/validate', { code: 'GREEN50', amount: 10000 });
  assert.equal(minOrder.response.status, 400);
  assert.equal(minOrder.body.code, 'MIN_ORDER_NOT_MET');
});

test('work order, invoice, and real M-Pesa STK + callback flow works end-to-end', async () => {
  const order = await post('/api/work-orders', {
    client_name: 'Payment Client',
    phone: '+254700333444',
    email: 'payment.client@example.com',
    service_type: 'Full Landscape Maintenance',
    total_price: 1, // ignored: the catalogue decides the price
    status: 'completed', // ignored: orders always start in the dispatch queue
    address: '99 Riverside',
  });
  assert.equal(order.response.status, 201);
  const orderId = order.body.data.id;
  const invoiceId = order.body.invoice.id;
  assert.equal(order.body.invoice.total_amount, 12000, 'price comes from the server catalogue');
  assert.equal(order.body.data.status, 'incoming');

  const getOrder = await request(`/api/work-orders/${orderId}`);
  assert.equal(getOrder.response.status, 200);
  assert.equal(getOrder.body.data.id, orderId);

  const beforePay = await request(`/api/invoices/${invoiceId}`);
  assert.equal(beforePay.response.status, 200);
  assert.equal(beforePay.body.data.status, 'unpaid');

  const mpesa = await post('/api/mpesa/stkpush', {
    phone: '+254700333444',
    amount: 12000,
    invoice_id: invoiceId,
  });
  assert.equal(mpesa.response.status, 200);
  assert.equal(mpesa.body.success, true);
  const checkoutId = mpesa.body.checkout_request_id;
  assert.ok(checkoutId, 'STK push must return a CheckoutRequestID');

  // An STK push on its own must NOT mark the invoice paid.
  const stillUnpaid = await request(`/api/invoices/${invoiceId}`);
  assert.equal(stillUnpaid.body.data.status, 'unpaid');

  const statusPending = await request(`/api/mpesa/status/${checkoutId}`);
  assert.equal(statusPending.response.status, 200);
  assert.equal(statusPending.body.data.status, 'pending');

  // Callback requires the shared secret.
  const badCallback = await post(
    '/api/mpesa/callback/wrong-token',
    buildCallbackPayload({ checkoutRequestId: checkoutId })
  );
  assert.equal(badCallback.response.status, 401);

  // A successful callback confirms the payment and settles the invoice.
  const callback = await post(
    '/api/mpesa/callback/test-callback-token',
    buildCallbackPayload({
      checkoutRequestId: checkoutId,
      amount: 12000,
      phone: '254700333444',
      receipt: 'NLJ7RT61SV',
    })
  );
  assert.equal(callback.response.status, 200);
  assert.equal(callback.body.ResultCode, 0);

  const statusPaid = await request(`/api/mpesa/status/${checkoutId}`);
  assert.equal(statusPaid.body.data.status, 'success');
  assert.equal(statusPaid.body.data.mpesa_receipt, 'NLJ7RT61SV');

  const afterMpesa = await request(`/api/invoices/${invoiceId}`);
  assert.equal(afterMpesa.body.data.status, 'paid');
  assert.equal(afterMpesa.body.data.balance_due, 0);
  assert.equal(afterMpesa.body.data.mpesa_receipt, 'NLJ7RT61SV');
});

test('a cancelled M-Pesa callback marks the payment cancelled', async () => {
  const order = await post('/api/work-orders', {
    client_name: 'Failed Payment Client',
    phone: '+254700333555',
    email: 'payment.failed@example.com',
    service_type: 'Lawn Mowing',
    address: '12 Mombasa Rd',
  });
  const invoiceId = order.body.invoice.id;

  const mpesa = await post('/api/mpesa/stkpush', {
    phone: '+254700333555',
    amount: order.body.invoice.total_amount,
    invoice_id: invoiceId,
  });
  assert.equal(mpesa.response.status, 200);
  const checkoutId = mpesa.body.checkout_request_id;

  const callback = await post(
    '/api/mpesa/callback/test-callback-token',
    buildCallbackPayload({
      checkoutRequestId: checkoutId,
      resultCode: 1032,
      resultDesc: 'Request cancelled by user',
    })
  );
  assert.equal(callback.response.status, 200);

  const status = await request(`/api/mpesa/status/${checkoutId}`);
  assert.equal(status.body.data.status, 'cancelled');

  const invoice = await request(`/api/invoices/${invoiceId}`);
  assert.equal(invoice.body.data.status, 'unpaid');
});

test('quote submission registers a portal quote that lookup returns', async () => {
  const quote = await post('/api/quotes', {
    full_name: 'Quote Lookup Client',
    email: 'quote.lookup@example.com',
    phone: '+254700555666',
    service_type: 'Seasonal Maintenance',
    property_size: 8000,
  });
  assert.equal(quote.response.status, 201);

  // Quote-only profiles have no PIN yet. Claiming one needs the email on file,
  // so a phone number alone cannot take over the profile.
  const wrongEmail = await post('/api/portal/clients', {
    name: 'Quote Lookup Client',
    phone: '+254700555666',
    email: 'attacker@example.com',
    pin: '1357',
  });
  assert.equal(wrongEmail.response.status, 403);
  assert.equal(wrongEmail.body.error.code, 'CLAIM_EMAIL_MISMATCH');

  const adoptPin = await post('/api/portal/clients', {
    name: 'Quote Lookup Client',
    phone: '+254700555666',
    email: 'quote.lookup@example.com',
    pin: '1357',
  });
  assert.equal(adoptPin.response.status, 200);

  const lookup = await post('/api/portal/lookup', { identifier: 'quote.lookup@example.com', pin: '1357' });
  assert.equal(lookup.response.status, 200);
  assert.equal(lookup.body.quotes.length >= 1, true);
});

test('analytics receiver is reachable', async () => {
  const analytics = await post('/api/analytics', { page: '/', referrer: 'none' });
  assert.equal(analytics.response.status, 200);
  assert.equal(analytics.body.success, true);
});

test('unknown API routes return structured JSON 404', async () => {
  const notFound = await request('/api/does-not-exist');
  assert.equal(notFound.response.status, 404);
  assert.equal(notFound.body.error.code, 'ROUTE_NOT_FOUND');
});