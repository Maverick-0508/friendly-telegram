// Local load test: keeps the site responsive while several automation runs race
// each other, and proves the claim ledger makes every stage exactly-once.
//
//   node scripts/load-test.mjs                # full run (20s, 32 clients)
//   node scripts/load-test.mjs --invariants-only --duration=8 --concurrency=8
//
// Everything is local and throwaway: production auth semantics, in-memory store
// (ALLOW_IN_MEMORY_FALLBACK), fake @load.invalid addresses and a mock Resend /
// Africa's Talking server. Nothing is written to disk or sent to a real number.
//
// Loyalty caveat: fixtures use one settled payment per client. Concurrent runs
// for two different payments of the same client could still last-write-wins
// (full-record upserts, no merge); that is a known limitation, not tested here.
import { performance } from 'node:perf_hooks';
import { resetRuntimeEnv } from '../tests/helpers/env.js';
import { startMockNotify } from '../tests/helpers/mock-notify.js';

function arg(name) {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : '';
}

const invariantsOnly = process.argv.includes('--invariants-only');
const durationMs = Number(arg('duration') ? Number(arg('duration')) * 1000 : process.env.LOAD_DURATION_MS || 20000);
const concurrency = Number(arg('concurrency') || process.env.LOAD_CONCURRENCY || 32);
const jobWorkers = Number(process.env.LOAD_JOBS || 6);
const jobIntervalMs = Number(process.env.LOAD_JOB_INTERVAL_MS || 500);
const p95Limit = Number(process.env.LOAD_P95_MS || 1500);
const p99Limit = Number(process.env.LOAD_P99_MS || 4000);

const CRON_SECRET = 'load-test-cron-secret';
const OWNER_EMAIL = 'owner@load.invalid';
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const now = Date.now();
const hoursAgo = (hours) => new Date(now - hours * HOUR_MS).toISOString();
const dayOffset = (days) => new Date(now + days * DAY_MS).toISOString().slice(0, 10);

// ---------- fixtures (sizes drive both seeding and expected counts) ----------
const QUOTE_FIXTURES = {
  fresh: 40, // 1h old: not eligible
  q24: 30, // 25h old: q24 only
  q72: 30, // 73h old: q24 + q72 + owner escalation
};
const DUNNING_PER_STAGE = 25;
const DUNNING_BUCKETS = [
  { delta: 3, stage: 't_minus_3' },
  { delta: 0, stage: 'due_today' },
  { delta: -3, stage: 'plus_3' },
  { delta: -8, stage: 'plus_7' },
];
const LOYALTY_PAYMENTS = 150;
const PAYMENT_AMOUNT = 12000;
const LOYALTY_POINTS = Math.floor(PAYMENT_AMOUNT / 100);
const REVIEW_ORDERS = 60;

const quoteClients = QUOTE_FIXTURES.fresh + QUOTE_FIXTURES.q24 + QUOTE_FIXTURES.q72;
const dunningClients = DUNNING_PER_STAGE * DUNNING_BUCKETS.length;
const clientCount = quoteClients + dunningClients + LOYALTY_PAYMENTS + REVIEW_ORDERS;

// ---------- environment (must be set before app.js is imported) ----------
resetRuntimeEnv({
  NODE_ENV: 'production',
  ALLOW_IN_MEMORY_FALLBACK: 'true',
  ENFORCE_HTTPS: 'false',
  BOOKING_MODE: 'confirm',
  ADMIN_API_TOKEN: CRON_SECRET,
  CRON_SECRET,
  RESEND_API_KEY: 'load-resend-key',
  NOTIFY_FROM_EMAIL: 'noreply@load.invalid',
  OWNER_EMAIL,
  AFRICAS_TALKING_USERNAME: 'load-at',
  AFRICAS_TALKING_API_KEY: 'load-at-key',
  PUBLIC_SITE_URL: 'https://lawncraft.test',
  REVIEW_URL: 'https://lawncraft.test/reviews',
  RATE_LIMIT_MAX: '1000000',
  WRITE_RATE_LIMIT_MAX: '1000000',
  ANALYTICS_RATE_LIMIT_MAX: '1000000',
  AUTH_RATE_LIMIT_MAX: '1000000',
});

const notify = await startMockNotify();
process.env.RESEND_BASE_URL = notify.baseUrl;
process.env.AFRICAS_TALKING_BASE_URL = notify.baseUrl;

