// Scheduled business automations: quote follow-ups, invoice dunning, loyalty
// accrual and post-job review requests.
//
// Every stage is claimed in the automation_claims ledger BEFORE a message is
// sent. The unique (job, entity_id, stage) index means overlapping cron runs
// (Vercel, GitHub Actions, local timer) can race freely: exactly one run wins
// the claim, the others skip. A crash after claiming is at-most-once, never a
// duplicate send.

import { store } from './store.js';
import {
  sendEmail,
  sendSms,
  isEmailConfigured,
  isSmsConfigured,
  ownerEmail,
} from './notify.js';

const VALID_JOBS = new Set(['all', 'quotes', 'dunning', 'loyalty', 'review']);
const PAYABLE_STATUSES = ['unpaid', 'partially_paid'];
const TIERS = [
  { min: 0, tier: 'Bronze' },
  { min: 250, tier: 'Silver' },
  { min: 750, tier: 'Gold' },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function env(name) {
  const value = process.env[name];
  return value === undefined || value === null ? '' : String(value).trim();
}

function num(name, fallback) {
  const raw = env(name);
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function isDryRun() {
  return env('AUTOMATION_DRY_RUN').toLowerCase() === 'true';
}

function siteBase() {
  return (env('PUBLIC_SITE_URL') || 'https://lawncraft.vercel.app').replace(/\/+$/, '');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function firstName(name) {
  return String(name || 'there').trim().split(/\s+/)[0] || 'there';
}

function utcDay(now) {
  return now.toISOString().slice(0, 10);
}

function addDaysDay(date, days) {
  return new Date(date.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

// Negative = invoice is still in the future; positive = overdue.
function dayDelta(dueDay, todayDay) {
  return Math.round(
    (Date.parse(`${dueDay}T00:00:00Z`) - Date.parse(`${todayDay}T00:00:00Z`)) / DAY_MS
  );
}

function config() {
  const batchLimit = num('AUTOMATION_BATCH_LIMIT', 200);
  return {
    batchLimit,
    // Scan further than we send so stages claimed by an earlier run do not
    // hide the rest of a backlog behind the batch window.
    scanLimit: Math.min(Math.max(1, batchLimit) * 5, 2000),
    budgetMs: num('AUTOMATION_TIME_BUDGET_MS', 25000),
    quoteFollowup1H: num('QUOTE_FOLLOWUP_1_HOURS', 24),
    quoteFollowup2H: num('QUOTE_FOLLOWUP_2_HOURS', 72),
    quoteMaxAgeDays: num('QUOTE_MAX_AGE_DAYS', 30),
    daysBeforeDue: num('DUNNING_DAYS_BEFORE_DUE', 3),
    plus3Days: num('DUNNING_PLUS_3_DAYS', 3),
    plus7Days: num('DUNNING_PLUS_7_DAYS', 7),
    kshPerPoint: Math.max(1, num('LOYALTY_KSH_PER_POINT', 100)),
    reviewDelayHours: num('REVIEW_DELAY_HOURS', 24),
    reviewUrl: env('REVIEW_URL') || `${siteBase()}/#testimonials`,
  };
}

function newJobSummary() {
  return { checked: 0, claimed: 0, sent: 0, skipped: 0, errors: 0, skipped_for_time: 0, dry_run_count: 0 };
}

function overBudget(startedAt, budgetMs) {
  return Date.now() - startedAt > budgetMs;
}

function providerRef(out) {
  if (!out) return null;
  return out.id || (out.SMSMessageData ? 'ok' : null);
}

/**
 * Claim then send. Returns one of:
 * skipped_opt_out | skipped_unconfigured | skipped_no_recipient |
 * already_claimed | dry_run | sent | failed
 */
async function emit({
  job,
  entityId,
  stage,
  channel,
  client,
  to,
  subject,
  html,
  text,
  message,
  summary,
  dryRun,
  payload = {},
}) {
  if (client && client.notifications_opt_out === true) {
    summary.skipped += 1;
    return 'skipped_opt_out';
  }
  if (!to) {
    summary.skipped += 1;
    return 'skipped_no_recipient';
  }
  const configured = channel === 'email' ? isEmailConfigured() : isSmsConfigured();
  if (!configured && !dryRun) {
    summary.skipped += 1;
    return 'skipped_unconfigured';
  }

  const { claimed, claim } = await store.claimStage({
    job,
    entityId,
    stage,
    channel,
    dryRun,
    payload,
  });
  if (!claimed) {
    summary.skipped += 1;
    return 'already_claimed';
  }
  summary.claimed += 1;

  if (dryRun) {
    console.log(`[automations:dry-run] ${job}/${stage} -> ${channel}:${to}${subject ? ` "${subject}"` : ''}`);
    await store.completeClaim(claim.id, { status: 'dry_run' });
    summary.dry_run_count += 1;
    return 'dry_run';
  }

  const out = channel === 'email'
    ? await sendEmail({ to, subject, html, text })
    : await sendSms({ to, message });
  const ok = Boolean(out);
  await store.completeClaim(claim.id, { status: ok ? 'sent' : 'failed', providerRef: providerRef(out) });
  if (ok) summary.sent += 1;
  else summary.errors += 1;
  return ok ? 'sent' : 'failed';
}

// ---------------- Quotes ----------------

async function isQuoteConverted(quote, client) {
  if (!client) return false;
  const quoteAt = Date.parse(quote.created_at || 0);
  if (!Number.isFinite(quoteAt)) return false;
  const match = { id: client.id, phone: client.phone, email: client.email };

  const orders = await store.workOrdersByClient(match);
  if (orders.some((o) => Date.parse(o.created_at || 0) > quoteAt)) return true;

  const invoices = await store.invoicesByClient(match);
  return invoices.some(
    (inv) => Date.parse(inv.created_at || 0) > quoteAt && inv.status !== 'estimate'
  );
}

function quoteSms(quote, stageNumber) {
  const amount = Math.round(Number(quote.total_amount) || 0);
  const ref = quote.quote_number || quote.id;
  const tail = stageNumber === 1
    ? 'Reply here or call to book and we will schedule your visit.'
    : 'Still interested? Book this week and we will honour this quote.';
  return `Lawn Craft: Hi ${firstName(quote.client_name)}, your ${quote.service_type || 'lawn care'} quote is KSh ${amount}. ${tail} (Ref ${ref}) ${siteBase()}/contact`;
}

function quoteEmail(quote, stageNumber) {
  return {
    subject: `Your Lawn Craft quote ${quote.quote_number || ''} is ready`,
    html: `
      <h2>Your lawn care quote is ready</h2>
      <p>Hi ${escapeHtml(firstName(quote.client_name))},</p>
      <p>We prepared a <strong>${escapeHtml(quote.service_type || 'lawn care')}</strong> quote for
      <strong>KSh ${Math.round(Number(quote.total_amount) || 0)}</strong>
      (ref ${escapeHtml(quote.quote_number || quote.id)}).</p>
      <p>${stageNumber === 1
        ? 'Reply to this email or book online and we will schedule your visit.'
        : 'Still interested? Book this week and we will honour this quote.'}</p>
      <p><a href="${siteBase()}/contact">Book now</a></p>
    `,
  };
}

async function runQuotes({ now, cfg, summary, startedAt }) {
  const cutoff = new Date(now.getTime() - cfg.quoteMaxAgeDays * DAY_MS).toISOString();
  const quotes = await store.listQuotesPendingReviewSince(cutoff, cfg.scanLimit);
  const dryRun = isDryRun();

  for (const quote of quotes) {
    if (overBudget(startedAt, cfg.budgetMs)) {
      summary.skipped_for_time += 1;
      break;
    }
    if (summary.claimed >= cfg.batchLimit) break;
    summary.checked += 1;
    try {
      if (!quote || quote.status !== 'pending_review') {
        summary.skipped += 1;
        continue;
      }
      const ageHours = (now.getTime() - Date.parse(quote.created_at || 0)) / HOUR_MS;
      if (!Number.isFinite(ageHours)) {
        summary.skipped += 1;
        continue;
      }

      const stages = [];
      if (ageHours >= cfg.quoteFollowup1H) stages.push({ stage: 'q24', n: 1 });
      if (ageHours >= cfg.quoteFollowup2H) stages.push({ stage: 'q72', n: 2 });
      if (!stages.length) continue;

      const client = quote.client_id
        ? await store.findClient(quote.client_id)
        : await store.findClientByPhoneOrEmail(quote.phone, quote.email);
      if (await isQuoteConverted(quote, client)) {
        summary.skipped += 1;
        continue;
      }

      for (const item of stages) {
        const payload = { quote_number: quote.quote_number || quote.id, amount: quote.total_amount };
        if (quote.phone) {
          await emit({
            job: 'quotes',
            entityId: quote.id,
            stage: item.stage,
            channel: 'sms',
            client,
            to: quote.phone,
            message: quoteSms(quote, item.n),
            summary,
            dryRun,
            payload,
          });
        } else if (quote.email) {
          const mail = quoteEmail(quote, item.n);
          await emit({
            job: 'quotes',
            entityId: quote.id,
            stage: `${item.stage}_email`,
            channel: 'email',
            client,
            to: quote.email,
            subject: mail.subject,
            html: mail.html,
            summary,
            dryRun,
            payload,
          });
        } else {
          summary.skipped += 1;
          continue;
        }

        if (item.stage === 'q72') {
          const owner = ownerEmail();
          if (owner && isEmailConfigured()) {
            await emit({
              job: 'quotes',
              entityId: quote.id,
              stage: 'q72_owner',
              channel: 'email',
              client: null,
              to: owner,
              subject: `Quote not converted: ${quote.quote_number || quote.id}`,
              html: `<h2>Quote still unconverted</h2>
                <p><strong>${escapeHtml(quote.client_name)}</strong> (${escapeHtml(quote.phone || quote.email)})
                has not booked 72h after quote ${escapeHtml(quote.quote_number || quote.id)}
                (KSh ${Math.round(Number(quote.total_amount) || 0)}).</p>
                <p><a href="${siteBase()}/admin">Open the supervisor dashboard</a></p>`,
              summary,
              dryRun,
              payload,
            });
          }
        }
      }
    } catch (err) {
      summary.errors += 1;
      console.error(`[automations:quotes] ${quote?.id}:`, err.message);
    }
  }
}

// ---------------- Dunning ----------------

// Positive delta = due in the future, negative = overdue.
function dunningStage(delta, cfg) {
  if (delta === cfg.daysBeforeDue) return 't_minus_3';
  if (delta === 0) return 'due_today';
  if (delta === -cfg.plus3Days) return 'plus_3';
  // Weekly/delayed runs: any invoice at least this overdue still gets one nudge.
  if (delta <= -cfg.plus7Days) return 'plus_7';
  return null;
}

function dunningSms(invoice, todayDay) {
  const balance = Math.round(Number(invoice.balance_due ?? invoice.total_amount) || 0);
  const due = invoice.due_date;
  const when = todayDay < due ? `is due on ${due}` : `was due on ${due}`;
  return `Lawn Craft: Invoice ${invoice.invoice_number || invoice.id} for KSh ${balance} ${when}. Pay securely with M-Pesa: ${siteBase()}/pay/${invoice.id}`;
}

function dunningEmail(invoice, todayDay) {
  const balance = Math.round(Number(invoice.balance_due ?? invoice.total_amount) || 0);
  const when = todayDay < invoice.due_date ? `is due on ${invoice.due_date}` : `was due on ${invoice.due_date}`;
  return {
    subject: `Invoice ${invoice.invoice_number || invoice.id} for KSh ${balance}`,
    html: `<h2>Payment reminder</h2>
      <p>Hi ${escapeHtml(firstName(invoice.client_name))},</p>
      <p>Invoice <strong>${escapeHtml(invoice.invoice_number || invoice.id)}</strong> for
      <strong>KSh ${balance}</strong> ${escapeHtml(when)}.</p>
      <p><a href="${siteBase()}/pay/${encodeURIComponent(invoice.id)}">Pay securely with M-Pesa</a></p>`,
  };
}

async function runDunning({ now, cfg, summary, startedAt }) {
  const todayDay = utcDay(now);
  // Include invoices due in the next few days (T-3 reminder) plus all overdue.
  const horizon = addDaysDay(now, cfg.daysBeforeDue);
  const invoices = await store.listInvoicesDueOnOrBefore(horizon, {
    statuses: PAYABLE_STATUSES,
    limit: cfg.scanLimit,
  });
  const dryRun = isDryRun();

  for (const listed of invoices) {
    if (overBudget(startedAt, cfg.budgetMs)) {
      summary.skipped_for_time += 1;
      break;
    }
    if (summary.claimed >= cfg.batchLimit) break;
    summary.checked += 1;
    try {
      if (!listed || !PAYABLE_STATUSES.includes(listed.status) || !listed.due_date) {
        summary.skipped += 1;
        continue;
      }
      const stage = dunningStage(dayDelta(listed.due_date, todayDay), cfg);
      if (!stage) continue;

      // Re-read right before sending: a payment may have settled since the list.
      const invoice = await store.invoiceById(listed.id);
      const balance = Number(invoice?.balance_due ?? invoice?.total_amount) || 0;
      if (!invoice || !PAYABLE_STATUSES.includes(invoice.status) || balance <= 0) {
        summary.skipped += 1;
        continue;
      }

      const client = invoice.client_id
        ? await store.findClient(invoice.client_id)
        : await store.findClientByPhoneOrEmail(invoice.client_phone, invoice.client_email);
      const payload = { balance, due_date: invoice.due_date, stage };

      if (invoice.client_phone) {
        await emit({
          job: 'dunning',
          entityId: invoice.id,
          stage,
          channel: 'sms',
          client,
          to: invoice.client_phone,
          message: dunningSms(invoice, todayDay),
          summary,
          dryRun,
          payload,
        });
      }
      if (invoice.client_email && isEmailConfigured()) {
        const mail = dunningEmail(invoice, todayDay);
        await emit({
          job: 'dunning',
          entityId: invoice.id,
          stage: `${stage}_email`,
          channel: 'email',
          client,
          to: invoice.client_email,
          subject: mail.subject,
          html: mail.html,
          summary,
          dryRun,
          payload,
        });
      }
      if (!invoice.client_phone && !invoice.client_email) {
        summary.skipped += 1;
      }
    } catch (err) {
      summary.errors += 1;
      console.error(`[automations:dunning] ${listed?.id}:`, err.message);
    }
  }
}

// ---------------- Loyalty ----------------

function recomputeLoyalty(loyalty, earnedPoints, now) {
  const points = Number(loyalty.points_balance) || 0;
  let current = TIERS[0];
  let next = null;
  for (let i = 0; i < TIERS.length; i += 1) {
    if (points >= TIERS[i].min) {
      current = TIERS[i];
      next = TIERS[i + 1] || null;
    }
  }
  const rate = 50;
  return {
    ...loyalty,
    points_balance: points,
    tier: current.tier,
    rate_per_point: rate,
    dollar_value: points * rate,
    cash_value: points * rate,
    next_tier: next ? next.tier : null,
    points_to_next_tier: next ? Math.max(0, next.min - points) : 0,
    last_earned_points: earnedPoints,
    last_earned_at: now.toISOString(),
    lifetime_points: (Number(loyalty.lifetime_points) || 0) + earnedPoints,
  };
}

async function runLoyalty({ now, cfg, summary, startedAt }) {
  const payments = await store.listSettledPayments({
    statuses: ['success', 'completed'],
    limit: cfg.scanLimit,
  });

  for (const payment of payments) {
    if (overBudget(startedAt, cfg.budgetMs)) {
      summary.skipped_for_time += 1;
      break;
    }
    if (summary.claimed >= cfg.batchLimit) break;
    summary.checked += 1;
    try {
      const amountPaid = Number(payment?.amount_paid ?? payment?.amount) || 0;
      if (!payment || !payment.invoice_id || amountPaid <= 0) {
        summary.skipped += 1;
        continue;
      }

      // The claim is the loyalty ledger: one award per payment, forever.
      const { claimed, claim } = await store.claimStage({
        job: 'loyalty',
        entityId: payment.id,
        stage: 'earn',
        channel: 'ledger',
        dryRun: isDryRun(),
        payload: { amount: amountPaid, invoice_id: payment.invoice_id },
      });
      if (!claimed) {
        summary.skipped += 1;
        continue;
      }
      summary.claimed += 1;

      const points = Math.floor(amountPaid / cfg.kshPerPoint);
      if (points <= 0) {
        await store.completeClaim(claim.id, { status: 'skipped' });
        summary.skipped += 1;
        continue;
      }

      if (isDryRun()) {
        console.log(`[automations:dry-run] loyalty/earn ${payment.id} -> +${points} points`);
        await store.completeClaim(claim.id, { status: 'dry_run' });
        summary.dry_run_count += 1;
        continue;
      }

      const match = payment.client_id
        ? await store.findClient(payment.client_id)
        : await store.findClientByPhoneOrEmail(payment.phone, payment.email);
      if (!match) {
        await store.completeClaim(claim.id, { status: 'skipped' });
        summary.errors += 1;
        console.error(`[automations:loyalty] No client for payment ${payment.id}`);
        continue;
      }

      // Freshest available read, then one whole-record write.
      const client = (await store.findClient(match.id)) || match;
      const loyalty = client.loyalty && typeof client.loyalty === 'object' ? client.loyalty : {};
      const balance = (Number(loyalty.points_balance) || 0) + points;
      client.loyalty = recomputeLoyalty({ ...loyalty, points_balance: balance }, points, now);
      await store.upsertClient(client);
      await store.completeClaim(claim.id, { status: 'applied' });
      summary.sent += 1;
    } catch (err) {
      summary.errors += 1;
      console.error(`[automations:loyalty] ${payment?.id}:`, err.message);
    }
  }
}

// ---------------- Review requests ----------------

function reviewSms(order, cfg) {
  return `Lawn Craft: Thanks for choosing us for "${order.service_type || 'lawn care'}"! How did we do? Leave a review: ${cfg.reviewUrl}`;
}

async function runReviews({ now, cfg, summary, startedAt }) {
  const cutoff = new Date(now.getTime() - cfg.reviewDelayHours * HOUR_MS).toISOString();
  const orders = await store.listWorkOrdersCompletedBefore(cutoff, cfg.scanLimit);
  const dryRun = isDryRun();

  for (const order of orders) {
    if (overBudget(startedAt, cfg.budgetMs)) {
      summary.skipped_for_time += 1;
      break;
    }
    if (summary.claimed >= cfg.batchLimit) break;
    summary.checked += 1;
    try {
      if (!order || order.status !== 'completed' || !order.client_phone) {
        summary.skipped += 1;
        continue;
      }
      const invoice = order.invoice_id ? await store.invoiceById(order.invoice_id) : null;
      if (!invoice || invoice.status !== 'paid') {
        summary.skipped += 1;
        continue;
      }
      const client = order.client_id
        ? await store.findClient(order.client_id)
        : await store.findClientByPhoneOrEmail(order.client_phone, order.client_email);

      await emit({
        job: 'review',
        entityId: order.id,
        stage: 'review_request',
        channel: 'sms',
        client,
        to: order.client_phone,
        message: reviewSms(order, cfg),
        summary,
        dryRun,
        payload: { service_type: order.service_type, completed_at: order.completed_at },
      });
    } catch (err) {
      summary.errors += 1;
      console.error(`[automations:review] ${order?.id}:`, err.message);
    }
  }
}

// ---------------- Runner ----------------

const JOB_ORDER = {
  all: ['loyalty', 'dunning', 'review', 'quotes'],
  loyalty: ['loyalty'],
  dunning: ['dunning'],
  review: ['review'],
  quotes: ['quotes'],
};

const JOB_RUNNERS = {
  quotes: runQuotes,
  dunning: runDunning,
  loyalty: runLoyalty,
  review: runReviews,
};

const JOB_METRICS = ['checked', 'claimed', 'sent', 'skipped', 'errors', 'skipped_for_time', 'dry_run_count'];

export async function runAutomations({ job = 'all', now = new Date() } = {}) {
  const selected = String(job || 'all').toLowerCase();
  if (!VALID_JOBS.has(selected)) {
    const err = new Error('Unknown automation job.');
    err.statusCode = 400;
    err.code = 'INVALID_JOB';
    throw err;
  }

  const cfg = config();
  const startedAt = Date.now();
  const dryRun = isDryRun();
  const summary = {
    job: selected,
    dry_run: dryRun,
    checked: 0,
    claimed: 0,
    sent: 0,
    skipped: 0,
    errors: 0,
    skipped_for_time: 0,
    dry_run_count: 0,
    jobs: {},
  };

  for (const name of JOB_ORDER[selected]) {
    const jobSummary = newJobSummary();
    try {
      await JOB_RUNNERS[name]({ now, cfg, summary: jobSummary, startedAt });
    } catch (err) {
      jobSummary.errors += 1;
      console.error(`[automations:${name}] run failed:`, err.message);
    }
    summary.jobs[name] = jobSummary;
    for (const metric of JOB_METRICS) summary[metric] += jobSummary[metric];
  }

  console.log('[automations]', JSON.stringify(summary));
  return summary;
}

export async function automationsHandler(req, res) {
  const requested = String(req.query?.job || req.body?.job || 'all').toLowerCase();
  if (!VALID_JOBS.has(requested)) {
    return res.status(400).json({
      success: false,
      error: { message: 'Unknown automation job.', code: 'INVALID_JOB' },
    });
  }

  if (store.backendName() === 'unavailable') {
    return res.status(503).json({
      success: false,
      error: { message: 'Persistence provider is unavailable.', code: 'PERSISTENCE_UNAVAILABLE' },
    });
  }

  try {
    const summary = await runAutomations({ job: requested });
    return res.status(200).json({ success: true, ...summary });
  } catch (err) {
    if (err.code === 'PERSISTENCE_UNAVAILABLE') {
      return res.status(503).json({
        success: false,
        error: { message: 'Persistence provider is unavailable.', code: 'PERSISTENCE_UNAVAILABLE' },
      });
    }
    console.error('[automations] handler failed:', err.message);
    return res.status(500).json({
      success: false,
      error: { message: 'Automation run failed.', code: 'AUTOMATION_FAILED' },
    });
  }
}

export function startAutomationTimer() {
  if (env('AUTOMATION_ENABLED').toLowerCase() !== 'true') return null;

  const initialDelay = num('AUTOMATION_INITIAL_DELAY_MS', 120000);
  const interval = Math.max(1000, num('AUTOMATION_INTERVAL_MS', DAY_MS));
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runAutomations({ job: 'all' });
    } catch (err) {
      console.error('[automations] Background run failed:', err.message);
    } finally {
      running = false;
    }
  };

  const initial = setTimeout(() => {
    void tick();
    setInterval(tick, interval).unref();
  }, initialDelay);
  initial.unref();
  return initial;
}
