import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';

const TEST_PORT = 3101;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const MAX_STARTUP_RETRIES = 20;
const RETRY_DELAY_MS = 250;
const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 2000;

let serverProcess;

async function waitForServerReady() {
  for (let attempt = 0; attempt < MAX_STARTUP_RETRIES; attempt += 1) {
    try {
      const response = await fetch(`${BASE_URL}/health`);
      if (response.ok) {
        return;
      }
    } catch (_error) {
      // Server has not started yet.
    }

    await delay(RETRY_DELAY_MS);
  }

  throw new Error('Backend server did not start in time.');
}

test.before(async () => {
  serverProcess = spawn('node', ['server.js'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      NODE_ENV: 'test',
    },
    stdio: 'ignore',
  });

  await waitForServerReady();
});

test.after(async () => {
  if (!serverProcess || serverProcess.killed || serverProcess.exitCode !== null) {
    return;
  }

  serverProcess.kill('SIGTERM');

  const raceResult = await Promise.race([
    once(serverProcess, 'exit').then(() => 'exited'),
    delay(GRACEFUL_SHUTDOWN_TIMEOUT_MS).then(() => 'timeout'),
  ]);

  if (raceResult === 'timeout' && serverProcess.exitCode === null) {
    serverProcess.kill('SIGKILL');
    await once(serverProcess, 'exit');
  }
});

test('GET /health returns service status', async () => {
  const response = await fetch(`${BASE_URL}/health`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.message, 'Server is healthy');
});

test('POST /api/contact validates payload and returns field errors', async () => {
  const response = await fetch(`${BASE_URL}/api/contact`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      name: '',
      email: 'invalid',
      phone: '',
      message: 'short',
    }),
  });

  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.success, false);
  assert.equal(body.error.code, 'VALIDATION_ERROR');
  assert.ok(body.error.fields.name);
  assert.ok(body.error.fields.email);
  assert.ok(body.error.fields.phone);
  assert.ok(body.error.fields.message);
});
