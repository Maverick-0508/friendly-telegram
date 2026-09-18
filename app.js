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
  ],
  connectSrc: ["'self'", 'https://divine-smoke-7e2b.verbosedoodle.workers.dev'],
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

function createWriteRateLimiter() {
  return rateLimit({
    windowMs: Number(process.env.WRITE_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
    max: Number(process.env.WRITE_RATE_LIMIT_MAX || 50),
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

  app.use(
    rateLimit({
      windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
      max: Number(process.env.RATE_LIMIT_MAX || 200),
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  const authLimiter = createAuthRateLimiter();
  const writeLimiter = createWriteRateLimiter();

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

  app.use('/api/auth', authLimiter);

  app.use(
    ['/api/contact', '/api/quotes', '/api/portal/lookup', '/api/portal/clients', '/api/coupons/validate'],
    writeLimiter
  );

  app.use('/api', apiRoutes);

  app.get('/tracker/:orderId', (_req, res) => {
    res.sendFile(path.join(__dirname, 'tracker.html'));
  });

  app.get('/pay/:invoiceId', (_req, res) => {
    res.sendFile(path.join(__dirname, 'pay.html'));
  });

  app.get('/receipt/:invoiceId', (_req, res) => {
    res.sendFile(path.join(__dirname, 'receipt.html'));
  });

  app.get('/calculator', (_req, res) => {
    res.sendFile(path.join(__dirname, 'calculator.html'));
  });

  const PRIVATE_PATH_PATTERN = /^\/(?:node-backend|node_modules|tests|data|\.github|\.vercel)(?:\/|$)/i;
const PRIVATE_FILE_PATTERN = /^\/\.env/i;
const BLOCKED_ROOT_FILES = /^\/(?:app|server|package|package-lock|README|AGENTS|LICENSE)(?:\.|$)/i;
const PUBLIC_ASSET_EXTENSION = /\.(?:html?|css|js|mjs|webmanifest|json|png|jpe?g|gif|svg|ico|webp|avif|woff2?|ttf|xml|txt|map)$/i;

function renderNotFound(res) {
  const notFoundHtml = path.join(__dirname, '404.html');
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

  app.use(
    express.static(__dirname, {
      extensions: ['html', 'htm'],
      index: 'index.html',
      dotfiles: 'ignore',
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
      const notFoundHtml = path.join(__dirname, '404.html');
      if (fs.existsSync(notFoundHtml)) {
        return res.status(404).sendFile(notFoundHtml);
      }
      return res.status(404).send('Page not found');
    }

    const candidateHtml = path.join(__dirname, `${sanitizedPath}.html`);

    if (sanitizedPath && fs.existsSync(candidateHtml) && fs.statSync(candidateHtml).isFile()) {
      return res.sendFile(candidateHtml);
    }

    const notFoundHtml = path.join(__dirname, '404.html');
    if (fs.existsSync(notFoundHtml)) {
      return res.status(404).sendFile(notFoundHtml);
    }

    return res.status(404).send('Page not found');
  });

  app.use((err, _req, res, _next) => {
    console.error('[Server Error]', err);

    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal server error';

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
