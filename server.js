import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import apiRoutes from './node-backend/routes/api.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        return callback(null, true);
      }
      return callback(null, true); // Allow all in dev/preview environment
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Health checks
app.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is healthy',
  });
});

// Home alias redirect
app.get('/home', (_req, res) => {
  res.redirect(301, '/');
});

// API routes
app.use('/api', apiRoutes);

// Dedicated dynamic client hub routes
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

// Static file serving with clean URLs
app.use(express.static(__dirname, {
  extensions: ['html', 'htm'],
  index: 'index.html',
}));

// Route fallback for clean URLs
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      success: false,
      error: {
        message: 'API route not found',
        code: 'ROUTE_NOT_FOUND',
      },
    });
  }

  // Check if a matching .html file exists
  const sanitizedPath = req.path.replace(/^\//, '').replace(/\/$/, '');
  const candidateHtml = path.join(__dirname, `${sanitizedPath}.html`);

  if (sanitizedPath && fs.existsSync(candidateHtml) && fs.statSync(candidateHtml).isFile()) {
    return res.sendFile(candidateHtml);
  }

  const notFoundHtml = path.join(__dirname, '404.html');
  if (fs.existsSync(notFoundHtml)) {
    return res.status(404).sendFile(notFoundHtml);
  }

  res.status(404).send('Page not found');
});

// Global error handler
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

app.listen(PORT, HOST, () => {
  console.log(`Lawn Craft server running on http://${HOST}:${PORT}`);
});
