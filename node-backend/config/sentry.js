import * as Sentry from '@sentry/node';

let initialized = false;

export function initSentry(app) {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || initialized) return;

  try {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.2),
    });
    initialized = true;
    console.log('[Sentry] Initialized successfully');
  } catch (err) {
    console.error('[Sentry] Initialization failed:', err.message);
  }
}

export function setupSentryRequestHandlers(app) {
  if (!initialized) return;
  // Sentry request handler if needed or Express error middleware
  Sentry.setupExpressErrorHandler(app);
}

export { Sentry };
