# Lawn Craft - Professional Lawn Care Platform

A modern lawn care website with a clean Express.js backend that sends contact form submissions directly to Supabase.

## Project Structure

```text
friendly-telegram/
├── *.html, *.js, styles.css   # Static site assets (served by Express)
├── node-backend/              # API routes, controllers, data integrations
├── tests/                     # Node integration + smoke tests
└── README.md
```

## Deployment Architecture

This repository uses a single backend model: **Node/Express** (`/home/runner/work/friendly-telegram/friendly-telegram/server.js` + `/home/runner/work/friendly-telegram/friendly-telegram/app.js`).

The server hosts static pages and exposes API endpoints under `/api`, including:

- `GET /health`
- `GET /ready`
- `POST /api/contact`
- `POST /api/quotes`
- `POST /api/work-orders`
- `GET /api/work-orders/:orderId`
- `POST /api/mpesa/stkpush`
- `GET /api/invoices/:invoiceId`
- `POST /api/invoices/:invoiceId/pay`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

It uses Express, CORS, Helmet, rate limiting, dotenv, PostgreSQL (`pg`), and Supabase.

## Local Setup

Install dependencies and run the unified Express app:

```bash
cd /home/runner/work/friendly-telegram/friendly-telegram
npm install
npm run dev
```

## Environment

Create `/home/runner/work/friendly-telegram/friendly-telegram/.env` from `/home/runner/work/friendly-telegram/friendly-telegram/.env.example` and set:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL` (optional if using Supabase for persistence)
- `PORT`
- `CORS_ORIGIN`

Production recommendations:

- Set `NODE_ENV=production`
- Keep `ALLOW_IN_MEMORY_FALLBACK` unset (or `false`)
- Set `ENFORCE_HTTPS=true`
- Configure a strict `CORS_ORIGIN` allowlist

## CI / Verification

Run:

```bash
npm run lint
npm test
npm run test:smoke
```
