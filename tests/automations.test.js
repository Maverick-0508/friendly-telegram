import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { resetRuntimeEnv } from './helpers/env.js';
import { startMockNotify } from './helpers/mock-notify.js';

const STORE_FILE = path.resolve('data', 'test-automations.json');
const CRON_SECRET = 'test-cron-secret';
const OWNER_EMAIL = 'owner@test.local';

let server;
let baseUrl;
let store;
let notify;
let counter = 0;

function nextId(prefix) {
  counter += 1;
  return `${prefix}_${counter}_${Date.now().toString(36)}`;
}

function uniquePhone() {
  counter += 1;
  return `0770${String(counter).padStart(6, '0')}`;
}

function hoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function dayOffset(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

async function seedClient(overrides = {}) {
  const id = overrides.id || nextId('cl_autotest');
  const client = {
    id,
    name: `Automation Client ${counter}`,
    phone: uniquePhone(),
    email: `${id}@example.test`,
    address: '12 Test Lane',
    loyalty: {
      points_balance: 100,
      tier: 'Bronze',
      rate_per_point: 50,
      dollar_value: 5000,
      cash_value: 5000,
      referral_code: 'LAWN-0000',
      next_tier: 'Silver',
      points_to_next_tier: 150,
    },
    ...overrides,
  };
  await store.upsertClient(client);
  return client;
}

async function seedQuote(client, { hours = 25, status = 'pending_review', id } = {}) {
  const quote = {
    id: id || nextId('qt_autotest'),
    quote_number: `QT-2026-${counter}`,
    client_id: client.id,
    client_name: client.name,
    phone: client.phone,
    email: client.email,
    title: 'Lawn Mowing',
    status,
    total_amount: 4500,
    service_type: 'Lawn Mowing',
    created_at: hoursAgo(hours),
  };
  await store.upsertQuote(quote);
  return quote;
}

async function seedInvoice(client, { status = 'unpaid', dueDate = null, balance = 5000, id } = {}) {
  const invoice = {
    id: id || nextId('inv_autotest'),
    invoice_number: `INV-2026-${counter}`,
    client_id: client.id,
    client_name: client.name,
    client_phone: client.phone,
    client_email: client.email,
    status,
    balance_due: balance,
    total_amount: balance,
    created_at: hoursAgo(48),
    ...(dueDate ? { due_date: dueDate } : {}),
  };
  await store.upsertInvoice(invoice);
  return invoice;
}

async function seedOrder(client, invoice, { status = 'completed', completedHoursAgo = 25, id } = {}) {
  const order = {
    id: id || nextId('wo_autotest'),
    client_id: client.id,
    client_name: client.name,
    client_phone: client.phone,
    client_email: client.email,
    service_type: 'Lawn Mowing',
    status,
    invoice_id: invoice ? invoice.id : null,
    completed_at: hoursAgo(completedHoursAgo),
    created_at: hoursAgo(completedHoursAgo + 2),
  };
  await store.upsertWorkOrder(order);
  return order;
}

async function seedPayment(client, invoice, { amount = 12000, status = 'success', id } = {}) {
  const payment = {
    id: id || nextId('pay_autotest'),
    invoice_id: invoice.id,
    client_id: client.id,
    phone: client.phone,
    email: client.email,
    amount,
    amount_paid: amount,
    status,
    created_at: hoursAgo(2),
  };
  await store.upsertPayment(payment);
  return payment;
}

async function runJob(job = 'all', { token = CRON_SECRET, method = 'GET' } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}/api/automations/run?job=${encodeURIComponent(job)}`, {
    method,
    headers,
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

function smsRecipients() {
  return notify.sms().map((request) => {
    try {
      return new URLSearchParams(request.body).get('to') || '';
    } catch {
      return '';
    }
  });
}

test.before(async () => {
  fs.rmSync(STORE_FILE, { force: true });
  resetRuntimeEnv({
    PORTAL_STORE_FILE: STORE_FILE,
    ADMIN_API_TOKEN: 'test-admin-token',
    CRON_SECRET,
    RESEND_API_KEY: 'test-resend-key',
    NOTIFY_FROM_EMAIL: 'noreply@test.local',
    OWNER_EMAIL,
    AFRICAS_TALKING_USERNAME: 'test-at',
    AFRICAS_TALKING_API_KEY: 'test-at-key',
    PUBLIC_SITE_URL: 'https://lawncraft.test',
    REVIEW_URL: 'https://lawncraft.test/reviews',
  });

  notify = await startMockNotify();
  process.env.RESEND_BASE_URL = notify.baseUrl;
  process.env.AFRICAS_TALKING_BASE_URL = notify.baseUrl;

  const appModule = await import('../app.js');
  const storeModule = await import('../node-backend/services/store.js');
  store = storeModule.store;

  server = appModule.createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
  if (notify) await notify.close();
  fs.rmSync(STORE_FILE, { force: true });
});

test('automation endpoint requires the cron or admin token', async () => {
  let response = await fetch(`${baseUrl}/api/automations/run?job=all`);
  assert.equal(response.status, 401);

  response = await fetch(`${baseUrl}/api/automations/run?job=all`, {
    headers: { Authorization: 'Bearer wrong-token' },
  });
  assert.equal(response.status, 401);

  const ok = await runJob('all');
  assert.equal(ok.status, 200);
  assert.equal(ok.body.success, true);
});

test('unknown automation jobs are rejected', async () => {
  const result = await runJob('payroll');
  assert.equal(result.status, 400);
  assert.equal(result.body.error.code, 'INVALID_JOB');
});

test('the route is hidden in production when no secret is configured', async () => {
  const saved = {
    nodeEnv: process.env.NODE_ENV,
    adminToken: process.env.ADMIN_API_TOKEN,
    cronSecret: process.env.CRON_SECRET,
  };
  process.env.NODE_ENV = 'production';
  process.env.ADMIN_API_TOKEN = '';
  process.env.CRON_SECRET = '';
  try {
    const response = await fetch(`${baseUrl}/api/automations/run?job=all`);
    assert.equal(response.status, 404);
  } finally {
    process.env.NODE_ENV = saved.nodeEnv;
    process.env.ADMIN_API_TOKEN = saved.adminToken;
    process.env.CRON_SECRET = saved.cronSecret;
  }
});

test('quote follow-ups send once per stage and skip converted quotes', async () => {
  notify.reset();
  const upcoming = await seedClient();
  const quote24 = await seedQuote(upcoming, { hours: 25 });

  const older = await seedClient();
  const quote72 = await seedQuote(older, { hours: 73 });

  const fresh = await seedClient();
  const quoteFresh = await seedQuote(fresh, { hours: 1 });

  const converted = await seedClient();
  const quoteConverted = await seedQuote(converted, { hours: 25 });
  await store.upsertWorkOrder({
    id: nextId('wo_converted'),
    client_id: converted.id,
    client_name: converted.name,
    client_phone: converted.phone,
    service_type: 'Lawn Mowing',
    status: 'scheduled',
    invoice_id: nextId('inv_converted'),
    created_at: hoursAgo(2),
  });

  const first = await runJob('quotes');
  assert.equal(first.status, 200);

  const recipients = smsRecipients();
  assert.equal(recipients.length, 3, 'q24 + both q24/q72 messages');
  assert.equal(recipients.filter((to) => digits(to) === digits(upcoming.phone)).length, 1);
  assert.equal(recipients.filter((to) => digits(to) === digits(older.phone)).length, 2);
  assert.equal(recipients.filter((to) => digits(to) === digits(fresh.phone)).length, 0);
  assert.equal(recipients.filter((to) => digits(to) === digits(converted.phone)).length, 0);
  assert.equal(notify.emails().length, 1, 'owner escalation email for the 72h quote');

  const claims = await store.listClaims({ job: 'quotes' });
  assert.equal(claims.filter((c) => c.entity_id === quote24.id && c.stage === 'q24').length, 1);
  assert.equal(claims.filter((c) => c.entity_id === quote72.id && c.stage === 'q72').length, 1);
  assert.equal(claims.filter((c) => c.entity_id === quoteConverted.id).length, 0);
  assert.equal(claims.filter((c) => c.entity_id === quoteFresh.id).length, 0);

  notify.reset();
  const rerun = await runJob('quotes');
  assert.equal(rerun.status, 200);
  assert.equal(notify.requests.length, 0, 'rerun must not re-send');
});

test('dunning fires each stage once and never duns estimates or paid invoices', async () => {
  notify.reset();
  const beforeDue = await seedClient();
  await seedInvoice(beforeDue, { dueDate: dayOffset(3) });

  const dueToday = await seedClient();
  await seedInvoice(dueToday, { dueDate: dayOffset(0) });

  const overdue3 = await seedClient();
  await seedInvoice(overdue3, { dueDate: dayOffset(-3) });

  const overdue8 = await seedClient();
  await seedInvoice(overdue8, { dueDate: dayOffset(-8) });

  const estimate = await seedClient();
  await seedInvoice(estimate, { status: 'estimate', dueDate: dayOffset(0) });

  const paid = await seedClient();
  await seedInvoice(paid, { status: 'paid', dueDate: dayOffset(-5), balance: 0 });

  const noDueDate = await seedClient();
  await seedInvoice(noDueDate);

  const result = await runJob('dunning');
  assert.equal(result.status, 200);

  const recipients = smsRecipients().map(digits);
  assert.equal(recipients.length, 4);
  assert.ok(recipients.includes(digits(beforeDue.phone)));
  assert.ok(recipients.includes(digits(dueToday.phone)));
  assert.ok(recipients.includes(digits(overdue3.phone)));
  assert.ok(recipients.includes(digits(overdue8.phone)));
  assert.ok(!recipients.includes(digits(estimate.phone)));
  assert.ok(!recipients.includes(digits(paid.phone)));
  assert.ok(!recipients.includes(digits(noDueDate.phone)));
  assert.equal(notify.emails().length, 4, 'email copies for each stage');

  notify.reset();
  await runJob('dunning');
  assert.equal(notify.requests.length, 0, 'rerun must not re-send');
});

test('loyalty accrues once per payment even under concurrent runs', async () => {
  notify.reset();
  const client = await seedClient();
  const invoice = await seedInvoice(client, { status: 'paid', dueDate: dayOffset(-1), balance: 0 });
  const payment = await seedPayment(client, invoice, { amount: 12000 });

  const results = await Promise.all(Array.from({ length: 5 }, () => runJob('loyalty')));
  for (const result of results) assert.equal(result.status, 200);

  const fresh = await store.findClient(client.id);
  assert.equal(fresh.loyalty.points_balance, 220, '100 starting points + 120 earned');
  assert.equal(fresh.loyalty.lifetime_points, 120);
  assert.equal(fresh.loyalty.tier, 'Bronze');

  const claims = await store.listClaims({ job: 'loyalty' });
  assert.equal(claims.filter((c) => c.entity_id === payment.id).length, 1);

  await runJob('loyalty');
  const again = await store.findClient(client.id);
  assert.equal(again.loyalty.points_balance, 220, 'no double credit');
});

test('review requests fire once, only for paid completed jobs', async () => {
  notify.reset();
  const paidClient = await seedClient();
  const paidInvoice = await seedInvoice(paidClient, { status: 'paid', dueDate: dayOffset(-2), balance: 0 });
  await seedOrder(paidClient, paidInvoice, { completedHoursAgo: 25 });

  const unpaidClient = await seedClient();
  const unpaidInvoice = await seedInvoice(unpaidClient, { dueDate: dayOffset(1) });
  await seedOrder(unpaidClient, unpaidInvoice, { completedHoursAgo: 25 });

  const recentClient = await seedClient();
  const recentInvoice = await seedInvoice(recentClient, { status: 'paid', dueDate: dayOffset(-1), balance: 0 });
  await seedOrder(recentClient, recentInvoice, { completedHoursAgo: 2 });

  const result = await runJob('review');
  assert.equal(result.status, 200);

  const recipients = smsRecipients().map(digits);
  assert.equal(recipients.length, 1);
  assert.equal(recipients[0], digits(paidClient.phone));

  notify.reset();
  await runJob('review');
  assert.equal(notify.requests.length, 0);
});

test('opted-out clients receive no messages at all', async () => {
  notify.reset();
  const client = await seedClient({ notifications_opt_out: true });
  await seedQuote(client, { hours: 25 });
  await seedInvoice(client, { dueDate: dayOffset(0) });
  const paidInvoice = await seedInvoice(client, { status: 'paid', dueDate: dayOffset(-2), balance: 0 });
  await seedOrder(client, paidInvoice, { completedHoursAgo: 30 });

  const result = await runJob('all');
  assert.equal(result.status, 200);
  assert.equal(notify.requests.length, 0);
});

test('dry runs claim stages without sending anything', async () => {
  notify.reset();
  process.env.AUTOMATION_DRY_RUN = 'true';
  try {
    const client = await seedClient();
    const quote = await seedQuote(client, { hours: 25 });

    const result = await runJob('quotes');
    assert.equal(result.status, 200);
    assert.equal(result.body.dry_run, true);
    assert.equal(notify.requests.length, 0);

    const claims = await store.listClaims({ job: 'quotes' });
    const claim = claims.find((c) => c.entity_id === quote.id && c.stage === 'q24');
    assert.ok(claim, 'dry run still claims the stage');
    assert.equal(claim.status, 'dry_run');

    notify.reset();
    await runJob('quotes');
    assert.equal(notify.requests.length, 0, 'dry-run claims also prevent duplicates');

    const payClient = await seedClient();
    const payInvoice = await seedInvoice(payClient, { status: 'paid', dueDate: dayOffset(-1), balance: 0 });
    const payment = await seedPayment(payClient, payInvoice, { amount: 12000 });
    const loyaltyRun = await runJob('loyalty');
    assert.equal(loyaltyRun.status, 200);
    assert.equal(loyaltyRun.body.dry_run_count, 1);
    assert.equal(notify.requests.length, 0);
    const unchanged = await store.findClient(payClient.id);
    assert.equal(unchanged.loyalty.points_balance, 100, 'dry run must not credit points');
    const dryClaim = (await store.listClaims({ job: 'loyalty' })).find((c) => c.entity_id === payment.id);
    assert.ok(dryClaim, 'loyalty dry run claims the payment');
    assert.equal(dryClaim.status, 'dry_run');
  } finally {
    process.env.AUTOMATION_DRY_RUN = '';
  }
});

test('the time budget stops a large backlog without failing the run', async () => {
  process.env.AUTOMATION_TIME_BUDGET_MS = '1';
  try {
    for (let i = 0; i < 30; i += 1) {
      const client = await seedClient();
      await seedQuote(client, { hours: 25 });
    }
    const result = await runJob('quotes');
    assert.equal(result.status, 200);
    assert.ok(result.body.skipped_for_time > 0);
  } finally {
    process.env.AUTOMATION_TIME_BUDGET_MS = '';
  }
});
