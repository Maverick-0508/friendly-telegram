import { createApp } from './app.js';

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
}

export default app;
