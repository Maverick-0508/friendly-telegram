const MAX_BODY_BYTES = 1_048_576;
const DEFAULT_EMPTY_PAYLOAD = '{}';
const MAX_BACKEND_ERROR_BYTES = 8192;
const BACKEND_TIMEOUT_SECONDS = 12_000;
const DEFAULT_FALLBACK_STORAGE_PATH = '/tmp/contact-submissions.jsonl';
const BACKEND_URL_ENV_KEYS = [
  'CONTACT_BACKEND_API_URL',
  'AUTOMATIC_SPOON_API_URL',
  'AUTOMATIC_SPOON_BACKEND_URL',
  'BACKEND_API_BASE_URL',
  'BACKEND_API_URL',
  'DASHBOARD_API_BASE',
  'LAWNCRAFT_API_BASE',
];

function clean(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function validateEmail(value) {
  const email = String(value || '').trim();
  const emailPattern = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  return emailPattern.test(email) ? email : null;
}

function buildContactRecord(payload) {
  const fullName = clean(payload.full_name) || clean(payload.name);
  if (!fullName) return { error: 'Full name is required.' };

  const message = clean(payload.message);
  if (!message) return { error: 'Message is required.' };

  const email = validateEmail(payload.email);
  if (!email) return { error: 'Please provide a valid email address.' };

  const serviceType = clean(payload.service_type) || clean(payload.service);
  let subject = clean(payload.subject);
  if (!subject) {
    subject = serviceType ? `Website enquiry - ${serviceType}` : 'Website enquiry';
  }

  return {
    record: {
      id: crypto.randomUUID(),
      full_name: fullName,
      email,
      phone: clean(payload.phone),
      subject,
      service_type: serviceType,
      message,
      created_at: new Date().toISOString(),
    },
  };
}

function resolveBackendContactUrl() {
  for (const key of BACKEND_URL_ENV_KEYS) {
    const raw = (process.env[key] || '').trim();
    if (!raw) continue;

    let normalized = raw.replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(normalized) && !normalized.startsWith('/')) {
      normalized = `https://${normalized}`;
    }
    if (normalized.endsWith('/contact')) return normalized;
    if (normalized.endsWith('/api')) return `${normalized}/contact`;
    return `${normalized}/api/contact`;
  }
  return null;
}

function isValidBackendUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function extractErrorDetail(errorText) {
  if (!errorText) return 'Contact request could not be delivered to backend.';
  try {
    const parsed = JSON.parse(errorText);
    if (typeof parsed.detail === 'string' && parsed.detail.trim()) {
      return parsed.detail;
    }
  } catch {
    // Fall through to generic message.
  }
  return 'Contact request could not be delivered to backend.';
}

function fallbackSuccessResponse(payload) {
  return {
    status: 'success',
    message: 'Thank you! Your consultation request has been received.',
    id: payload.id,
  };
}

function writeJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.end(JSON.stringify(body));
}

async function persistContactSubmission(record) {
  const storagePath = (process.env.CONTACT_FALLBACK_STORAGE_PATH || DEFAULT_FALLBACK_STORAGE_PATH).trim();
  if (!storagePath.startsWith('/tmp/')) return false;

  try {
    const fs = await import('node:fs/promises');
    const line = `${JSON.stringify(record)}\n`;
    await fs.appendFile(storagePath, line, { encoding: 'utf8', mode: 0o600 });
    return true;
  } catch (error) {
    console.warn('contact fallback persistence failed:', error);
    return false;
  }
}

async function forwardContactToBackend(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { status: 400, body: { detail: 'Contact payload must be a dictionary object.' } };
  }

  const backendUrl = resolveBackendContactUrl();
  if (!backendUrl || !isValidBackendUrl(backendUrl)) {
    if (await persistContactSubmission(payload)) {
      return { status: 202, body: fallbackSuccessResponse(payload) };
    }
    return {
      status: 503,
      body: {
        detail: backendUrl
          ? 'Contact backend URL configuration is invalid and fallback storage failed.'
          : 'Contact backend is unavailable and fallback storage failed. Please try again.',
      },
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), BACKEND_TIMEOUT_SECONDS);
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const text = await response.text();
    if (text) {
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return { status: response.status, body: parsed };
        }
      } catch {
        // Fall through to generic success payload.
      }
    }

    return {
      status: response.status,
      body: {
        status: 'success',
        message: 'Thank you! Your consultation request has been received.',
      },
    };
  } catch (error) {
    if (await persistContactSubmission(payload)) {
      return { status: 202, body: fallbackSuccessResponse(payload) };
    }
    return { status: 503, body: { detail: 'Contact backend is temporarily unavailable. Please try again.' } };
  }
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    writeJson(res, 204, {});
    return;
  }

  if (req.method !== 'POST') {
    writeJson(res, 405, { detail: `Method ${req.method} Not Allowed` });
    return;
  }

  const chunks = [];
  let totalLength = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalLength += buffer.length;
    if (totalLength > MAX_BODY_BYTES) {
      writeJson(res, 413, { detail: 'Payload too large.' });
      return;
    }
    chunks.push(buffer);
  }

  let payload;
  try {
    const text = chunks.length ? Buffer.concat(chunks).toString('utf8') : DEFAULT_EMPTY_PAYLOAD;
    payload = text ? JSON.parse(text) : JSON.parse(DEFAULT_EMPTY_PAYLOAD);
  } catch {
    writeJson(res, 400, { detail: 'Request body must be valid JSON.' });
    return;
  }

  const record = buildContactRecord(payload);
  if (record.error) {
    writeJson(res, 422, { detail: record.error });
    return;
  }

  const { status, body } = await forwardContactToBackend(record.record);
  writeJson(res, status, body);
}
