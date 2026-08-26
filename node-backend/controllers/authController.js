import { supabase } from '../config/supabase.js';

// In-memory user fallback store
const mockUsers = new Map();
const mockTokens = new Map();

function serviceError(message) {
  const err = new Error(message);
  err.statusCode = 503;
  return err;
}

function supabaseError(message, status) {
  const known = {
    'Email already registered': { msg: 'This email is already registered. Try signing in instead.', code: 409 },
    'Invalid login credentials': { msg: 'Invalid email or password. Please try again.', code: 401 },
    'Password should be at least 6 characters': { msg: 'Password must be at least 6 characters.', code: 422 },
    'Unable to validate email address': { msg: 'Please enter a valid email address.', code: 422 },
    'fetch failed': { msg: 'Unable to connect to the authentication service. Please try again later.', code: 503 },
  };
  const entry = known[message];
  if (entry) {
    const err = new Error(entry.msg);
    err.statusCode = entry.code;
    return err;
  }
  const err = new Error(message || 'Authentication failed');
  err.statusCode = status && status >= 400 && status < 500 ? status : 503;
  return err;
}

export async function register(req, res, next) {
  try {
    const { email, password, fullName } = req.body || {};

    if (!email || !password) {
      const err = new Error('Email and password are required');
      err.statusCode = 400;
      throw err;
    }

    if (password.length < 6) {
      const err = new Error('Password must be at least 6 characters');
      err.statusCode = 422;
      throw err;
    }

    if (supabase) {
      try {
        const { data, error } = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: fullName ? { full_name: fullName } : undefined,
        });

        if (error) throw supabaseError(error.message, error.status);

        return res.status(201).json({
          success: true,
          user: {
            id: data.user.id,
            email: data.user.email,
            fullName: data.user.user_metadata?.full_name || null,
          },
        });
      } catch (err) {
        if (err.statusCode && err.statusCode < 500) throw err;
        console.warn('Supabase register failed, falling back to in-memory auth:', err.message);
      }
    }

    // In-memory fallback
    const normalizedEmail = email.toLowerCase().trim();
    if (mockUsers.has(normalizedEmail)) {
      const err = new Error('This email is already registered. Try signing in instead.');
      err.statusCode = 409;
      throw err;
    }

    const userId = 'usr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const user = {
      id: userId,
      email: normalizedEmail,
      fullName: fullName || null,
      password,
      created_at: new Date().toISOString(),
    };
    mockUsers.set(normalizedEmail, user);

    return res.status(201).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      const err = new Error('Email and password are required');
      err.statusCode = 400;
      throw err;
    }

    if (supabase) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw supabaseError(error.message, error.status);

        return res.json({
          success: true,
          user: {
            id: data.user.id,
            email: data.user.email,
            fullName: data.user.user_metadata?.full_name || null,
          },
          session: {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_at: data.session.expires_at,
          },
        });
      } catch (err) {
        if (err.statusCode && err.statusCode < 500) throw err;
        console.warn('Supabase login failed, falling back to in-memory auth:', err.message);
      }
    }

    // In-memory fallback
    const normalizedEmail = email.toLowerCase().trim();
    const user = mockUsers.get(normalizedEmail);
    if (!user || user.password !== password) {
      const err = new Error('Invalid email or password. Please try again.');
      err.statusCode = 401;
      throw err;
    }

    const token = 'tok_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    mockTokens.set(token, user);

    return res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
      },
      session: {
        access_token: token,
        refresh_token: token + '_refresh',
        expires_at: Math.floor(Date.now() / 1000) + 86400,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function me(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const err = new Error('Authentication required');
      err.statusCode = 401;
      throw err;
    }

    const token = authHeader.split(' ')[1];

    if (supabase) {
      try {
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (!error && user) {
          return res.json({
            success: true,
            user: {
              id: user.id,
              email: user.email,
              fullName: user.user_metadata?.full_name || null,
              createdAt: user.created_at,
            },
          });
        }
      } catch (err) {
        console.warn('Supabase getUser failed, falling back:', err.message);
      }
    }

    // In-memory fallback
    const user = mockTokens.get(token);
    if (!user) {
      const err = new Error('Invalid or expired token');
      err.statusCode = 401;
      throw err;
    }

    return res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        createdAt: user.created_at,
      },
    });
  } catch (err) {
    next(err);
  }
}

