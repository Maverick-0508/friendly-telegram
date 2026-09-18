import test from 'node:test';
import assert from 'node:assert/strict';
import { startMockDaraja } from './helpers/mock-daraja.js';
import {
  getMpesaConfig,
  isMpesaConfigured,
  normalizeMpesaPhone,
  darajaTimestamp,
  buildCallbackUrl,
  verifyCallbackToken,
  getAccessToken,
  initiateStkPush,
} from '../node-backend/services/mpesa.js';

const MPESA_ENV_KEYS = [
  'MPESA_ENVIRONMENT',
  'MPESA_BASE_URL',
  'MPESA_CONSUMER_KEY',
  'MPESA_CONSUMER_SECRET',
  'MPESA_SHORTCODE',
  'MPESA_PASSKEY',
  'MPESA_CALLBACK_URL',
  'MPESA_CALLBACK_TOKEN',
  'MPESA_TRANSACTION_TYPE',
  'MPESA_ACCOUNT_REFERENCE',
];

let mock;
const originalEnv = {};

test.before(async () => {
  for (const key of MPESA_ENV_KEYS) originalEnv[key] = process.env[key];
  mock = await startMockDaraja();
  process.env.MPESA_ENVIRONMENT = 'sandbox';
  process.env.MPESA_BASE_URL = mock.baseUrl;
  process.env.MPESA_CONSUMER_KEY = 'test-consumer-key';
  process.env.MPESA_CONSUMER_SECRET = 'test-consumer-secret';
  process.env.MPESA_SHORTCODE = '174379';
  process.env.MPESA_PASSKEY = 'test-passkey';
  process.env.MPESA_CALLBACK_URL = 'https://example.com/api/mpesa/callback';
  process.env.MPESA_CALLBACK_TOKEN = 'test-callback-token';
});

test.after(async () => {
  for (const key of MPESA_ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  if (mock) await mock.close();
});

test('normalizeMpesaPhone accepts Kenyan formats and rejects others', () => {
  assert.equal(normalizeMpesaPhone('0712345678'), '254712345678');
  assert.equal(normalizeMpesaPhone('+254 712 345 678'), '254712345678');
  assert.equal(normalizeMpesaPhone('254712345678'), '254712345678');
  assert.equal(normalizeMpesaPhone('712345678'), '254712345678');
  assert.equal(normalizeMpesaPhone('0112345678'), '254112345678');
  assert.equal(normalizeMpesaPhone('+1 555 010 0100'), null);
  assert.equal(normalizeMpesaPhone('12345'), null);
  assert.equal(normalizeMpesaPhone(''), null);
  assert.equal(normalizeMpesaPhone(null), null);
});

test('darajaTimestamp formats the current time in Africa/Nairobi', () => {
  assert.equal(darajaTimestamp(new Date('2026-01-01T09:00:00Z')), '20260101120000');
  assert.equal(darajaTimestamp(new Date('2026-01-01T21:30:05Z')), '20260102003005');
});

test('buildCallbackUrl appends the shared secret when configured', () => {
  assert.equal(
    buildCallbackUrl({ callbackUrl: 'https://example.com/api/mpesa/callback', callbackToken: 'abc' }),
    'https://example.com/api/mpesa/callback/abc'
  );
  assert.equal(
    buildCallbackUrl({ callbackUrl: 'https://example.com/api/mpesa/callback/', callbackToken: '' }),
    'https://example.com/api/mpesa/callback'
  );
});

test('verifyCallbackToken uses an exact comparison', () => {
  const config = { callbackToken: 'secret-token' };
  assert.equal(verifyCallbackToken('secret-token', config), true);
  assert.equal(verifyCallbackToken('wrong-token', config), false);
  assert.equal(verifyCallbackToken('', config), false);
  assert.equal(verifyCallbackToken(undefined, config), false);
  assert.equal(verifyCallbackToken('anything', { callbackToken: '' }), true);
});

test('isMpesaConfigured reflects the required credentials', () => {
  assert.equal(isMpesaConfigured(), true);
  assert.equal(getMpesaConfig().environment, 'sandbox');

  const saved = process.env.MPESA_PASSKEY;
  delete process.env.MPESA_PASSKEY;
  assert.equal(isMpesaConfigured(), false);
  process.env.MPESA_PASSKEY = saved;
  assert.equal(isMpesaConfigured(), true);
});

test('getAccessToken returns a bearer token from Daraja', async () => {
  const token = await getAccessToken();
  assert.equal(token, 'mock-access-token');
});

test('initiateStkPush sends a correctly signed request and returns a CheckoutRequestID', async () => {
  const response = await initiateStkPush({
    phone: '0712345678',
    amount: 4500,
    accountReference: 'INVOICE-123456789',
    description: 'Lawn payment',
  });

  assert.equal(response.ResponseCode, '0');
  assert.ok(response.CheckoutRequestID);

  const pushRequest = mock.requests.find((r) => r.url.startsWith('/mpesa/stkpush/v1/processrequest'));
  assert.ok(pushRequest, 'STK push request must reach Daraja');

  const payload = JSON.parse(pushRequest.body);
  assert.equal(payload.BusinessShortCode, '174379');
  assert.equal(payload.PhoneNumber, '254712345678');
  assert.equal(payload.PartyA, '254712345678');
  assert.equal(payload.PartyB, '174379');
  assert.equal(payload.Amount, 4500);
  assert.ok(payload.AccountReference.length <= 12, 'AccountReference must be <= 12 chars');
  assert.ok(payload.TransactionDesc.length <= 13, 'TransactionDesc must be <= 13 chars');
  assert.equal(payload.CallBackURL, 'https://example.com/api/mpesa/callback/test-callback-token');

  const expectedPassword = Buffer.from(`174379test-passkey${payload.Timestamp}`).toString('base64');
  assert.equal(payload.Password, expectedPassword);
});

test('initiateStkPush rejects invalid phone numbers and amounts', async () => {
  await assert.rejects(
    () => initiateStkPush({ phone: '+1 555 010 0100', amount: 100 }),
    (err) => err.code === 'INVALID_PHONE' && err.statusCode === 400
  );

  await assert.rejects(
    () => initiateStkPush({ phone: '0712345678', amount: 0 }),
    (err) => err.code === 'INVALID_AMOUNT' && err.statusCode === 400
  );
});

test('initiateStkPush surfaces Daraja errors', async () => {
  const failing = await startMockDaraja({ pushShouldFail: true });
  const previousBase = process.env.MPESA_BASE_URL;
  process.env.MPESA_BASE_URL = failing.baseUrl;
  try {
    await assert.rejects(
      () => initiateStkPush({ phone: '0712345678', amount: 100 }),
      (err) => err.code === 'STK_PUSH_FAILED'
    );
  } finally {
    process.env.MPESA_BASE_URL = previousBase;
    await failing.close();
  }
});
