function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validateContactPayload(payload) {
  const name = normalizeText(payload?.name || payload?.full_name);
  const email = normalizeText(payload?.email);
  const phone = normalizeText(payload?.phone);
  const message = normalizeText(payload?.message);

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
    errors.message = 'Message is required.';
  } else if (message.length < 10) {
    errors.message = 'Message must be at least 10 characters long.';
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

  const backendUrl = resolveBackendContactUrl();
  const { valid, errors, data } = validateContactPayload(req.body);

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

  if (!backendUrl) {
    const insertedLead = await createLeadInSupabase(data);

    if (insertedLead) {
      return res.status(201).json({
        success: true,
        message: 'Your message has been sent successfully.',
        data: insertedLead,
      });
    }

    return res.status(500).json({
      success: false,
      error: {
        message: 'Contact backend is not configured.',
        code: 'BACKEND_URL_NOT_CONFIGURED',
      },
    });
  }

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

    if (!response.ok && shouldFallbackToSupabase(response.status)) {
      const insertedLead = await createLeadInSupabase(data);

      if (insertedLead) {
        return res.status(201).json({
          success: true,
          message: 'Your message has been sent successfully.',
          data: insertedLead,
        });
      }
    }

    if (typeof body === 'string') {
      return res.status(response.status).send(body);
    }

    return res.status(response.status).json(body);
  } catch (error) {
    console.error('Contact proxy error:', error);

    return res.status(502).json({
      success: false,
      error: {
        message: 'Failed to reach the contact backend.',
        code: 'CONTACT_BACKEND_UNAVAILABLE',
      },
    });
  }
}

module.exports = handler;