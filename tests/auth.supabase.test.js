import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import fs from 'node:fs';
import path from 'node:path';

let fakeSupabase;
let fakeAuthPort;

function startFakeSupabase() {
  const users = new Map();
  let nextId = 1;

  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');

    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      const url = new URL(req.url, 'http://localhost');
      const path = url.pathname;
      let body = {};
      try { body = raw ? JSON.parse(raw) : {}; } catch {}

      const send = (status, payload) => {
        res.statusCode = status;
        res.end(JSON.stringify(payload));
      };

      if (path.startsWith('/rest/v1/')) {
        return send(200, []);
      }

      if (req.method === 'POST' && path === '/auth/v1/admin/users') {
        if (users.has(body.email)) {
          return send(409, { msg: 'Email already registered', error_description: 'Email already registered' });
        }
        const id = `fake_user_${nextId++}`;
        users.set(body.email, {
          id,
          email: body.email,
          password: body.password,
          fullName: body.user_metadata?.full_name || null,
        });
        return send(200, {
          id,
          email: body.email,
          user_metadata: { full_name: body.user_metadata?.full_name || null },
          created_at: new Date().toISOString(),
        });
      }

      if (req.method === 'POST' && path === '/auth/v1/token') {
        const user = users.get(body.email);
        if (!user || user.password !== body.password) {
          return send(400, { msg: 'Invalid login credentials', error_description: 'Invalid login credentials' });
        }
        return send(200, {
          access_token: `at_${user.id}`,
          refresh_token: `rt_${user.id}`,
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: {
            id: user.id,
            email: user.email,
            user_metadata: { full_name: user.fullName },
          },
        });
      }

      if (req.method === 'GET' && path === '/auth/v1/user') {
        const auth = req.headers.authorization || '';
        const token = auth.replace(/^Bearer\s+/i, '');
        const user = Array.from(users.values()).find(u => `at_${u.id}` === token);
        if (!user) {
          return send(401, { msg: 'Invalid token' });
        }
        return send(200, {
          id: user.id,
          email: user.email,
          user_metadata: { full_name: user.fullName },
          created_at: new Date().toISOString(),
        });
      }

      return send(404, { msg: 'not found' });
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({
      server,
      port: server.address().port,
    }));
  });
}

let createApp;
let server;
let baseUrl;

test.before(async () => {
  fakeSupabase = await startFakeSupabase();
  fakeAuthPort = fakeSupabase.port;

  process.env.PORTAL_STORE_FILE = path.resolve('data', 'test-auth.supabase.json');
  fs.rmSync(process.env.PORTAL_STORE_FILE, { force: true });
  process.env.NODE_ENV = 'development';
  process.env.SUPABASE_URL = `http://127.0.0.1:${fakeAuthPort}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  delete process.env.SUPABASE_ANON_KEY;
  delete process.env.DATABASE_URL;
  delete process.env.CORS_ORIGIN;

  const appModule = await import('../app.js');
  createApp = appModule.createApp;

  const app = createApp();
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
  if (fakeSupabase) {
    await new Promise((resolve) => fakeSupabase.server.close(resolve));
  }
});

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json().catch(() => null);
  return { response, body };
}

function post(path, payload, headers = { 'Content-Type': 'application/json' }) {
  return request(path, { method: 'POST', headers, body: JSON.stringify(payload) });
}

test('register creates a user through the auth provider', async () => {
  const { response, body } = await post('/api/auth/register', {
    email: 'register@example.com',
    password: 'secret123',
    fullName: 'Register User',
  });
  assert.equal(response.status, 201);
  assert.equal(body.success, true);
  assert.equal(body.user.email, 'register@example.com');
  assert.equal(body.user.fullName, 'Register User');
  assert.ok(body.user.id);
  assert.equal(body.session, undefined, 'register must not return a session token');
});

test('login returns a session token when credentials are valid', async () => {
  const { response, body } = await post('/api/auth/login', {
    email: 'register@example.com',
    password: 'secret123',
  });
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.ok(body.session.access_token);
  assert.ok(body.session.refresh_token);
});

test('login with invalid credentials is rejected', async () => {
  const { response, body } = await post('/api/auth/login', {
    email: 'register@example.com',
    password: 'wrong-password',
  });
  assert.equal(response.status, 401);
  assert.equal(body.success, false);
});

test('me returns the authenticated user for a valid token', async () => {
  const loginRes = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'register@example.com', password: 'secret123' }),
  });
  const token = loginRes.body.session.access_token;

  const me = await request('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(me.response.status, 200);
  assert.equal(me.body.user.email, 'register@example.com');
});

test('me rejects invalid tokens', async () => {
  const me = await request('/api/auth/me', {
    headers: { Authorization: 'Bearer bogus-token' },
  });
  assert.equal(me.response.status, 401);
  assert.equal(me.body.success, false);
});

test('readiness reflects the reachable auth provider in development', async () => {
  const { response, body } = await request('/api/ready');
  assert.equal(response.status, 200);
  assert.equal(body.checks.auth_available, true);
  assert.equal(body.checks.persistence_available, true);
});