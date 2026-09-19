# Lawn Craft - Professional Lawn Care Platform

A modern lawn care website with an Express.js backend that stores leads, client
hub profiles, work orders, coupons and M-Pesa payments in Supabase.

## Project Structure

```text
friendly-telegram/
├── public/               # Static site assets (HTML, CSS, JS, PWA files, images)
├── node-backend/         # API routes, controllers, data + M-Pesa integrations
├── tests/                # Node integration + smoke + M-Pesa tests
├── app.js                # Express app (createApp / startServer)
├── server.js             # Entrypoint; exports the app for Vercel
└── vercel.json           # Vercel build/rewrite configuration
```

## Deployment Architecture

The app is a single Node/Express instance. **Vercel is the primary host**: Vercel
detects the Express app from `server.js` (default export), serves the static
assets from `public/` on the CDN, and runs the `/api` routes as one serverless
function. Locally and in Docker the same code listens on `PORT` (see the
`if (!process.env.VERCEL)` guard in `server.js`).

Static files live in `public/` because `express.static()` is ignored by Vercel;
dynamic SEO-friendly routes (`/tracker/:id`, `/pay/:id`, `/receipt/:id`,
`/calculator`) are rewritten to their static HTML by `vercel.json`.

### API endpoints

- `GET /health`, `GET /ready`, `GET /api/health`, `GET /api/ready`
- `GET /api/system/status` — diagnostics; requires `ADMIN_API_TOKEN` or
  `Authorization: Bearer $CRON_SECRET` in production
- `POST /api/analytics` — persists anonymized page-view tracking
- `POST /api/contact` — stores a lead and notifies the owner
- `POST /api/quotes` — stores a quote and notifies the owner
- `POST /api/portal/lookup` (identifier + `pin`; POST only so the PIN never
  appears in a URL), `POST /api/portal/clients`
- `POST /api/work-orders` — the server prices the order from
  `node-backend/config/pricing.js` (inputs: `service_type` or
  `grass`/`frequency`/`addons`/`property_size`, plus `coupon_code`); any
  `price`/`status` in the request is ignored. `GET /api/work-orders/:orderId`
- `POST /api/mpesa/stkpush` — real Safaricom Daraja STK push; throttled per
  phone and de-duplicated per invoice (`PAYMENT_IN_PROGRESS` returns the
  pending checkout so the UI resumes polling)
- `POST /api/mpesa/callback/:token` — Safaricom result callback (WebHook). In
  production the token is mandatory and the confirmed amount must cover the
  balance; a smaller amount records a partial payment.
- `GET /api/mpesa/status/:checkoutRequestId` — client-side status polling;
  after 20 s pending it queries Daraja directly (lost-callback recovery)
- `GET|POST /api/mpesa/reconcile` — batch lost-callback reconciliation;
  `ADMIN_API_TOKEN` or `CRON_SECRET` bearer required in production (Vercel
  Cron uses GET)
