// Test suites must not inherit a developer's local .env (sandbox M-Pesa keys,
// admin tokens, Supabase credentials...). dotenv never overrides a variable
// that is already defined, so pinning each one to '' before app.js is imported
// gives every suite the same "nothing configured" baseline. Suites that need a
// provider set their own values afterwards.
const RUNTIME_VARS = [
  'NODE_ENV', 'PORT', 'CORS_ORIGIN', 'PUBLIC_SITE_URL', 'ENFORCE_HTTPS', 'ALLOW_IN_MEMORY_FALLBACK',
  'RATE_LIMIT_WINDOW_MS', 'RATE_LIMIT_MAX', 'AUTH_RATE_LIMIT_WINDOW_MS', 'AUTH_RATE_LIMIT_MAX',
  'WRITE_RATE_LIMIT_WINDOW_MS', 'WRITE_RATE_LIMIT_MAX',
  'DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY', 'SUPABASE_JWT_SECRET',
  'MPESA_ENVIRONMENT', 'MPESA_CONSUMER_KEY', 'MPESA_CONSUMER_SECRET', 'MPESA_SHORTCODE', 'MPESA_PASSKEY',
  'MPESA_CALLBACK_URL', 'MPESA_CALLBACK_TOKEN', 'MPESA_TRANSACTION_TYPE', 'MPESA_ACCOUNT_REFERENCE',
  'MPESA_BASE_URL', 'MPESA_HTTP_TIMEOUT_MS', 'MPESA_MAX_AMOUNT', 'MPESA_STATUS_QUERY_AFTER_MS',
  'STK_MAX_PER_PHONE', 'STK_PHONE_WINDOW_MS', 'STK_DUPLICATE_WINDOW_MS',
  'ADMIN_API_TOKEN', 'CRON_SECRET', 'ENABLE_ACCOUNT_AUTH',
  'RECONCILE_GRACE_MS', 'RECONCILE_INTERVAL_MS', 'RECONCILE_INITIAL_DELAY_MS', 'RECONCILE_BATCH_LIMIT', 'RECONCILE_TIME_BUDGET_MS',
  'COMPANY_KRA_PIN', 'RESEND_API_KEY', 'NOTIFY_FROM_EMAIL', 'OWNER_EMAIL',
  'AFRICAS_TALKING_USERNAME', 'AFRICAS_TALKING_API_KEY', 'AFRICAS_TALKING_SENDER',
  'COUPONS_JSON', 'PRICING_JSON', 'PORTAL_STORE_FILE',
];

export function resetRuntimeEnv(overrides = {}) {
  for (const name of RUNTIME_VARS) process.env[name] = '';
  process.env.NODE_ENV = 'development';
  for (const [k, v] of Object.entries(overrides)) process.env[k] = String(v);
}