const { createApp } = await import('../app.js');
const { store } = await import('../node-backend/services/store.js');

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok: Boolean(ok), detail });
}

// ---------- seed ----------
function clientFixture(index) {
  return {
    id: `cl_load_${index}`,
    name: `Load Client ${index}`,
    phone: `0770${String(index).padStart(6, '0')}`,
    email: `client${index}@load.invalid`,
    address: 'Load Test Lane',
    loyalty: {
      points_balance: 100,
      tier: 'Bronze',
      rate_per_point: 50,
      dollar_value: 5000,
      cash_value: 5000,
      referral_code: `LOAD-${index}`,
      next_tier: 'Silver',
      points_to_next_tier: 150,
    },
  };
}

async function seed() {
  const clients = [];
  for (let i = 1; i <= clientCount; i += 1) {
    const client = clientFixture(i);
    clients.push(client);
    await store.upsertClient(client);
  }

  let cursor = 0;
  const nextClients = (count) => clients.slice(cursor, (cursor += count));

  const quoteGroups = [
    { clients: nextClients(QUOTE_FIXTURES.fresh), hours: 1 },
    { clients: nextClients(QUOTE_FIXTURES.q24), hours: 25 },
    { clients: nextClients(QUOTE_FIXTURES.q72), hours: 73 },
  ];
  let quoteIndex = 0;
  for (const group of quoteGroups) {
    for (const client of group.clients) {
      quoteIndex += 1;
      await store.upsertQuote({
        id: `qt_load_${quoteIndex}`,
        quote_number: `QT-LOAD-${quoteIndex}`,
        client_id: client.id,
        client_name: client.name,
        phone: client.phone,
        email: client.email,
        title: 'Lawn Mowing',
        service_type: 'Lawn Mowing',
        status: 'pending_review',
        total_amount: 4500,
        created_at: hoursAgo(group.hours),
      });
    }
  }

  let invoiceIndex = 0;
  for (const bucket of DUNNING_BUCKETS) {
    for (const client of nextClients(DUNNING_PER_STAGE)) {
      invoiceIndex += 1;
      await store.upsertInvoice({
        id: `inv_load_dun_${invoiceIndex}`,
        invoice_number: `INV-LOAD-DUN-${invoiceIndex}`,
        client_id: client.id,
        client_name: client.name,
        client_phone: client.phone,
        client_email: client.email,
        status: 'unpaid',
        balance_due: 6000,
        total_amount: 6000,
        issue_date: dayOffset(bucket.delta - 7),
        due_date: dayOffset(bucket.delta),
        created_at: hoursAgo(48),
      });
    }
  }

  const paymentClients = nextClients(LOYALTY_PAYMENTS);
  let paymentIndex = 0;
  for (const client of paymentClients) {
    paymentIndex += 1;
    await store.upsertInvoice({
      id: `inv_load_pay_${paymentIndex}`,
      invoice_number: `INV-LOAD-PAY-${paymentIndex}`,
      client_id: client.id,
      client_name: client.name,
      client_phone: client.phone,
      client_email: client.email,
      status: 'paid',
      balance_due: 0,
      total_amount: PAYMENT_AMOUNT,
      created_at: hoursAgo(90),
    });
    await store.upsertPayment({
      id: `pay_load_${paymentIndex}`,
      invoice_id: `inv_load_pay_${paymentIndex}`,
      client_id: client.id,
      phone: client.phone,
      email: client.email,
      amount: PAYMENT_AMOUNT,
      amount_paid: PAYMENT_AMOUNT,
      status: 'success',
      created_at: hoursAgo(2),
    });
  }

  let reviewIndex = 0;
  for (const client of nextClients(REVIEW_ORDERS)) {
    reviewIndex += 1;
    await store.upsertInvoice({
      id: `inv_load_rev_${reviewIndex}`,
      invoice_number: `INV-LOAD-REV-${reviewIndex}`,
      client_id: client.id,
      client_name: client.name,
      client_phone: client.phone,
      client_email: client.email,
      status: 'paid',
      balance_due: 0,
      total_amount: 8500,
      created_at: hoursAgo(90),
    });
    await store.upsertWorkOrder({
      id: `wo_load_${reviewIndex}`,
      client_id: client.id,
      client_name: client.name,
      client_phone: client.phone,
      client_email: client.email,
      service_type: 'Lawn Mowing',
      status: 'completed',
      invoice_id: `inv_load_rev_${reviewIndex}`,
      completed_at: hoursAgo(25),
      created_at: hoursAgo(27),
    });
  }

  return { clients, paymentClients };
}

