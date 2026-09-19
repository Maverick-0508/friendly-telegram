import test from 'node:test';
import assert from 'node:assert/strict';
import { resetRuntimeEnv } from './helpers/env.js';

let server;
let baseUrl;

test.before(async () => {
  resetRuntimeEnv();
  process.env.NODE_ENV = 'production';

  const appModule = await import('../app.js');
  const app = appModule.createApp();
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

async function json(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json().catch(() => null);
  return { response, body };
}

test('liveness endpoint stays up even when providers are down', async () => {
  const { response, body } = await json('/health');
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
});

test('static site still serves in production', async () => {
  const home = await fetch(`${baseUrl}/`);
  assert.equal(home.status, 200);
  const text = await home.text();
  assert.match(text, /<!DOCTYPE html>/i);
});

test('readiness fails fast in production when no providers are available', async () => {
  const { response, body } = await json('/api/ready');
  assert.equal(response.status, 503);
  assert.equal(body.ready, false);
  assert.equal(body.error.code, 'READINESS_FAILED');
  assert.equal(body.checks.auth_configured, false);
  assert.equal(body.checks.persistence_available, false);
});

test('auth and persistence endpoints fail fast in production', async () => {
  const login = await json('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'user@example.com', password: 'secret123' }),
  });
  assert.equal(login.response.status, 503);
  assert.equal(login.body.error.code, 'SERVICE_UNAVAILABLE');

  const contact = await json('/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Prod Client', email: 'prod@example.com', phone: '+254700000001' }),
  });
  assert.equal(contact.response.status, 503);
  assert.equal(contact.body.error.code, 'PERSISTENCE_UNAVAILABLE');

  const portalPaths = [
    { path: '/api/portal/lookup', method: 'POST', payload: { identifier: '0700000001' } },
    { path: '/api/work-orders', method: 'POST', payload: { client_name: 'X', phone: '0700000001' } },
    { path: '/api/mpesa/stkpush', method: 'POST', payload: { phone: '0700000001' } },
    { path: '/api/invoices/nope', method: 'GET', payload: undefined },
  ];

  for (const { path, method, payload } of portalPaths) {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const body = await res.json().catch(() => null);
    assert.equal(res.status, 503, `${method} ${path} must fail fast in production`);
    assert.equal(body.error.code, 'PERSISTENCE_UNAVAILABLE');
  }
});

test('HTTPS is enforced at the edge in production', async () => {
  const response = await fetch(`${baseUrl}/`, {
    headers: { 'x-forwarded-proto': 'http' },
    redirect: 'manual',
  });
  assert.equal(response.status, 301);
  assert.match(response.headers.get('location'), /^https:\/\//);
});

test('production responses carry HSTS and CSP security headers', async () => {
  const { response } = await json('/api/health');
  assert.equal(response.headers.get('strict-transport-security').startsWith('max-age='), true);
  assert.ok(response.headers.get('content-security-policy'));
});