- `GET /api/invoices/:invoiceId`
- `POST /api/coupons/validate`
- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` —
  Supabase email/password accounts; registered only when
  `ENABLE_ACCOUNT_AUTH=true` (clients sign in to the PIN hub; `/login` and
  `/signup` redirect there)

### M-Pesa payments

Payments use Lipa Na M-Pesa Online (STK push). The flow is:

1. Client submits `/api/mpesa/stkpush` with `phone`, `amount` and `invoice_id`.
2. The server reconciles the amount against the invoice balance, calls Daraja,
   and stores a `payments` record in `pending` state. **Nothing is marked paid.**
3. Safaricom calls `/api/mpesa/callback[?/token]`. The response is validated
   against `MPESA_CALLBACK_TOKEN` (constant-time), records are updated, and the
   invoice is settled *only* when `ResultCode === 0` with the real M-Pesa receipt.
4. The client polls `GET /api/mpesa/status/:checkoutRequestId` until the status
   leaves `pending` and shows the official receipt.

#### Lost-callback reconciliation

Safaricom's result callback can be lost (timeouts, network drops). A background
job reconciles stale `pending` payments:

- Locally/Docker the server runs a timer (see `RECONCILE_INTERVAL_MS`) that
  queries Daraja STK query for pending payments older than `RECONCILE_GRACE_MS`
  (default 15 minutes) and settles or cancels them as Daraja reports.
- On Vercel the scheduled cron in `vercel.json` calls
  `GET /api/mpesa/reconcile` once a day (Hobby-plan limit; tighten on Pro),
  guarded by `CRON_SECRET`. The status endpoint already asks Daraja for any
  payment still pending after `MPESA_STATUS_QUERY_AFTER_MS`, so customers are
  never left waiting on the cron.
- Reconciliation is idempotent; a replayed callback never settles or debits an
  invoice twice.

### Booking flow and the supervisor dashboard contract

`BOOKING_MODE=confirm` (default): an online booking creates a **request**
(`work_orders.status = 'pending_confirmation'`) and an **estimate**
(`invoices.status = 'estimate'`). The estimate is visible in the client hub,
the pay page and the receipt page but cannot be paid (`/api/mpesa/stkpush`
answers `409 INVOICE_NOT_CONFIRMED`). A supervisor confirms it in one of two
ways:

- `POST /api/admin/work-orders/:orderId/confirm` with header
  `x-admin-token: $ADMIN_API_TOKEN` and optional body
  `{ total_amount, scheduled_date, crew_name, crew_lead, crew_phone, due_date, notes }`.
  The server sets the final price (recomputing VAT and line items), flips the
  invoice to `unpaid`, the order to `confirmed`, and texts the client a pay link.
- Or the supervisor dashboard writes directly to Supabase: set
  `invoices.status = 'unpaid'` (and `total_amount` / `balance_due` if the price
  changed) and `work_orders.status = 'confirmed'`. Both the indexed `status`
  column and `data.status` inside the JSON must be updated.

Status vocabularies the client UI understands:

| work_orders.status | shown as |
|---|---|
| `pending_confirmation` | Awaiting Confirmation |
| `confirmed`, `incoming` | Confirmed / Queued for Dispatch |
| `scheduled` | Scheduled |
| `dispatched` | Crew En Route (tracker shows live marker when `crew_lat`/`crew_lng` set) |
| `in_progress` | Crew On-Site |
| `completed` | Completed |
| `cancelled` | Cancelled |

| invoices.status | payable |
|---|---|
| `estimate` | no |
| `unpaid`, `partially_paid` | yes |
| `paid` | no |

Optional order fields the tracker renders when present: `crew_lead`,
`crew_name`, `crew_phone`, `crew_vehicle`, `crew_lat`, `crew_lng`,
`checklist[] = { task, status: pending|in_progress|completed, completed_at? }`.

`BOOKING_MODE=instant` restores the previous behaviour (estimate immediately
payable, order enters the queue as `incoming`).

### Portal access PIN

Client profiles opened through the portal (`POST /api/portal/lookup`) require an
access PIN (4–6 digits) chosen at registration. PINs are stored only as a
scrypt hash + salt and never returned to the client. Changing a profile,
booking against it, or opening the hub requires the PIN. Quote-only profiles
have no PIN yet; one can be claimed via `POST /api/portal/clients` (or a
booking) only when the request also matches the email on file, so a phone
number alone never grants access.

### Production configuration audit

`GET /api/ready` reports `problems` (block readiness: e.g. M-Pesa credentials
without `MPESA_CALLBACK_TOKEN`, missing `CORS_ORIGIN`) and `warnings`
(features switched off because their secrets are blank). The same audit is
logged at startup with a `[config]` prefix. See `DEPLOYMENT.md` for the
go-live checklist.

## Local Setup

```bash
npm install
cp .env.example .env   # then fill in credentials
npm run dev
```

## Environment

See `.env.example` for the full list. Key variables:

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — persistence + auth
- `DATABASE_URL` — optional PostgreSQL (used for the legacy `pg` path)
- `MPESA_ENVIRONMENT`, `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`,
  `MPESA_SHORTCODE`, `MPESA_PASSKEY`, `MPESA_CALLBACK_URL`,
  `MPESA_CALLBACK_TOKEN` (required in production) — Daraja STK push
- `STK_MAX_PER_PHONE`, `STK_PHONE_WINDOW_MS`, `STK_DUPLICATE_WINDOW_MS`,
  `MPESA_MAX_AMOUNT`, `MPESA_STATUS_QUERY_AFTER_MS` — payment abuse limits and
  lost-callback recovery
- `PUBLIC_SITE_URL` — public site URL used in SMS links
- `PRICING_JSON` — optional override of the server-side price catalogue
- `ADMIN_API_TOKEN` — gates admin endpoints in production
- `CRON_SECRET` — bearer token that authorizes the Vercel cron
  (`/api/mpesa/reconcile`)
- `RECONCILE_GRACE_MS` (default 900000), `RECONCILE_INTERVAL_MS` (default
  900000), `RECONCILE_INITIAL_DELAY_MS` (default 60000) — lost-callback
  reconciliation timing
- `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL`, `OWNER_EMAIL` — transactional email
  notifications (owner alerts; skipped when unconfigured)
- `AFRICAS_TALKING_USERNAME`, `AFRICAS_TALKING_API_KEY`,
  `AFRICAS_TALKING_SENDER` — SMS notifications to clients (skipped when
  unconfigured)
- `COMPANY_KRA_PIN` — company KRA PIN shown on official tax receipts
- `COUPONS_JSON` — optional JSON map overriding the built-in coupons
- `CORS_ORIGIN` — comma-separated allowlist (required in production)
- `ENFORCE_HTTPS`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`,
  `ALLOW_IN_MEMORY_FALLBACK`

Production recommendations:

- Set `NODE_ENV=production`
- Keep `ALLOW_IN_MEMORY_FALLBACK` unset (or `false`)
- Set `ENFORCE_HTTPS=true`
- Configure a strict `CORS_ORIGIN` allowlist

## Database

Run `supabase-schema.sql` once in the Supabase SQL Editor (idempotent). It creates
`clients`, `work_orders`, `invoices`, `quotes`, `leads`, `payments` and
`analytics`.

## CI / Verification

```bash
npm run lint
npm test
npm run test:smoke
npm run test:pwa
```

Tests pin every runtime variable to empty before importing the app (see
`tests/helpers/env.js`), so a developer's local `.env` never changes results.

Against a deployment:

```bash
# Every public flow + persistence read-back against the live site. Creates
# labelled "E2E Test" records and prints cleanup SQL (or deletes them when
# E2E_SUPABASE_URL / E2E_SUPABASE_SERVICE_ROLE_KEY are set).
E2E_BASE=https://lawncraft.vercel.app npm run test:e2e:prod

# Real-browser walkthrough (booking → hub → pay → receipt → PIN login, mobile
# layout, console errors) with screenshots. Needs: npm i --no-save puppeteer-core
UX_BASE=https://lawncraft.vercel.app UX_LABEL=prod npm run test:ux
```
