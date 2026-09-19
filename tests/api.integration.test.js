import test from 'node:test';
import assert from 'node:assert/strict';
import { resetRuntimeEnv } from './helpers/env.js';
import fs from 'node:fs';
import path from 'node:path';

let server;
let baseUrl;

test.before(async () => {
  resetRuntimeEnv({ ENABLE_ACCOUNT_AUTH: 'true', BOOKING_MODE: 'instant' });
  process.env.PORTAL_STORE_FILE = path.resolve('data', 'test-api.integration.json');
  fs.rmSync(process.env.PORTAL_STORE_FILE, { force: true });
  process.env.NODE_ENV = 'development';

  const appModule = await import('../app.js');
  const app = appModule.createApp();
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

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json().catch(() => null);
  return { response, body };
}

test('readiness endpoint responds with health details', async () => {
  const { response, body } = await request('/api/ready');
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(typeof body.checks.auth_configured, 'boolean');
  assert.equal(typeof body.checks.persistence_configured, 'boolean');
});

test('auth endpoints fail closed when auth is not configured', async () => {
  const register = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'user@example.com', password: 'secret123', fullName: 'Test User' }),
  });
  assert.equal(register.response.status, 503);
  assert.equal(register.body.error.code, 'SERVICE_UNAVAILABLE');

  const login = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'user@example.com', password: 'secret123' }),
  });
  assert.equal(login.response.status, 503);
  assert.equal(login.body.error.code, 'SERVICE_UNAVAILABLE');
});

test('contact flow accepts and stores a lead payload', async () => {
  const { response, body } = await request('/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Client One',
      email: 'client1@example.com',
      phone: '+1 555 010 0100',
      message: 'Need weekly lawn care.',
    }),
  });

  assert.equal(response.status, 201);
  assert.equal(body.success, true);
  assert.equal(body.data.email, 'client1@example.com');
});

test('quote and portal flow works end-to-end', async () => {
  const quote = await request('/api/quotes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      full_name: 'Client Two',
      email: 'client2@example.com',
      phone: '+1 555 010 0101',
      address: '42 Lawn Street',
      service_type: 'Lawn Mowing',
      service_frequency: 'weekly',
    }),
  });

  assert.equal(quote.response.status, 201);
  assert.equal(quote.body.success, true);

  // Set an access PIN on the quote-only profile so the hub can be opened.
  const registerPin = await request('/api/portal/clients', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Client Two',
      email: 'client2@example.com',
      phone: '+1 555 010 0101',
      pin: '2468',
    }),
  });
  assert.equal(registerPin.response.status, 200);

  const lookup = await request('/api/portal/lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'client2@example.com', pin: '2468' }),
  });
  assert.equal(lookup.response.status, 200);
  assert.equal(lookup.body.success, true);
});

test('work-order and payment flow works end-to-end', async () => {
  const order = await request('/api/work-orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Client Three',
      phone: '+1 555 010 0102',
      email: 'client3@example.com',
      service_type: 'Lawn Edging',
      address: '77 Green Ave',
    }),
  });

  assert.equal(order.response.status, 201);
  assert.equal(order.body.success, true);
  const orderId = order.body.data.id;
  const invoiceId = order.body.invoice.id;
  assert.equal(order.body.invoice.total_amount, 2500);

  const getOrder = await request(`/api/work-orders/${orderId}`);
  assert.equal(getOrder.response.status, 200);
  assert.equal(getOrder.body.data.id, orderId);

  const getInvoiceBeforePayment = await request(`/api/invoices/${invoiceId}`);
  assert.equal(getInvoiceBeforePayment.response.status, 200);
  assert.equal(getInvoiceBeforePayment.body.data.status, 'unpaid');

  const mpesa = await request('/api/mpesa/stkpush', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+254700010102', amount: 2500, invoice_id: invoiceId }),
  });
  // Without Daraja credentials configured the server refuses to take payment
  // rather than silently pretending the invoice was settled.
  assert.equal(mpesa.response.status, 503);
  assert.equal(mpesa.body.error.code, 'MPESA_NOT_CONFIGURED');

  const getInvoiceAfterPayment = await request(`/api/invoices/${invoiceId}`);
  assert.equal(getInvoiceAfterPayment.response.status, 200);
  assert.equal(getInvoiceAfterPayment.body.data.status, 'unpaid');
});
