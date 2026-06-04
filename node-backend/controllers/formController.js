import { supabase } from '../config/supabase.js';
import { pool, usePg } from '../config/db.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    errors.message = 'Message is required.';
  } else if (message.length < 10) {
    errors.message = 'Message must be at least 10 characters long.';
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

    if (usePg && pool) {
      // Insert directly into Postgres via pg Pool
      const insertQuery = `INSERT INTO leads (name, email, phone, message, source)
        VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, phone, message, created_at`;
      const values = [data.name, data.email, data.phone, data.message, 'website'];

      try {
        const result = await pool.query(insertQuery, values);
        const insertedLead = result.rows[0] || null;

        return res.status(201).json({
          success: true,
          message: 'Your message has been sent successfully.',
          data: insertedLead,
        });
      } catch (pgErr) {
        console.error('Postgres insert error:', pgErr);
        return res.status(502).json({
          success: false,
          error: {
            message: 'Failed to save your request. Please try again later.',
            code: 'PG_INSERT_FAILED',
            details: pgErr.message,
          },
        });
      }
    }

    // Fallback to Supabase client if Postgres URL is not provided
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

    if (error) {
      console.error('Supabase insert error:', error);

      return res.status(502).json({
        success: false,
        error: {
          message: 'Failed to save your request. Please try again later.',
          code: 'SUPABASE_INSERT_FAILED',
          details: error.message,
        },
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Your message has been sent successfully.',
      data: insertedLead,
    });
  } catch (err) {
    return next(err);
  }
}
