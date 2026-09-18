import { createApp } from './app.js';
import { reconcilePendingPayments } from './node-backend/controllers/portalController.js';

const app = createApp();

const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (isProduction && allowedOrigins.length === 0) {
  console.warn(
    '[startup] CORS_ORIGIN is not set in production. Browser cross-origin requests will be denied; ' +
    'set CORS_ORIGIN to a comma-separated allowlist of your site origins.'
  );
}

// On Vercel the platform invokes the exported Express app as a single
// serverless function. Locally (and in Docker) we bind a port instead.
if (!process.env.VERCEL) {
  const PORT = Number(process.env.PORT || 3000);
  const HOST = '0.0.0.0';
  app.listen(PORT, HOST, () => {
    console.log(`Lawn Craft server running on http://${HOST}:${PORT}`);
  });

  // Lost-callback payment reconciliation for long-running (non-serverless)
  // processes. Vercel deployments rely on the /api/mpesa/reconcile cron
  // instead (see vercel.json).
  const intervalMs = Number(process.env.RECONCILE_INTERVAL_MS || 15 * 60 * 1000);
  let reconciling = false;
  const runReconciliation = async () => {
    if (reconciling) return;
    reconciling = true;
    try {
      const summary = await reconcilePendingPayments();
      if (summary.checked > 0) {
        console.log('[reconcile]', JSON.stringify(summary));
      }
    } catch (err) {
      console.error('[reconcile] Background reconciliation failed:', err.message);
    } finally {
      reconciling = false;
    }
  };

  const initialDelay = Number(process.env.RECONCILE_INITIAL_DELAY_MS || 60 * 1000);
  const timer = setTimeout(() => {
    void runReconciliation();
    setInterval(runReconciliation, intervalMs).unref();
  }, initialDelay);
  timer.unref();
}

export default app;
