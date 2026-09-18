import { Router } from 'express';

import { submitContactForm, submitQuoteForm } from '../controllers/formController.js';
import { register, login, me } from '../controllers/authController.js';
import {
  lookupClient,
  createClientProfile,
  createWorkOrder,
  getWorkOrder,
  stkPushMpesa,
  getInvoice,
  settleInvoice,
  validateCoupon,
  getPortalStats,
} from '../controllers/portalController.js';
import { checkPostgresReachability } from '../config/db.js';
import { checkSupabaseReachability } from '../config/supabase.js';
import { store } from '../services/store.js';

const router = Router();

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
  const ready = isProduction
    ? authConfigured && authAvailable && persistenceAvailable && dataBackend === 'supabase'
    : persistenceAvailable;

  const checks = {
    auth_configured: authConfigured,
    auth_available: authAvailable,
    persistence_configured: pgStatus.configured || sbStatus.configured,
    persistence_available: persistenceAvailable,
    data_backend: dataBackend,
    postgresql: pgStatus,
    supabase: sbStatus,
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
    });
  }

  return res.status(200).json({
    success: true,
    ready,
    degraded: !ready,
    checks,
  });
});

// System & Database Diagnostic Status
router.get('/system/status', async (_req, res) => {
  const [pgStatus, sbStatus] = await Promise.all([
    checkPostgresReachability(),
    checkSupabaseReachability(),
  ]);

  const activePrimary = !pgStatus.connected && !sbStatus.connected
    ? 'Unavailable'
    : 'PostgreSQL Database';

  res.status(200).json({
    success: true,
    application: 'Lawn Craft Web Suite',
    environment: process.env.NODE_ENV || 'development',
    database: {
      active_primary: activePrimary,
      postgresql: pgStatus,
      supabase: sbStatus,
      data_backend: store.backendName(),
      persistence_architecture: 'Supabase (no in-memory fallback in production)'
    },
    erp_metrics: await getPortalStats(),
    features: {
      client_hub_recognition: 'Active',
      gps_crew_tracking: 'Active',
      instant_pricing_calculator: 'Active',
      mpesa_stk_push_and_receipts: 'Active',
      pwa_offline_caching: 'Active'
    }
  });
});

// Internal non-blocking analytics receiver
router.post('/analytics', (_req, res) => {
  res.status(200).json({ success: true });
});

// Portal & Client Recognition
router.post('/portal/lookup', lookupClient);
router.get('/portal/lookup', lookupClient);
router.post('/portal/clients', createClientProfile);

// Work Orders & Dispatch Queue
router.post('/work-orders', createWorkOrder);
router.get('/work-orders/:orderId', getWorkOrder);

// Payments & Invoices
router.post('/mpesa/stkpush', stkPushMpesa);
router.get('/invoices/:invoiceId', getInvoice);
router.post('/invoices/:invoiceId/pay', settleInvoice);

// Promo Coupons
router.post('/coupons/validate', validateCoupon);

// Contact & Quotes
router.post('/contact', submitContactForm);
router.post('/quotes', submitQuoteForm);

// Auth
router.post('/auth/register', register);
router.post('/auth/login', login);
router.get('/auth/me', me);

export default router;

