function resolveBackendContactUrl() {
  const candidate =
    process.env.CONTACT_BACKEND_API_URL ||
    process.env.AUTOMATIC_SPOON_API_URL ||
    process.env.AUTOMATIC_SPOON_BACKEND_URL ||
    '';

  if (!candidate) {
    return null;
  }

  if (/\/api\/contact\/?$/i.test(candidate)) {
    return candidate.replace(/\/$/, '');
  }

  return `${candidate.replace(/\/$/, '')}/api/contact`;
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

  if (!backendUrl) {
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
      body: JSON.stringify(req.body ?? {}),
    });

    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json')
      ? await response.json()
      : await response.text();

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