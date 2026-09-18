import { store } from '../services/store.js';
import * as notify from '../services/notify.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

    const savedLead = await store.submitLead({
      name: data.name,
      email: data.email,
      phone: data.phone,
      message: data.message,
      source: 'website',
    });

    // Register in portal store so client hub recognizes this client's consultation
    await store.registerQuote({
      id: savedLead.id,
      full_name: data.name,
      email: data.email,
      phone: data.phone,
      service_type: 'Consultation Request',
      message: data.message,
      created_at: savedLead.created_at,
    });

    // Non-blocking notification to the business owner.
    void notify.notifyNewLead(data).catch(() => {});

    return res.status(201).json({
      success: true,
      message: 'Your message has been sent successfully.',
      data: savedLead,
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

    const quote = await store.registerQuote({
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
    });

    // Non-blocking notification to the business owner.
    void notify.notifyQuoteRequest(quote).catch(() => {});

    return res.status(201).json({
      success: true,
      message: 'Quote request submitted successfully.',
      data: quote,
    });
  } catch (err) {
    return next(err);
  }
}