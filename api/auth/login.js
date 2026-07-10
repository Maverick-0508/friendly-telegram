function send(res, status, body) {
  res.status(status).json(body);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return send(res, 405, { success: false, error: { message: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' } });
  }

  const { email, password } = req.body || {};

  if (!email || !password) {
    return send(res, 400, { success: false, error: { message: 'Email and password are required', code: 'VALIDATION_ERROR' } });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return send(res, 503, { success: false, error: { message: 'Authentication service is not configured', code: 'SERVICE_UNAVAILABLE' } });
  }

  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceKey,
      },
      body: JSON.stringify({ email, password }),
    });

    const body = await response.json();

    if (!response.ok) {
      const msg = body?.msg || body?.error_description || body?.message || 'Invalid email or password';
      return send(res, response.status === 400 ? 401 : response.status, {
        success: false,
        error: { message: msg, code: 'AUTHENTICATION_FAILED' },
      });
    }

    return send(res, 200, {
      success: true,
      user: {
        id: body.user.id,
        email: body.user.email,
        fullName: body.user.user_metadata?.full_name || null,
      },
      session: {
        access_token: body.access_token,
        refresh_token: body.refresh_token,
        expires_at: body.expires_at,
      },
    });
  } catch (err) {
    return send(res, 503, {
      success: false,
      error: { message: 'Unable to connect to the authentication service. Please try again later.', code: 'SERVICE_UNAVAILABLE' },
    });
  }
};
