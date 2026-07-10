function send(res, status, body) {
  res.status(status).json(body);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return send(res, 405, { success: false, error: { message: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' } });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return send(res, 401, { success: false, error: { message: 'Authentication required', code: 'AUTH_REQUIRED' } });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return send(res, 503, { success: false, error: { message: 'Authentication service is not configured', code: 'SERVICE_UNAVAILABLE' } });
  }

  const token = authHeader.split(' ')[1];

  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${token}`,
      },
    });

    const body = await response.json();

    if (!response.ok) {
      const msg = body?.msg || body?.message || 'Invalid or expired token';
      return send(res, 401, { success: false, error: { message: msg, code: 'TOKEN_INVALID' } });
    }

    return send(res, 200, {
      success: true,
      user: {
        id: body.id,
        email: body.email,
        fullName: body.user_metadata?.full_name || null,
        createdAt: body.created_at,
      },
    });
  } catch (err) {
    return send(res, 503, {
      success: false,
      error: { message: 'Unable to connect to the authentication service. Please try again later.', code: 'SERVICE_UNAVAILABLE' },
    });
  }
};
