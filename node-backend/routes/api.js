import { Router } from 'express';

import { submitContactForm, submitQuoteForm } from '../controllers/formController.js';
import { register, login, me } from '../controllers/authController.js';
import {
  lookupClient,
  createWorkOrder,
  getWorkOrder,
  stkPushMpesa,
  getInvoice,
  settleInvoice,
  validateCoupon,
  getPortalStats,
} from '../controllers/portalController.js';
import { getDatabaseStatus } from '../config/db.js';
import { getSupabaseStatus } from '../config/supabase.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.status(200).json({ success: true, message: 'Server is healthy' });
});

// System & Database Diagnostic Status
router.get('/system/status', (_req, res) => {
  const pgStatus = getDatabaseStatus();
  const sbStatus = getSupabaseStatus();

  let activePrimary = 'In-Memory Resilient Engine (Local Storage Mode)';
  if (pgStatus.connected) {
    activePrimary = 'PostgreSQL Database';
  } else if (sbStatus.connected) {
    activePrimary = 'Supabase Cloud Database';
  }

  res.status(200).json({
    success: true,
    application: 'Lawn Craft Web Suite',
    environment: process.env.NODE_ENV || 'production',
    database: {
      active_primary: activePrimary,
      postgresql: pgStatus,
      supabase: sbStatus,
      persistence_architecture: 'Tiered Fallback (PostgreSQL -> Supabase -> Local In-Memory)'
    },
    erp_metrics: getPortalStats(),
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


