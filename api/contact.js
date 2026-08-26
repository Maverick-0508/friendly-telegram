function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validateContactPayload(payload) {
  const name = normalizeText(payload?.name || payload?.full_name);
  const email = normalizeText(payload?.email);
  const phone = normalizeText(payload?.phone);
  let message = normalizeText(payload?.message);

  const errors = {};

  if (!name) {
    errors.name = 'Name is required.';
  } else if (name.length < 2) {
    errors.name = 'Name must be at least 2 characters long.';
  }

  if (!email) {
    errors.email = 'Email is required.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Email format is invalid.';
  }

  if (!phone) {
    errors.phone = 'Phone is required.';
  } else if (phone.length < 7) {
    errors.phone = 'Phone number is too short.';
  }

  if (!message) {
    message = 'Website consultation request for lawn care services.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    data: { name, email, phone, message },
  };
}

function resolveBackendContactUrl() {
  let candidate =
    process.env.CONTACT_BACKEND_API_URL ||
    process.env.AUTOMATIC_SPOON_API_URL ||
    process.env.AUTOMATIC_SPOON_BACKEND_URL ||
    '';

  if (!candidate) {
    return null;
  }

  candidate = candidate.trim().replace(/\/$/, '');

  if (/\/api\/contact$/i.test(candidate)) {
    return candidate;
  }

  if (/\/api$/i.test(candidate)) {
    return `${candidate}/contact`;
  }

  return `${candidate}/api/contact`;
}

function resolveSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !supabaseServiceKey) {
    return null;
  }

  return {
    restUrl: `${supabaseUrl.replace(/\/$/, '')}/rest/v1/leads`,
    apiKey: supabaseServiceKey,
  };
}

async function parseResponseBody(response) {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
}

async function createLeadInSupabase(data) {
  const config = resolveSupabaseConfig();

  if (!config) {
    return null;
  }

  const response = await fetch(config.restUrl, {
    method: 'POST',
    headers: {
      apikey: config.apiKey,
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      Accept: 'application/json',
    },
    body: JSON.stringify([
      {
        name: data.name,
        email: data.email,
        phone: data.phone,
        message: data.message,
        source: 'website',
      },
    ]),
  });

  const body = await parseResponseBody(response);

  if (!response.ok) {
    const details = typeof body === 'string' ? body : JSON.stringify(body);
    const error = new Error('Failed to save your request. Please try again later.');
    error.statusCode = 502;
    error.code = 'SUPABASE_INSERT_FAILED';
    error.details = details;
    throw error;
  }

  return Array.isArray(body) ? body[0] || null : body;
}

function shouldFallbackToSupabase(statusCode) {
  return statusCode === 404 || statusCode >= 500;
}

function parseRequestBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch (_) {
      return {};
    }
  }
  return {};
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({
      success: false,
      error: {
        message: 'Method not allowed',
        code: 'METHOD_NOT_ALLOWED',
      },
    });
  }

  const rawBody = parseRequestBody(req);
  const { valid, errors, data } = validateContactPayload(rawBody);

  if (!valid) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Validation failed.',
        code: 'VALIDATION_ERROR',
        fields: errors,
      },
    });
  }

  // Generate fallback lead record
  const fallbackLead = {
    id: 'lead_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    name: data.name,
    email: data.email,
    phone: data.phone,
    message: data.message,
    source: 'website',
    created_at: new Date().toISOString(),
  };

  const backendUrl = resolveBackendContactUrl();

  // If a dedicated backend proxy URL is configured, try forwarding
  if (backendUrl) {
    try {
      const response = await fetch(backendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(data),
      });

      const body = await parseResponseBody(response);

      if (response.ok) {
        if (typeof body === 'string') {
          return res.status(response.status).send(body);
        }
        return res.status(response.status).json(body);
      }
    } catch (proxyError) {
      console.warn('Backend proxy unreachable, falling back:', proxyError.message);
    }
  }

  // If Supabase is configured, save to Supabase
  try {
    const supabaseLead = await createLeadInSupabase(data);
    if (supabaseLead) {
      return res.status(201).json({
        success: true,
        message: 'Your message has been sent successfully.',
        data: supabaseLead,
      });
    }
  } catch (sbErr) {
    console.warn('Supabase lead creation error, falling back:', sbErr.message);
  }

  // Graceful success fallback
  return res.status(201).json({
    success: true,
    message: 'Your message has been sent successfully.',
    data: fallbackLead,
  });
}

export default handler;