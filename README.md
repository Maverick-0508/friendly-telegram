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
- `GET /api/system/status` — diagnostics; requires `ADMIN_API_TOKEN` in production
- `POST /api/analytics`
- `POST /api/contact`
- `POST /api/quotes`
- `POST /api/portal/lookup`, `POST /api/portal/clients`
- `POST /api/work-orders`, `GET /api/work-orders/:orderId`
- `POST /api/mpesa/stkpush` — real Safaricom Daraja STK push
- `POST /api/mpesa/callback[/:token]` — Safaricom result callback (WebHook)
- `GET /api/mpesa/status/:checkoutRequestId` — client-side status polling
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
- `ADMIN_API_TOKEN` — gates `/api/system/status` in production
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
`clients`, `work_orders`, `invoices`, `quotes`, `leads` and `payments`.

## CI / Verification

```bash
npm run lint
npm test
npm run test:smoke
npm run test:pwa
```