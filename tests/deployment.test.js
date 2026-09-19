import test from 'node:test';
import assert from 'node:assert/strict';
import { resetRuntimeEnv } from './helpers/env.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let server;
let baseUrl;
let app;
let createApp;

test.before(async () => {
  resetRuntimeEnv({ ENABLE_ACCOUNT_AUTH: 'true' });
  process.env.PORTAL_STORE_FILE = path.resolve('data', 'test-deployment.json');
  fs.rmSync(process.env.PORTAL_STORE_FILE, { force: true });
  process.env.NODE_ENV = 'development';

  const appModule = await import('../app.js');
  createApp = appModule.createApp;

  app = createApp();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  if (!server) return;
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const body = isJson ? await response.json().catch(() => null) : await response.text();
  return { response, body, isJson };
}

const API_ENDPOINTS = [
  { method: 'GET',  path: '/health',                                   expect: 200 },
  { method: 'GET',  path: '/ready',                                    expect: 200 },
  { method: 'GET',  path: '/api/health',                               expect: 200 },
  { method: 'GET',  path: '/api/ready',                                expect: 200 },
  { method: 'GET',  path: '/api/system/status',                        expect: 200 },
  { method: 'POST', path: '/api/analytics',      body: { page: '/' },  expect: 200 },
  { method: 'POST', path: '/api/contact',
    body: { name: 'Coverage', email: 'c@test.com', phone: '+254700000000' }, expect: 201 },
  { method: 'POST', path: '/api/quotes',
    body: { full_name: 'Coverage', email: 'q@test.com', phone: '+254700000001' }, expect: 201 },
  { method: 'POST', path: '/api/portal/lookup',
    body: { identifier: 'definitely.not.found@test.com' },                            expect: 404 },
  { method: 'POST', path: '/api/portal/clients',
    body: { name: 'Coverage Client', phone: '+254700000002' },              expect: 201 },
  { method: 'POST', path: '/api/work-orders',
    body: { client_name: 'Coverage', phone: '+254700000003' },              expect: 201 },
  { method: 'GET',  path: '/api/work-orders/nonexistent',                   expect: 404 },
  { method: 'GET',  path: '/api/mpesa/reconcile',                           expect: 200 },
  { method: 'POST', path: '/api/mpesa/reconcile',                           expect: 200 },
  { method: 'POST', path: '/api/mpesa/stkpush',
    body: { phone: '+254700000004' },                                       expect: 503 },
  { method: 'GET',  path: '/api/invoices/nonexistent',                      expect: 404 },
  { method: 'POST', path: '/api/coupons/validate', body: { code: 'X' },   expect: 400 },
  { method: 'POST', path: '/api/auth/register',
    body: { email: 'cov@test.com', password: 'secret123' },                expect: 503 },
  { method: 'POST', path: '/api/auth/login',
    body: { email: 'cov@test.com', password: 'secret123' },                expect: 503 },
  { method: 'GET',  path: '/api/auth/me',                                  expect: 503 },
];

test('every frontend-called API endpoint exists and returns a structured response', async () => {
  for (const ep of API_ENDPOINTS) {
    const options = {
      method: ep.method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (ep.body) options.body = JSON.stringify(ep.body);

    const { response, body, isJson } = await request(ep.path, options);

    assert.equal(response.status, ep.expect,
      `${ep.method} ${ep.path} → expected ${ep.expect}, got ${response.status}`);
    assert.equal(isJson, true,
      `${ep.method} ${ep.path} must return JSON, got ${typeof body}`);
  }
});

test('frontend source files do not reference unregistered API paths', async () => {
  const sourceFiles = [
    'public/script.js',
    'public/auth.js',
    'public/portal.js',
    'public/tracker.html',
    'public/pay.html',
    'public/receipt.html',
  ];
  const rootDir = path.resolve(__dirname, '..');
  const apiEndpointPattern = /(['"`])\/api\/([\w/$:{}()\-.]+)/g;
  const paramPlaceholderPattern = /\$\{[^}]+\}/g;
  const routeParamPattern = /:[A-Za-z]+/g;

  const referencedEndpoints = new Set();

  for (const file of sourceFiles) {
    const filePath = path.join(rootDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    let match;
    while ((match = apiEndpointPattern.exec(content))) {
      const raw = match[2];
      const normalized = raw
        .replace(paramPlaceholderPattern, ':id')
        .split('?')[0];
      referencedEndpoints.add(`/api/${normalized}`);
    }
  }

  assert.ok(referencedEndpoints.size > 0, 'Must detect frontend API references');

  const registered = getRegisteredApiPaths();
  for (const ref of referencedEndpoints) {
    const canonicalRef = ref.replace(/\/+/g, '/').replace(/:id/g, ':pid');
    const found = registered.some(r => {
      const canonicalReg = r.replace(/:orderId|:invoiceId|:checkoutRequestId|:token/g, ':pid');
      return canonicalReg === canonicalRef;
    });
    assert.ok(found,
      `Frontend references ${ref} which must be registered in the Express API router`);
  }
});

function getRegisteredApiPaths() {
  const paths = [];

  for (const layer of app._router.stack) {
    if (!layer.handle?.stack || !layer.regexp?.toString().includes('/api')) continue;
    for (const routeLayer of layer.handle.stack) {
      if (routeLayer.route) paths.push('/api' + routeLayer.route.path);
    }
  }

  return paths.map(p => p.replace(/\/+/g, '/'));
}