import crypto from 'node:crypto';

const DEFAULT_TIMEOUT_MS = 20000;
const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000;

function env(name) {
  const value = process.env[name];
  return value === undefined || value === null ? '' : String(value).trim();
}

export function getMpesaConfig() {
  const environment = (env('MPESA_ENVIRONMENT') || 'sandbox').toLowerCase();
  const defaultBase =
    environment === 'production'
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke';

  return {
    environment,
    baseUrl: (env('MPESA_BASE_URL') || defaultBase).replace(/\/+$/, ''),
    consumerKey: env('MPESA_CONSUMER_KEY'),
    consumerSecret: env('MPESA_CONSUMER_SECRET'),
    shortcode: env('MPESA_SHORTCODE'),
    passkey: env('MPESA_PASSKEY'),
    callbackUrl: env('MPESA_CALLBACK_URL'),
    callbackToken: env('MPESA_CALLBACK_TOKEN'),
    transactionType: env('MPESA_TRANSACTION_TYPE') || 'CustomerPayBillOnline',
    accountReference: env('MPESA_ACCOUNT_REFERENCE') || 'LAWNCRAFT',
    timeoutMs: Number(env('MPESA_HTTP_TIMEOUT_MS') || DEFAULT_TIMEOUT_MS),
  };
}

export function isMpesaConfigured() {
  const c = getMpesaConfig();
  return Boolean(
    c.consumerKey &&
      c.consumerSecret &&
      c.shortcode &&
      c.passkey &&
      c.callbackUrl
  );
}

export function mpesaError(message, code = 'MPESA_ERROR', statusCode = 502) {
  const err = new Error(message);
  err.code = code;
  err.statusCode = statusCode;
  return err;
}

function assertMpesaConfigured() {
  if (!isMpesaConfigured()) {
    throw mpesaError(
      'M-Pesa is not configured. Set MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE, MPESA_PASSKEY and MPESA_CALLBACK_URL.',
      'MPESA_NOT_CONFIGURED',
      503
    );
  }
}

/** Normalize a Kenyan mobile number to the 2547XXXXXXXX / 2541XXXXXXXX form Daraja expects. */
export function normalizeMpesaPhone(raw) {
  if (raw === undefined || raw === null) return null;
  let digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('0') && digits.length === 10) {
    digits = `254${digits.slice(1)}`;
  } else if (/^[71]\d{8}$/.test(digits)) {
    digits = `254${digits}`;
  }

  if (!/^254[71]\d{8}$/.test(digits)) return null;
  return digits;
}

/** Daraja requires YYYYMMDDHHmmss in Africa/Nairobi local time. */
export function darajaTimestamp(date = new Date()) {
  const nairobi = new Date(date.getTime() + NAIROBI_OFFSET_MS);
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${nairobi.getUTCFullYear()}` +
    `${pad(nairobi.getUTCMonth() + 1)}` +
    `${pad(nairobi.getUTCDate())}` +
    `${pad(nairobi.getUTCHours())}` +
    `${pad(nairobi.getUTCMinutes())}` +
    `${pad(nairobi.getUTCSeconds())}`
  );
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw mpesaError('M-Pesa request timed out.', 'MPESA_TIMEOUT', 504);
    }
    throw mpesaError(`Unable to reach the M-Pesa API: ${err.message}`, 'MPESA_UNREACHABLE', 502);
  } finally {
    clearTimeout(timer);
  }
}

export function buildCallbackUrl(config) {
  const base = String(config.callbackUrl || '').replace(/\/+$/, '');
  if (!config.callbackToken) return base;
  return `${base}/${encodeURIComponent(config.callbackToken)}`;
}

export async function getAccessToken(config = getMpesaConfig()) {
  assertMpesaConfigured();
  const credentials = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString('base64');
  const res = await fetchWithTimeout(
    `${config.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
    { method: 'GET', headers: { Authorization: `Basic ${credentials}` } },
    config.timeoutMs
  );

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }

  if (!res.ok || !data.access_token) {
    throw mpesaError(
      data.errorMessage || data.error || 'Failed to obtain an M-Pesa access token.',
      'MPESA_AUTH_FAILED',
      502
    );
  }

  return data.access_token;
}

/**
 * Initiate a Lipa Na M-Pesa Online (STK Push) request.
 * Returns the raw Daraja response; CheckoutRequestID identifies the transaction.
 */
export async function initiateStkPush({
  phone,
  amount,
  accountReference,
  description,
  callbackUrl,
  config = getMpesaConfig(),
}) {
  assertMpesaConfigured();

  const msisdn = normalizeMpesaPhone(phone);
  if (!msisdn) {
    throw mpesaError('A valid Kenyan M-Pesa phone number is required.', 'INVALID_PHONE', 400);
  }

  const numericAmount = Math.round(Number(amount));
  if (!Number.isFinite(numericAmount) || numericAmount < 1) {
    throw mpesaError('A positive integer M-Pesa amount is required.', 'INVALID_AMOUNT', 400);
  }

  const token = await getAccessToken(config);
  const timestamp = darajaTimestamp();
  const password = Buffer.from(`${config.shortcode}${config.passkey}${timestamp}`).toString('base64');
  const callback = callbackUrl || buildCallbackUrl(config);

  const body = {
    BusinessShortCode: config.shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: config.transactionType,
    Amount: numericAmount,
    PartyA: msisdn,
    PartyB: config.shortcode,
    PhoneNumber: msisdn,
    CallBackURL: callback,
    AccountReference: String(accountReference || config.accountReference).slice(0, 12),
    TransactionDesc: String(description || 'Lawn Craft payment').slice(0, 13),
  };

  const res = await fetchWithTimeout(
    `${config.baseUrl}/mpesa/stkpush/v1/processrequest`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    config.timeoutMs
  );

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    throw mpesaError(
      data.errorMessage || data.ResponseDescription || 'M-Pesa STK push failed.',
      'STK_PUSH_FAILED',
      res.status >= 500 ? 502 : 400
    );
  }

  return data;
}

/** Query the status of a previously initiated STK push. */
export async function queryStkStatus({ checkoutRequestId, config = getMpesaConfig() }) {
  assertMpesaConfigured();

  if (!checkoutRequestId) {
    throw mpesaError('checkoutRequestId is required.', 'INVALID_REQUEST', 400);
  }

  const token = await getAccessToken(config);
  const timestamp = darajaTimestamp();
  const password = Buffer.from(`${config.shortcode}${config.passkey}${timestamp}`).toString('base64');

  const res = await fetchWithTimeout(
    `${config.baseUrl}/mpesa/stkpushquery/v1/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        BusinessShortCode: config.shortcode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId,
      }),
    },
    config.timeoutMs
  );

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    throw mpesaError(
      data.errorMessage || 'M-Pesa status query failed.',
      'STK_QUERY_FAILED',
      res.status >= 500 ? 502 : 400
    );
  }

  return data;
}

/** Verify a callback secret using a constant-time comparison. */
export function verifyCallbackToken(provided, config = getMpesaConfig()) {
  const expected = config.callbackToken;
  // Callbacks still ACK when no token is configured so Safaricom does not retry
  // indefinitely, but reconciliation relies on the CheckoutRequestID lookup.
  if (!expected) return true;
  if (!provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
