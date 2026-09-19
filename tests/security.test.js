import test from 'node:test';
import assert from 'node:assert/strict';
import { resetRuntimeEnv } from './helpers/env.js';
import http from 'node:http';

let createApp;

test.before(async () => {
  resetRuntimeEnv();
  process.env.CORS_ORIGIN = 'https://allowed.example.com';
  process.env.AUTH_RATE_LIMIT_MAX = '5';

  const appModule = await import('../app.js');
  createApp = appModule.createApp;
});

function startApp() {
  return new Promise((resolve) => {
    const server = createApp().listen(0, () => resolve({
      server,
      baseUrl: `http://127.0.0.1:${server.address().port}`,
    }));
  });
}

async function json(path, options = {}, baseUrl) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json().catch(() => null);
  return { response, body };
}

test('CORS: same-origin and allowlisted origins pass, foreign origins are blocked', async () => {
  const { server, baseUrl } = await startApp();
  try {
    const noOrigin = await json('/health', {}, baseUrl);
    assert.equal(noOrigin.response.status, 200);

    const allowed = await json('/health', {
      headers: { Origin: 'https://allowed.example.com' },
    }, baseUrl);
    assert.equal(allowed.response.status, 200);

    const foreign = await json('/health', {
      headers: { Origin: 'https://evil.example.com' },
    }, baseUrl);
    assert.equal(foreign.response.status, 403);
    assert.equal(foreign.body.error.code, 'CORS_BLOCKED');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('security headers are applied to responses', async () => {
  const { server, baseUrl } = await startApp();
  try {
    const { response } = await json('/health', {}, baseUrl);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    const csp = response.headers.get('content-security-policy');
    assert.ok(csp, 'Content-Security-Policy header must be present');
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /frame-ancestors 'none'/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('path traversal payloads are rejected with 404', async () => {
  const { server, baseUrl } = await startApp();
  try {
    for (const traversal of ['/%2e%2e/app.js', '/..%2f..%2fserver.js', '/%2e%2e/%2e%2e/package.json']) {
      const response = await fetch(`${baseUrl}${traversal}`);
      assert.equal(response.status, 404, `${traversal} should be rejected`);
      const text = await response.text();
      assert.ok(!text.includes('import dotenv'), `traversal must not leak file contents`);
    }

    for (const traversal of ['/%2e%2e/app.js', '/../app.js', '/..%2fserver.js', '/.env']) {
      const status = await rawRequest(baseUrl, traversal);
      assert.equal(status, 404, `raw request ${traversal} should be rejected`);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

function rawRequest(baseUrl, path) {
  return new Promise((resolve, reject) => {
    const { port } = new URL(baseUrl);
    const req = http.request(
      { host: '127.0.0.1', port, path, method: 'GET' },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

test('auth endpoints fail closed when the auth provider is not configured', async () => {
  const { server, baseUrl } = await startApp();
  try {
    const register = await json('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: 'secret123', fullName: 'Test User' }),
    }, baseUrl);
    assert.equal(register.response.status, 503);
    assert.equal(register.body.error.code, 'SERVICE_UNAVAILABLE');

    const me = await json('/api/auth/me', {
      headers: { Authorization: 'Bearer fake-token' },
    }, baseUrl);
    assert.equal(me.response.status, 503);
    assert.equal(me.body.error.code, 'SERVICE_UNAVAILABLE');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('auth rate limiter rejects bursts of failed attempts', async () => {
  process.env.AUTH_RATE_LIMIT_MAX = '2';
  const { server, baseUrl } = await startApp();
  try {
    const attempt = () => json('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: 'wrong-password' }),
    }, baseUrl);

    const first = await attempt();
    assert.equal(first.response.status, 503);

    const second = await attempt();
    assert.equal(second.response.status, 503);

    const limited = await attempt();
    assert.equal(limited.response.status, 429);
  } finally {
    process.env.AUTH_RATE_LIMIT_MAX = '5';
    await new Promise((resolve) => server.close(resolve));
  }
});