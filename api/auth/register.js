function send(res, status, body) {
  res.status(status).json(body);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return send(res, 405, { success: false, error: { message: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' } });
  }

  const { email, password, fullName } = req.body || {};

  if (!email || !password) {
    return send(res, 400, { success: false, error: { message: 'Email and password are required', code: 'VALIDATION_ERROR' } });
  }

  if (password.length < 6) {
    return send(res, 422, { success: false, error: { message: 'Password must be at least 6 characters', code: 'VALIDATION_ERROR' } });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return send(res, 503, { success: false, error: { message: 'Authentication service is not configured', code: 'SERVICE_UNAVAILABLE' } });
  }

  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: fullName ? { full_name: fullName } : undefined,
      }),
    });

    const body = await response.json();

    if (!response.ok) {
      const msg = body?.msg || body?.message || 'Registration failed';
      const code = response.status === 409 ? 'EMAIL_EXISTS' : 'REGISTRATION_FAILED';
      return send(res, response.status, { success: false, error: { message: msg, code } });
    }

    return send(res, 201, {
      success: true,
      user: {
        id: body.id,
        email: body.email,
        fullName: body.user_metadata?.full_name || null,
      },
    });
  } catch (err) {
    return send(res, 503, {
      success: false,
      error: { message: 'Unable to connect to the authentication service. Please try again later.', code: 'SERVICE_UNAVAILABLE' },
    });
  }
};
