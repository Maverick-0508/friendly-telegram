# Production deployment checklist

This is the operator runbook for taking Lawn Craft live on Vercel. Work through
it top to bottom; the readiness endpoint at the end confirms every item.

## 1. Supabase

1. Open the Supabase SQL editor and run `supabase-schema.sql` (idempotent; safe
   to re-run after upgrades — this release adds two indexes on `payments`).
2. Confirm Row Level Security is enabled on every table and that the **anon**
   key is not used anywhere. The server uses the service-role key only.
3. In Authentication → Providers, keep Email enabled. Disable public sign-ups if
   you do not want self-service accounts.

## 2. Safaricom Daraja (M-Pesa)

1. In the Daraja portal create a **production** app for Lipa Na M-Pesa Online
   and note the consumer key, consumer secret, PayBill/Till shortcode and passkey.
2. Generate a callback token:

   ```bash
   node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
   ```

3. Register the callback URL with Safaricom exactly as the app will build it:
   `https://<your-domain>/api/mpesa/callback/<MPESA_CALLBACK_TOKEN>`.
   Payments are **disabled in production until `MPESA_CALLBACK_TOKEN` is set**;
   without it a forged callback could mark an invoice paid.
4. Set `MPESA_ENVIRONMENT=production`. Readiness flags a sandbox setting when
   `NODE_ENV=production`.

## 3. Vercel environment variables

Run these from the project root (`vercel env add NAME production` prompts for
the value). Everything marked required must exist before go-live.

| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_URL` | yes | already set |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | already set |
| `CORS_ORIGIN` | yes | already set; comma-separated list of your site origins |
| `PUBLIC_SITE_URL` | yes | `https://<your-domain>`; used in SMS links |
| `MPESA_ENVIRONMENT` | yes | `production` |
| `MPESA_CONSUMER_KEY` / `MPESA_CONSUMER_SECRET` | yes | Daraja app credentials |
| `MPESA_SHORTCODE` / `MPESA_PASSKEY` | yes | PayBill/Till + Lipa Na M-Pesa passkey |
| `MPESA_CALLBACK_URL` | yes | `https://<your-domain>/api/mpesa/callback` |
| `MPESA_CALLBACK_TOKEN` | yes | random secret from step 2 |
| `CRON_SECRET` | yes | random secret; Vercel sends it as `Authorization: Bearer` to the cron |
| `ADMIN_API_TOKEN` | yes | random secret for `/api/system/status`, manual reconciliation and the supervisor confirm endpoint |
| `BOOKING_MODE` | optional | `confirm` (default): bookings are requests a supervisor confirms before payment; `instant` to make estimates payable immediately |
| `COMPANY_KRA_PIN` | yes | printed on tax receipts |
| `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL`, `OWNER_EMAIL` | recommended | owner email alerts for leads, quotes and orders |
| `AFRICAS_TALKING_USERNAME`, `AFRICAS_TALKING_API_KEY`, `AFRICAS_TALKING_SENDER` | recommended | booking confirmations and receipts by SMS |
| `PRICING_JSON`, `COUPONS_JSON` | optional | override the price catalogue / promo codes |

`NODE_ENV=production` is set by Vercel automatically.

```bash
for v in PUBLIC_SITE_URL MPESA_ENVIRONMENT MPESA_CONSUMER_KEY MPESA_CONSUMER_SECRET \
         MPESA_SHORTCODE MPESA_PASSKEY MPESA_CALLBACK_URL MPESA_CALLBACK_TOKEN \
         CRON_SECRET ADMIN_API_TOKEN COMPANY_KRA_PIN \
         RESEND_API_KEY NOTIFY_FROM_EMAIL OWNER_EMAIL \
         AFRICAS_TALKING_USERNAME AFRICAS_TALKING_API_KEY AFRICAS_TALKING_SENDER; do
  vercel env add "$v" production
done
```

## 4. Vercel project settings

- **Cron**: `vercel.json` schedules `GET /api/mpesa/reconcile` daily at 02:00 UTC
  (the Hobby plan allows one run per day; on Pro you may tighten it, e.g.
  `*/30 * * * *`). The status endpoint already queries Daraja for any payment
  still pending after 20 seconds, so the cron is a safety net, not the primary
  path.
- **Firewall → Rate limiting**: the in-process limiter cannot share counters
  between serverless instances. Add platform rules such as:
  - `/api/mpesa/stkpush`: 10 requests / minute / IP
  - `/api/work-orders`, `/api/portal/*`, `/api/contact`, `/api/quotes`: 30 / minute / IP
  - `/api/auth/*`: 20 / 15 minutes / IP
  Payment endpoints also enforce database-backed limits (5 prompts per phone per
  15 minutes; one pending prompt per invoice), which hold regardless of instance.
- **Domains**: add your custom domain, then update `CORS_ORIGIN`,
  `PUBLIC_SITE_URL`, `MPESA_CALLBACK_URL`, `public/robots.txt`,
  `public/sitemap.xml` and the canonical URLs in `public/*.html`.

## 5. Verify

```bash
vercel --prod
curl -s https://<your-domain>/api/ready | jq
```

`ready` must be `true` and `problems` empty. `warnings` lists any optional
feature that is still switched off. With `ADMIN_API_TOKEN`:

```bash
curl -s -H "x-admin-token: $ADMIN_API_TOKEN" https://<your-domain>/api/system/status | jq .config
```

Then run one real KSh 1 payment end to end (STK prompt → receipt page) and
confirm the invoice flips to `paid` and the SMS/email arrive.

## Ongoing

- `npm test` runs 58 checks including the hardening regression suite; CI runs
  it on every push.
- Rotate `MPESA_CALLBACK_TOKEN`, `CRON_SECRET` and `ADMIN_API_TOKEN` if they are
  ever exposed; changing the callback token requires re-registering the callback
  URL with Safaricom.
- Watch the Vercel function logs for lines prefixed `[config] PROBLEM` (printed
  at cold start) and `[payments] Partial payment`.
