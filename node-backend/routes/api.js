import { Router } from 'express';

import { submitContactForm, submitQuoteForm } from '../controllers/formController.js';
import { register, login, me } from '../controllers/authController.js';
import {
  lookupClient,
  createClientProfile,
  createWorkOrder,
  getWorkOrder,
  stkPushMpesa,
  mpesaStatus,
  mpesaCallback,
  getInvoice,
  validateCoupon,
  reconcileHandler,
  getPortalStats,
} from '../controllers/portalController.js';
import { checkPostgresReachability } from '../config/db.js';
import { checkSupabaseReachability } from '../config/supabase.js';
import { auditRuntimeConfig } from '../config/runtime.js';
import { isMpesaConfigured } from '../services/mpesa.js';
import { store } from '../services/store.js';

const ANALYTICS_MAX_BYTES = 4096;

const router = Router();

function sanitizeProviderStatus(status) {
  if (!status || typeof status !== 'object') return status;
  const { url, ...safe } = status;
  return safe;
}

function tokenMatches(token, secret) {
  return Boolean(token && secret && token.length === secret.length && secureCompare(token, secret));
}

function secureCompare(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) mismatch |= left[i] ^ right[i];
  return mismatch === 0;
}

// Diagnostics and payment reconciliation are operational endpoints. They
// require either the admin token (x-admin-token) or the Vercel cron secret
// (Authorization: Bearer $CRON_SECRET); without any configured secret the
// route is hidden entirely in production.
function requireAdmin(req, res, next) {
  const adminToken = process.env.ADMIN_API_TOKEN;
  const cronSecret = process.env.CRON_SECRET;
  if (!adminToken && !cronSecret) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({
        success: false,
        error: { message: 'API route not found', code: 'ROUTE_NOT_FOUND' },
      });
    }
    return next();
  }

  const provided = req.headers['x-admin-token'] || '';
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (tokenMatches(provided, adminToken) || tokenMatches(bearer, cronSecret)) {
    return next();
  }

  return res.status(401).json({
    success: false,
    error: { message: 'Unauthorized', code: 'UNAUTHORIZED' },
  });
}

router.get('/health', (_req, res) => {
  res.status(200).json({ success: true, message: 'Server is healthy' });
});

router.get('/ready', async (_req, res) => {
  const isProduction = process.env.NODE_ENV === 'production';

  const [pgStatus, sbStatus] = await Promise.all([
    checkPostgresReachability(),
    checkSupabaseReachability(),
  ]);

  const authConfigured = sbStatus.configured;
  const authAvailable = sbStatus.connected;
  const persistenceAvailable = pgStatus.connected || sbStatus.connected;
  const dataBackend = store.backendName();
  const config = auditRuntimeConfig();
  const ready = isProduction
    ? authConfigured && authAvailable && persistenceAvailable && dataBackend === 'supabase' && config.problems.length === 0
    : persistenceAvailable;

  const checks = {
    auth_configured: authConfigured,
    auth_available: authAvailable,
    persistence_configured: pgStatus.configured || sbStatus.configured,
    persistence_available: persistenceAvailable,
    data_backend: dataBackend,
    postgresql: sanitizeProviderStatus(pgStatus),
    supabase: sanitizeProviderStatus(sbStatus),
    features: config.checks,
  };

  if (!ready && isProduction) {
    return res.status(503).json({
      success: false,
      ready: false,
      error: {
        message: 'Application is not ready for production traffic.',
        code: 'READINESS_FAILED',
      },
      checks,
      problems: config.problems,
      warnings: config.warnings,
    });
  }

  return res.status(200).json({
    success: true,
    ready,
    degraded: !ready || config.warnings.length > 0,
    checks,
    problems: config.problems,
    warnings: config.warnings,
  });
});

