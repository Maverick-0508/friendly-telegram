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
- `POST /api/portal/lookup` (identifier + `pin`), `POST /api/portal/clients`
- `POST /api/work-orders`, `GET /api/work-orders/:orderId`
- `POST /api/mpesa/stkpush` — real Safaricom Daraja STK push
- `POST /api/mpesa/callback[/:token]` — Safaricom result callback (WebHook)
- `GET /api/mpesa/status/:checkoutRequestId` — client-side status polling
- `POST /api/mpesa/reconcile` — lost-callback reconciliation; `ADMIN_API_TOKEN`
  or `CRON_SECRET` bearer required in production
- `GET /api/invoices/:invoiceId`
- `POST /api/coupons/validate`
- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`

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
  `POST /api/mpesa/reconcile` every 30 minutes (guarded by `CRON_SECRET`).
- Reconciliation is idempotent; double-settling is prevented by the same
  `settled` guard used for callbacks.

### Portal access PIN

Client profiles opened through the portal (`POST /api/portal/lookup`) require an
access PIN (4–6 digits) chosen at registration. PINs are stored only as a
scrypt hash + salt and never returned to the client or included in the
supervisor export. Quote-only profiles have no PIN until the client registers
one via `POST /api/portal/clients`.

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
  `MPESA_CALLBACK_TOKEN` — Daraja STK push
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