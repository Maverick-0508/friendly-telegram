import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

let createApp;
let server;
let baseUrl;

test.before(async () => {
  fs.rmSync(path.resolve('data'), { recursive: true, force: true });
  process.env.NODE_ENV = 'development';
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_ANON_KEY;
  delete process.env.DATABASE_URL;

  const appModule = await import('../app.js');
  createApp = appModule.createApp;

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
  });
  assert.equal(create.response.status, 201);
  assert.equal(create.body.success, true);
  const clientId = create.body.client.id;

  const update = await post('/api/portal/clients', {
    name: 'Flow Client',
    phone: '+254700111222',
    email: 'flow.client@example.com',
    address: '12 Runda Drive',
  });
  assert.equal(update.response.status, 200);
  assert.equal(update.body.message.includes('updated'), true);

  const byPhone = await post('/api/portal/lookup', { identifier: '0700111222' });
  assert.equal(byPhone.response.status, 200);
  assert.equal(byPhone.body.client.id, clientId);

  const byEmail = await request('/api/portal/lookup?identifier=flow.client@example.com');
  assert.equal(byEmail.response.status, 200);
  assert.equal(byEmail.body.client.email, 'flow.client@example.com');
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

test('work order, invoice settlement, and M-Pesa flow works end-to-end', async () => {
  const order = await post('/api/work-orders', {
    client_name: 'Payment Client',
    phone: '+254700333444',
    email: 'payment.client@example.com',
    service_type: 'Full Landscape Maintenance',
    total_price: 12000,
    address: '99 Riverside',
  });
  assert.equal(order.response.status, 201);
  const orderId = order.body.data.id;
  const invoiceId = order.body.invoice.id;

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

  const afterMpesa = await request(`/api/invoices/${invoiceId}`);
  assert.equal(afterMpesa.body.data.status, 'paid');
  assert.equal(afterMpesa.body.data.balance_due, 0);

  const settled = await post(`/api/invoices/${invoiceId}/pay`, {
    card_last4: '4242',
  });
  assert.equal(settled.response.status, 200);
  assert.equal(settled.body.data.payment_method.includes('4242'), true);
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

  const lookup = await post('/api/portal/lookup', { identifier: 'quote.lookup@example.com' });
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