import { createApp } from './app.js';
import { reconcilePendingPayments } from './node-backend/controllers/portalController.js';
import { logRuntimeConfig } from './node-backend/config/runtime.js';

const app = createApp();

// Print every disabled or misconfigured production feature once at boot.
logRuntimeConfig();

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
