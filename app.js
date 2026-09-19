import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import apiRoutes from './node-backend/routes/api.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, 'public');

const HOST = '0.0.0.0';
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
const enforceHttps = isProduction && process.env.ENFORCE_HTTPS !== 'false';

const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const cspDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com'],
  styleSrc: [
    "'self'",
    "'unsafe-inline'",
    'https://fonts.googleapis.com',
    'https://cdnjs.cloudflare.com',
    'https://unpkg.com',
  ],
  fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com', 'data:'],
  imgSrc: [
    "'self'",
    'data:',
    'blob:',
    'https://images.unsplash.com',
    'https://*.tile.openstreetmap.org',
    'https://tile.openstreetmap.org',
    'https://unpkg.com', // Leaflet default marker icons
  ],
  connectSrc: ["'self'", 'https://api.open-meteo.com'],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  frameAncestors: ["'none'"],
  formAction: ["'self'"],
};

if (isProduction) {
  cspDirectives.upgradeInsecureRequests = [];
}

const contentSecurityPolicy = { directives: cspDirectives };

function createCorsOriginValidator() {
  return function origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    const err = new Error('Not allowed by CORS');
    err.statusCode = 403;
    err.code = 'CORS_BLOCKED';
    return callback(err);
  };
}

function createAuthRateLimiter() {
  return rateLimit({
    windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
    max: Number(process.env.AUTH_RATE_LIMIT_MAX || 20),
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: {
      success: false,
      error: { message: 'Too many authentication attempts. Please try again later.', code: 'RATE_LIMITED' },
    },
  });
}

// Page-view telemetry fires on every navigation, so it gets its own budget;
// otherwise a client browsing the site could exhaust the write limit and be
// locked out of their hub.
function createAnalyticsRateLimiter() {
  return rateLimit({
    windowMs: Number(process.env.ANALYTICS_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
    max: Number(process.env.ANALYTICS_RATE_LIMIT_MAX || 300),
    standardHeaders: true,
    legacyHeaders: false,
    // Telemetry is fire-and-forget: never surface an error to the page.
    handler: (_req, res) => res.status(200).json({ success: true, dropped: true }),
  });
}

function createWriteRateLimiter() {
  return rateLimit({
    windowMs: Number(process.env.WRITE_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
    max: Number(process.env.WRITE_RATE_LIMIT_MAX || 100),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: { message: 'Too many requests. Please try again later.', code: 'RATE_LIMITED' },
    },
  });
}

function isSafePagePath(rawPath) {
  if (rawPath.includes('..') || rawPath.includes('\\') || rawPath.includes('\0')) {
    return false;
  }
  let decoded;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return false;
  }
  return !decoded.includes('..') && !decoded.includes('\\') && !decoded.includes('\0') && !decoded.includes('/');
}

function hasUnsafePathSegments(rawPath) {
  if (!rawPath) return false;
  if (/%(?:2e|2f|5c)/i.test(rawPath)) return true;
  let decoded = rawPath;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return true;
  }
  if (decoded.includes('\0')) return true;
  return decoded
    .split('/')
    .some((segment) => segment === '..' || segment.includes('\\'));
}

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  if (enforceHttps) {
    app.use((req, res, next) => {
      const forwardedProto = req.headers['x-forwarded-proto'];
      if (forwardedProto && forwardedProto !== 'https') {
        const host = req.headers.host;
        return res.redirect(301, `https://${host}${req.originalUrl}`);
      }
      return next();
    });
  }

  app.use(
    helmet({
      contentSecurityPolicy,
      crossOriginEmbedderPolicy: false,
    })
  );

  // General API ceiling per IP. Static assets and pages are deliberately not
  // counted: a single page view fetches a dozen files (styles, module scripts,
  // images), so counting them would lock out ordinary browsing.
  app.use(
    '/api',
    rateLimit({
      windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
      max: Number(process.env.RATE_LIMIT_MAX || 300),
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        success: false,
        error: { message: 'Too many requests. Please try again later.', code: 'RATE_LIMITED' },
      },
    })
  );

  const authLimiter = createAuthRateLimiter();
  const writeLimiter = createWriteRateLimiter();
  const analyticsLimiter = createAnalyticsRateLimiter();

  app.use(
    cors({
      origin: createCorsOriginValidator(),
      credentials: true,
    })
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.get('/health', (_req, res) => {
    res.status(200).json({
      success: true,
      message: 'Server is healthy',
    });
  });

  app.get('/ready', (_req, res) => {
    res.redirect(307, '/api/ready');
  });

  app.get('/home', (_req, res) => {
    res.redirect(301, '/');
  });

  // Browsers request /favicon.ico regardless of <link rel="icon">.
  app.get('/favicon.ico', (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800');
    res.sendFile(path.join(PUBLIC_DIR, 'assets', 'icons', 'icon-192.png'));
  });

  app.use('/api/auth', authLimiter);

  // Note: express-rate-limit keeps counters in process memory, so on a
  // serverless host each instance counts separately. It still throttles bursts
  // against a single instance (and fully protects Docker / VM deployments);
  // payment endpoints additionally enforce database-backed limits, and the
  // Vercel Firewall should carry the platform-wide rule (see DEPLOYMENT.md).
  app.use(
    [
      '/api/contact',
      '/api/quotes',
      '/api/portal/lookup',
      '/api/portal/clients',
      '/api/coupons/validate',
      '/api/work-orders',
      '/api/mpesa/stkpush',
    ],
    writeLimiter
  );
  app.use('/api/analytics', analyticsLimiter);

  app.use('/api', apiRoutes);

  app.get('/tracker/:orderId', (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'tracker.html'));
  });

  app.get('/pay/:invoiceId', (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'pay.html'));
  });

  app.get('/receipt/:invoiceId', (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'receipt.html'));
  });

  app.get('/calculator', (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'calculator.html'));
  });

  const PRIVATE_PATH_PATTERN = /^\/(?:node-backend|node_modules|tests|scripts|data|\.github|\.vercel)(?:\/|$)/i;