// ---------- expected exactly-once numbers ----------
const expectedClaims = {
  'quotes/q24': QUOTE_FIXTURES.q24 + QUOTE_FIXTURES.q72,
  'quotes/q72': QUOTE_FIXTURES.q72,
  'quotes/q72_owner': QUOTE_FIXTURES.q72,
  'review/review_request': REVIEW_ORDERS,
  'loyalty/earn': LOYALTY_PAYMENTS,
};
for (const bucket of DUNNING_BUCKETS) {
  expectedClaims[`dunning/${bucket.stage}`] = DUNNING_PER_STAGE;
  expectedClaims[`dunning/${bucket.stage}_email`] = DUNNING_PER_STAGE;
}
const expectedAutomationSms =
  QUOTE_FIXTURES.q24 + QUOTE_FIXTURES.q72 * 2 + DUNNING_PER_STAGE * DUNNING_BUCKETS.length + REVIEW_ORDERS;
const expectedAutomationEmails =
  QUOTE_FIXTURES.q72 + DUNNING_PER_STAGE * DUNNING_BUCKETS.length;

// ---------- traffic ----------
const SCENARIOS = [
  { method: 'GET', path: '/' },
  { method: 'GET', path: '/services' },
  { method: 'GET', path: '/calculator' },
  { method: 'GET', path: '/styles.css' },
  { method: 'GET', path: '/api/health' },
  { method: 'POST', path: '/api/quotes' },
  { method: 'POST', path: '/api/contact' },
  { method: 'POST', path: '/api/work-orders' },
  { method: 'POST', path: '/api/coupons/validate', body: { code: 'FIRSTCUT', amount: 10000 } },
  { method: 'POST', path: '/api/portal/lookup', body: { identifier: 'nobody@load.invalid' } },
];

const stats = [];
const jobStats = [];
let inFlightJobs = 0;
let trafficSeq = 0;

function trafficBody(pathname, seq) {
  if (pathname === '/api/quotes') {
    return { full_name: `Load Visitor ${seq}`, email: `visitor${seq}@load.invalid`, phone: `0771${String(seq).padStart(6, '0')}`, service_type: 'Lawn Mowing' };
  }
  if (pathname === '/api/contact') {
    return { name: `Load Visitor ${seq}`, email: `visitor${seq}@load.invalid`, phone: `0771${String(seq).padStart(6, '0')}`, message: 'Load test message' };
  }
  if (pathname === '/api/work-orders') {
    return { client_name: `Load Visitor ${seq}`, phone: `0771${String(seq).padStart(6, '0')}`, email: `visitor${seq}@load.invalid`, service_type: 'Lawn Mowing', property_size: 6000, grass: 'buffalo' };
  }
  return null;
}

