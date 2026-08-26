import { supabase } from '../config/supabase.js';
import { pool, usePg } from '../config/db.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// In-memory fallback stores
const mockLeads = [];
const mockQuotes = [];

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
  } else if (name.length > 100) {
    errors.name = 'Name must be 100 characters or fewer.';
  }

  if (!email) {
    errors.email = 'Email is required.';
  } else if (!emailPattern.test(email)) {
    errors.email = 'Email format is invalid.';
  } else if (email.length > 254) {
    errors.email = 'Email must be 254 characters or fewer.';
  }

  if (!phone) {
    errors.phone = 'Phone is required.';
  } else if (phone.length < 7) {
    errors.phone = 'Phone number is too short.';
  } else if (phone.length > 30) {
    errors.phone = 'Phone must be 30 characters or fewer.';
  }

  if (!message) {
    message = 'Website consultation request for lawn care services.';
  } else if (message.length > 5000) {
    errors.message = 'Message must be 5000 characters or fewer.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    data: { name, email, phone, message },
  };
}

export async function submitContactForm(req, res, next) {
  try {
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

    if (usePg && pool && typeof pool.query === 'function') {
      try {
        const insertQuery = `INSERT INTO leads (name, email, phone, message, source)
          VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, phone, message, created_at`;
        const values = [data.name, data.email, data.phone, data.message, 'website'];
        const result = await pool.query(insertQuery, values);
        const insertedLead = result?.rows?.[0] || null;

        if (insertedLead) {
          return res.status(201).json({
            success: true,
            message: 'Your message has been sent successfully.',
            data: insertedLead,
          });
        }
      } catch (pgErr) {
        console.warn('Postgres insert failed, falling back:', pgErr.message);
      }
    }

    if (supabase) {
      try {
        const { data: insertedLead, error } = await supabase
          .from('leads')
          .insert([
            {
              name: data.name,
              email: data.email,
              phone: data.phone,
              message: data.message,
              source: 'website',
            },
          ])
          .select('id, name, email, phone, message, created_at')
          .single();

        if (!error && insertedLead) {
          return res.status(201).json({
            success: true,
            message: 'Your message has been sent successfully.',
            data: insertedLead,
          });
        }
      } catch (sbErr) {
        console.warn('Supabase insert failed, falling back:', sbErr.message);
      }
    }

    // In-memory mock fallback
    const mockLead = {
      id: 'lead_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      name: data.name,
      email: data.email,
      phone: data.phone,
      message: data.message,
      source: 'website',
      created_at: new Date().toISOString(),
    };
    mockLeads.push(mockLead);

    return res.status(201).json({
      success: true,
      message: 'Your message has been sent successfully.',
      data: mockLead,
    });
  } catch (err) {
    return next(err);
  }
}

export async function submitQuoteForm(req, res, next) {
  try {
    const payload = req.body || {};
    const fullName = normalizeText(payload.full_name || payload.name);
    const email = normalizeText(payload.email);
    const phone = normalizeText(payload.phone);

    if (!fullName || !email || !phone) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Full name, email, and phone number are required.',
          code: 'VALIDATION_ERROR',
        },
      });
    }

    const mockQuote = {
      id: 'quote_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      full_name: fullName,
      email,
      phone,
      address: normalizeText(payload.address),
      property_size: payload.property_size || null,
      property_type: normalizeText(payload.property_type),
      service_type: normalizeText(payload.service_type),
      service_frequency: normalizeText(payload.service_frequency),
      preferred_start_date: payload.preferred_start_date || null,
      additional_details: normalizeText(payload.additional_details || payload.message),
      created_at: new Date().toISOString(),
    };
    mockQuotes.push(mockQuote);

    return res.status(201).json({
      success: true,
      message: 'Quote request submitted successfully.',
      data: mockQuote,
    });
  } catch (err) {
    return next(err);
  }
}

