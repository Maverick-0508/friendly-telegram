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

function createCorsOriginValidator() {
  return function origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  };
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
      contentSecurityPolicy: false,
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

  app.use(
    express.static(__dirname, {
      extensions: ['html', 'htm'],
      index: 'index.html',
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
  const app = createApp();
  return app.listen(PORT, HOST, () => {
    console.log(`Lawn Craft server running on http://${HOST}:${PORT}`);
  });
}