async function trafficWorker(baseUrl, deadline) {
  while (Date.now() < deadline) {
    const scenario = SCENARIOS[trafficSeq++ % SCENARIOS.length];
    const body = scenario.body || trafficBody(scenario.path, trafficSeq);
    const duringJob = inFlightJobs > 0;
    const started = performance.now();
    let status = 0;
    try {
      const response = await fetch(`${baseUrl}${scenario.path}`, {
        method: scenario.method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      status = response.status;
      await response.arrayBuffer();
    } catch {
      status = 0;
    }
    stats.push({ path: scenario.path, status, ms: performance.now() - started, duringJob });
  }
}

async function automationWorker(baseUrl, deadline) {
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, jobIntervalMs));
    if (Date.now() >= deadline) break;
    const batch = Array.from({ length: jobWorkers }, async () => {
      inFlightJobs += 1;
      const started = performance.now();
      let status = 0;
      try {
        const response = await fetch(`${baseUrl}/api/automations/run?job=all`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${CRON_SECRET}` },
        });
        status = response.status;
        await response.json().catch(() => ({}));
      } catch {
        status = 0;
      } finally {
        inFlightJobs -= 1;
      }
      jobStats.push({ status, ms: performance.now() - started });
    });
    await Promise.all(batch);
  }
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

function summarize(list) {
  const durations = list.map((item) => item.ms).sort((a, b) => a - b);
  return {
    count: list.length,
    p50: percentile(durations, 50),
    p95: percentile(durations, 95),
    p99: percentile(durations, 99),
  };
}

function fmt(value) {
  return `${value.toFixed(1)}ms`;
}

function smsMessage(request) {
  try {
    return new URLSearchParams(request.body).get('message') || '';
  } catch {
    return '';
  }
}

function emailPayload(request) {
  try {
    return JSON.parse(request.body || '{}');
  } catch {
    return {};
  }
}

// ---------- run ----------
check('store backend is memory (no disk writes in production mode)', store.backendName() === 'memory', store.backendName());
if (store.backendName() !== 'memory') {
  console.error(`Refusing to load-test against the ${store.backendName()} backend.`);
  await notify.close();
  process.exit(1);
}

const seeded = await seed();
const paymentClients = seeded.paymentClients;
check('seed fixtures created', seeded.clients.length === clientCount, `${seeded.clients.length} clients`);

const app = createApp();
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;

const deadline = Date.now() + durationMs;
const startedAt = Date.now();
await Promise.all([
  ...Array.from({ length: concurrency }, () => trafficWorker(baseUrl, deadline)),
  automationWorker(baseUrl, deadline),
]);
const elapsedMs = Date.now() - startedAt;

// One last clean run: all eligible work was claimed during the race, so this
// must add nothing at all.
const finalRun = await fetch(`${baseUrl}/api/automations/run?job=all`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${CRON_SECRET}` },
});
const finalBody = await finalRun.json().catch(() => ({}));

// ---------- invariants ----------
const serverErrors = stats.filter((item) => item.status >= 500);
check('zero 5xx under mixed traffic', serverErrors.length === 0,
  serverErrors.slice(0, 5).map((item) => `${item.path}=${item.status}`).join(', '));
const networkErrors = stats.filter((item) => item.status === 0);
check('zero network failures', networkErrors.length === 0, `${networkErrors.length} failed requests`);

const failedJobs = jobStats.filter((item) => item.status !== 200);
check('every automation call returned 200', failedJobs.length === 0,
  failedJobs.slice(0, 5).map((item) => `HTTP ${item.status}`).join(', '));
check('final automation rerun returned 200', finalRun.status === 200, `HTTP ${finalRun.status}`);
check('final automation rerun claims and sends nothing', finalBody.claimed === 0 && finalBody.sent === 0,
  `claimed=${finalBody.claimed} sent=${finalBody.sent}`);

const claims = await store.listClaims({ limit: 5000 });
const claimKeys = new Set(claims.map((c) => `${c.job}|${c.entity_id}|${c.stage}`));
check('claim ledger has no duplicate (job, entity, stage)', claimKeys.size === claims.length,
  `${claims.length} rows, ${claimKeys.size} keys`);

const claimCounts = {};
for (const claim of claims) {
  const key = `${claim.job}/${claim.stage}`;
  claimCounts[key] = (claimCounts[key] || 0) + 1;
}
const claimMismatches = Object.entries(expectedClaims)
  .filter(([key, expected]) => (claimCounts[key] || 0) !== expected)
  .map(([key, expected]) => `${key}=${claimCounts[key] || 0}/${expected}`);
const unexpectedClaimKeys = Object.keys(claimCounts).filter((key) => !(key in expectedClaims));
check('exactly-once claims match every eligible fixture', claimMismatches.length === 0 && unexpectedClaimKeys.length === 0,
  [...claimMismatches, ...unexpectedClaimKeys.map((key) => `${key}=unexpected`)].join(', '));

const sms = notify.sms().map(smsMessage);
const emails = notify.emails().map(emailPayload);
const quoteSms = sms.filter((message) => /quote is KSh/.test(message)).length;
const dunningSms = sms.filter((message) => /Pay securely with M-Pesa/.test(message)).length;
const reviewSms = sms.filter((message) => /Leave a review:/.test(message)).length;
const ownerEscalations = emails.filter((mail) => /^Quote not converted:/.test(mail.subject || '')).length;
const dunningEmails = emails.filter((mail) => /^Invoice .* for KSh/.test(mail.subject || '')).length;

check('quote follow-up SMS counts are exact',
  quoteSms === QUOTE_FIXTURES.q24 + QUOTE_FIXTURES.q72 * 2,
  `${quoteSms}/${QUOTE_FIXTURES.q24 + QUOTE_FIXTURES.q72 * 2}`);
check('dunning SMS counts are exact', dunningSms === DUNNING_PER_STAGE * DUNNING_BUCKETS.length,
  `${dunningSms}/${DUNNING_PER_STAGE * DUNNING_BUCKETS.length}`);
check('review SMS counts are exact', reviewSms === REVIEW_ORDERS, `${reviewSms}/${REVIEW_ORDERS}`);
check('owner escalation emails are exact', ownerEscalations === QUOTE_FIXTURES.q72,
  `${ownerEscalations}/${QUOTE_FIXTURES.q72}`);
check('dunning email copies are exact', dunningEmails === DUNNING_PER_STAGE * DUNNING_BUCKETS.length,
  `${dunningEmails}/${DUNNING_PER_STAGE * DUNNING_BUCKETS.length}`);
check('total automation messages match claims minus loyalty',
  quoteSms + dunningSms + reviewSms + ownerEscalations + dunningEmails === expectedAutomationSms + expectedAutomationEmails,
  `${quoteSms + dunningSms + reviewSms + ownerEscalations + dunningEmails}/${expectedAutomationSms + expectedAutomationEmails}`);

let credited = 0;
let wrongBalance = null;
for (const client of paymentClients) {
  const fresh = await store.findClient(client.id);
  const expected = 100 + LOYALTY_POINTS;
  if (fresh?.loyalty?.points_balance === expected) credited += 1;
  else wrongBalance = `${client.id}=${fresh?.loyalty?.points_balance}`;
}
check('every settled payment credited loyalty exactly once',
  credited === paymentClients.length,
  wrongBalance ? `first mismatch ${wrongBalance}` : `${credited}/${paymentClients.length}`);

const untouched = await store.findClient(`cl_load_1`);
check('clients without payments keep their balance', untouched?.loyalty?.points_balance === 100,
  `points=${untouched?.loyalty?.points_balance}`);

// ---------- report ----------
const trafficSummary = summarize(stats);
const duringJob = summarize(stats.filter((item) => item.duringJob));
const idle = summarize(stats.filter((item) => !item.duringJob));
const jobSummary = summarize(jobStats);
const statusHistogram = {};
for (const item of stats) statusHistogram[item.status] = (statusHistogram[item.status] || 0) + 1;

console.log(`\nTraffic: ${stats.length} requests in ${(elapsedMs / 1000).toFixed(1)}s ` +
  `(${(stats.length / (elapsedMs / 1000)).toFixed(1)} rps, ${concurrency} concurrent)`);
console.log(`Statuses: ${Object.entries(statusHistogram).sort((a, b) => a[0] - b[0]).map(([s, n]) => `${s}:${n}`).join('  ')}`);
console.log(`Latency all traffic:  p50 ${fmt(trafficSummary.p50)}  p95 ${fmt(trafficSummary.p95)}  p99 ${fmt(trafficSummary.p99)}`);
console.log(`  during automation:  n=${duringJob.count}  p50 ${fmt(duringJob.p50)}  p95 ${fmt(duringJob.p95)}  p99 ${fmt(duringJob.p99)}`);
console.log(`  idle (no job):      n=${idle.count}  p50 ${fmt(idle.p50)}  p95 ${fmt(idle.p95)}  p99 ${fmt(idle.p99)}`);
console.log(`Automation runs: ${jobStats.length}  p50 ${fmt(jobSummary.p50)}  p95 ${fmt(jobSummary.p95)}  p99 ${fmt(jobSummary.p99)}`);
console.log(`Claims: ${claims.length}  Messages: ${sms.length} SMS (${quoteSms} quote, ${dunningSms} dunning, ${reviewSms} review)  ` +
  `${emails.length} email (${ownerEscalations} escalation, ${dunningEmails} dunning)`);

if (!invariantsOnly) {
  check(`traffic p95 under ${p95Limit}ms`, trafficSummary.p95 < p95Limit, fmt(trafficSummary.p95));
  check(`traffic p99 under ${p99Limit}ms`, trafficSummary.p99 < p99Limit, fmt(trafficSummary.p99));
  check(`p95 during automation burst under ${p95Limit}ms`, duringJob.p95 < p95Limit, fmt(duringJob.p95));
}

for (const item of checks) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'}  ${item.name}${item.detail ? `  [${item.detail}]` : ''}`);
}
const passed = checks.filter((item) => item.ok).length;
console.log(`\n${passed}/${checks.length} checks passed`);

await new Promise((resolve) => server.close(resolve));
await notify.close();
process.exitCode = passed === checks.length ? 0 : 1;