// System & Database Diagnostic Status (admin-only in production)
router.get('/system/status', requireAdmin, async (_req, res) => {
  const [pgStatus, sbStatus] = await Promise.all([
    checkPostgresReachability(),
    checkSupabaseReachability(),
  ]);

  const safePg = sanitizeProviderStatus(pgStatus);
  const safeSb = sanitizeProviderStatus(sbStatus);

  const activePrimary = !pgStatus.connected && !sbStatus.connected
    ? 'Unavailable'
    : 'PostgreSQL Database';

  res.status(200).json({
    success: true,
    application: 'Lawn Craft Web Suite',
    environment: process.env.NODE_ENV || 'development',
    database: {
      active_primary: activePrimary,
      postgresql: safePg,
      supabase: safeSb,
      data_backend: store.backendName(),
      persistence_architecture: 'Supabase (no in-memory fallback in production)'
    },
    erp_metrics: await getPortalStats(),
    features: {
      client_hub_recognition: 'Active',
      gps_crew_tracking: 'Active',
      instant_pricing_calculator: 'Active',
      mpesa_stk_push_and_receipts: isMpesaConfigured() ? 'Active' : 'Not configured',
      pwa_offline_caching: 'Active'
    },
    config: auditRuntimeConfig(),
  });
});

// Internal non-blocking analytics receiver. Persists when Supabase is
// configured; otherwise it safely no-ops so the page never blocks on telemetry.
// Payloads are capped so the endpoint cannot be used to fill the database.
router.post('/analytics', async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : null;
    if (body && JSON.stringify(body).length <= ANALYTICS_MAX_BYTES) {
      const event = {
        page: typeof body.page === 'string' ? body.page.slice(0, 200) : null,
        referrer: typeof body.referrer === 'string' ? body.referrer.slice(0, 500) : null,
        loadTime: typeof body.loadTime === 'string' ? body.loadTime.slice(0, 20) : undefined,
        effectiveType: typeof body.effectiveType === 'string' ? body.effectiveType.slice(0, 20) : undefined,
        memory: body.memory,
        screen: typeof body.screen === 'string' ? body.screen.slice(0, 20) : undefined,
        language: typeof body.language === 'string' ? body.language.slice(0, 20) : undefined,
      };
      void store.trackAnalytics(event).catch((err) => {
        console.warn('[analytics] Failed to persist event.', err.message);
      });
    }
  } catch (err) {
    console.warn('[analytics] Invalid payload.', err.message);
  }
  res.status(200).json({ success: true });
});

// Portal & Client Recognition. Lookup is POST-only so the access PIN never
// travels in a URL (query strings end up in proxy and platform logs).
router.post('/portal/lookup', lookupClient);
router.post('/portal/clients', createClientProfile);

// Work Orders & Dispatch Queue
router.post('/work-orders', createWorkOrder);
router.get('/work-orders/:orderId', getWorkOrder);

// Payments & Invoices (real M-Pesa Daraja integration)
router.post('/mpesa/stkpush', stkPushMpesa);
router.post('/mpesa/callback', mpesaCallback);
router.post('/mpesa/callback/:token', mpesaCallback);
router.get('/mpesa/status/:checkoutRequestId', mpesaStatus);
// Vercel Cron invokes its target with GET; admins and local jobs may POST.
router.get('/mpesa/reconcile', requireAdmin, reconcileHandler);
router.post('/mpesa/reconcile', requireAdmin, reconcileHandler);
router.get('/invoices/:invoiceId', getInvoice);

// Promo Coupons
router.post('/coupons/validate', validateCoupon);

// Contact & Quotes
router.post('/contact', submitContactForm);
router.post('/quotes', submitQuoteForm);

// Email/password accounts (Supabase Auth). Clients use the PIN-protected hub,
// so these routes are off unless ENABLE_ACCOUNT_AUTH=true: an open
// registration endpoint that auto-confirms emails is otherwise just a spam
// surface for your Supabase Auth project.
if (String(process.env.ENABLE_ACCOUNT_AUTH || '').toLowerCase() === 'true') {
  router.post('/auth/register', register);
  router.post('/auth/login', login);
  router.get('/auth/me', me);
}

export default router;

