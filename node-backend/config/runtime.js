// Production configuration audit. Used by the readiness endpoint and logged at
// startup so an incomplete deployment is visible immediately instead of
// surfacing as a broken checkout or a silent lack of owner notifications.

import { hasMpesaCredentials, isMpesaConfigured, mpesaConfigProblems } from '../services/mpesa.js';
import { isEmailConfigured, isSmsConfigured, ownerEmail } from '../services/notify.js';

function env(name) {
  const value = process.env[name];
  return value === undefined || value === null ? '' : String(value).trim();
}

export function publicSiteUrl() {
  return (env('PUBLIC_SITE_URL') || 'https://lawncraft.vercel.app').replace(/\/+$/, '');
}

/**
 * Returns { checks, problems, warnings }.
 *  - problems: block "ready" in production (payments misconfigured, no CORS).
 *  - warnings: features that are switched off because their secrets are blank.
 */
export function auditRuntimeConfig() {
  const isProduction = process.env.NODE_ENV === 'production';
  const problems = [];
  const warnings = [];

  const paymentsCredentialed = hasMpesaCredentials();
  const paymentsEnabled = isMpesaConfigured();
  if (paymentsCredentialed && !paymentsEnabled) {
    problems.push(...mpesaConfigProblems());
  } else if (!paymentsCredentialed) {
    warnings.push('M-Pesa is not configured; the pay page will report payments unavailable.');
  } else {
    warnings.push(...mpesaConfigProblems());
  }

  if (isProduction && !env('CORS_ORIGIN')) {
    problems.push('CORS_ORIGIN is not set; browser requests from your own domain will be rejected.');
  }

  const bookingMode = (env('BOOKING_MODE') || 'confirm').toLowerCase() === 'instant' ? 'instant' : 'confirm';
  if (bookingMode === 'confirm' && !env('ADMIN_API_TOKEN')) {
    warnings.push('BOOKING_MODE=confirm but ADMIN_API_TOKEN is not set; the /api/admin/work-orders/:id/confirm endpoint is disabled, so the supervisor dashboard must set invoice.status=unpaid directly.');
  }

  if (!env('ADMIN_API_TOKEN') && !env('CRON_SECRET')) {
    warnings.push('Neither ADMIN_API_TOKEN nor CRON_SECRET is set; /api/system/status and /api/mpesa/reconcile are disabled.');
  } else if (!env('CRON_SECRET')) {
    warnings.push('CRON_SECRET is not set; the Vercel cron cannot run payment reconciliation.');
  }

  if (!isEmailConfigured() || !ownerEmail()) {
    warnings.push('Owner email alerts are off (RESEND_API_KEY, NOTIFY_FROM_EMAIL, OWNER_EMAIL). New leads and orders will only appear in the database.');
  }
  if (!isSmsConfigured()) {
    warnings.push('Client SMS is off (AFRICAS_TALKING_USERNAME, AFRICAS_TALKING_API_KEY). Booking and receipt texts are skipped.');
  }
  if (!env('COMPANY_KRA_PIN')) {
    warnings.push('COMPANY_KRA_PIN is not set; tax receipts will not show a KRA PIN.');
  }
  if (!env('PUBLIC_SITE_URL')) {
    warnings.push(`PUBLIC_SITE_URL is not set; links in SMS default to ${publicSiteUrl()}.`);
  }

  const checks = {
    booking_mode: bookingMode,
    payments_enabled: paymentsEnabled,
    payments_callback_protected: Boolean(env('MPESA_CALLBACK_TOKEN')),
    payments_environment: env('MPESA_ENVIRONMENT') || 'sandbox',
    owner_email_alerts: Boolean(isEmailConfigured() && ownerEmail()),
    client_sms: isSmsConfigured(),
    admin_token_set: Boolean(env('ADMIN_API_TOKEN')),
    cron_secret_set: Boolean(env('CRON_SECRET')),
    cors_origin_set: Boolean(env('CORS_ORIGIN')),
    kra_pin_set: Boolean(env('COMPANY_KRA_PIN')),
    public_site_url: publicSiteUrl(),
  };

  return { checks, problems, warnings };
}

export function logRuntimeConfig() {
  const { problems, warnings } = auditRuntimeConfig();
  for (const p of problems) console.error('[config] PROBLEM:', p);
  for (const w of warnings) console.warn('[config] warning:', w);
  if (!problems.length && !warnings.length) console.log('[config] All production features are configured.');
}
