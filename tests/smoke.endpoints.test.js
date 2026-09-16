import test from 'node:test';
import assert from 'node:assert/strict';

import { createApp } from '../app.js';

let server;
let baseUrl;

test.before(async () => {
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
});

async function check(path, method = 'GET') {
  const response = await fetch(`${baseUrl}${path}`, { method });
  assert.equal(response.ok, true, `${method} ${path} should be successful`);
}

test('core endpoints are reachable', async () => {
  await check('/health');
  await check('/api/health');
  await check('/api/system/status');
  await check('/api/ready');
  await check('/');
  await check('/contact');
  await check('/services');
});