const PRIVATE_FILE_PATTERN = /^\/\.env/i;
const BLOCKED_ROOT_FILES = /^\/(?:app|server|package|package-lock|README|AGENTS|LICENSE)(?:\.|$)/i;
const PUBLIC_ASSET_EXTENSION = /\.(?:html?|css|js|mjs|webmanifest|json|png|jpe?g|gif|svg|ico|webp|avif|woff2?|ttf|xml|txt|map)$/i;

function renderNotFound(res) {
  const notFoundHtml = path.join(PUBLIC_DIR, '404.html');
  if (fs.existsSync(notFoundHtml)) {
    return res.status(404).sendFile(notFoundHtml);
  }
  return res.status(404).send('Page not found');
}

app.use((req, res, next) => {
  if (hasUnsafePathSegments(req.path)) return renderNotFound(res);

  if (PRIVATE_PATH_PATTERN.test(req.path) || PRIVATE_FILE_PATTERN.test(req.path) || BLOCKED_ROOT_FILES.test(req.path)) {
    return renderNotFound(res);
  }

  if (req.path.includes('.')) {
    const extensionMatch = PUBLIC_ASSET_EXTENSION.test(req.path);
    if (!extensionMatch) return renderNotFound(res);
  }

  return next();
});

  // Keep the service worker fresh (Vercel header rules only apply to static
  // serving; here everything flows through the Express function).
  app.use('/sw.js', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    next();
  });

  // On Vercel every static file is served through this function, so the CDN
  // only caches what we tell it to (s-maxage). Fingerprint-free assets get a
  // short browser TTL with a longer edge TTL plus stale-while-revalidate, so a
  // deploy propagates within minutes while repeat visits are served from cache.
  const staticCacheControl = (filePath) => {
    if (/[\\/]sw\.js$/.test(filePath)) return 'no-cache, no-store, must-revalidate';
    if (/[\\/]assets[\\/]/.test(filePath) || /\.(?:png|jpe?g|gif|svg|ico|webp|avif|woff2?|ttf)$/i.test(filePath)) {
      return 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400';
    }
    if (/\.(?:css|js|mjs|json|webmanifest|xml|txt)$/i.test(filePath)) {
      return 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400';
    }
    return 'public, max-age=0, s-maxage=300, stale-while-revalidate=600';
  };

  app.use(
    express.static(PUBLIC_DIR, {
      extensions: ['html', 'htm'],
      index: 'index.html',
      dotfiles: 'ignore',
      setHeaders(res, filePath) {
        res.setHeader('Cache-Control', staticCacheControl(filePath));
      },
    })
  );

  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'API route not found',
          code: 'ROUTE_NOT_FOUND',
        },
      });
    }

    const sanitizedPath = req.path.replace(/^\//, '').replace(/\/$/, '');

    if (!isSafePagePath(sanitizedPath)) {
      const notFoundHtml = path.join(PUBLIC_DIR, '404.html');
      if (fs.existsSync(notFoundHtml)) {
        return res.status(404).sendFile(notFoundHtml);
      }
      return res.status(404).send('Page not found');
    }

    const candidateHtml = path.join(PUBLIC_DIR, `${sanitizedPath}.html`);

    if (sanitizedPath && fs.existsSync(candidateHtml) && fs.statSync(candidateHtml).isFile()) {
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');
      return res.sendFile(candidateHtml);
    }

    const notFoundHtml = path.join(PUBLIC_DIR, '404.html');
    if (fs.existsSync(notFoundHtml)) {
      return res.status(404).sendFile(notFoundHtml);
    }

    return res.status(404).send('Page not found');
  });

  app.use((err, _req, res, _next) => {
    console.error('[Server Error]', err);

    const statusCode = err.statusCode || 500;
    // Only errors we raised deliberately (4xx / 503 with a statusCode) carry
    // user-facing text; unexpected failures must not leak internals.
    const message = err.statusCode && err.message ? err.message : 'Internal server error';

    res.status(statusCode).json({
      success: false,
      error: {
        message,
        code: err.code || 'INTERNAL_SERVER_ERROR',
      },
    });
  });

  return app;
}

export function startServer() {
  if (isProduction && allowedOrigins.length === 0) {
    console.warn(
      '[startup] CORS_ORIGIN is not set in production. Browser cross-origin requests will be denied; ' +
      'set CORS_ORIGIN to a comma-separated allowlist of your site origins.'
    );
  }
  const app = createApp();
  return app.listen(PORT, HOST, () => {
    console.log(`Lawn Craft server running on http://${HOST}:${PORT}`);
  });
}
