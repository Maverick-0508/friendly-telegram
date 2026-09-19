import { checkSupabaseReachability } from '../config/supabase.js';
import { store, normalizeIdentifier } from '../services/store.js';
import {
  getMpesaConfig,
  isMpesaConfigured,
  initiateStkPush,
  normalizeMpesaPhone,
  queryStkStatus,
  verifyCallbackToken,
} from '../services/mpesa.js';
import { isValidPin, hashPin, verifyPin } from '../config/pins.js';
import { getCoupons } from '../config/coupons.js';
import { priceWorkOrder } from '../config/pricing.js';
import * as notify from '../services/notify.js';

const isStrictRuntime = process.env.NODE_ENV === 'production' && process.env.ALLOW_IN_MEMORY_FALLBACK !== 'true';
const REACHABILITY_TTL_MS = 15_000;

// Payment abuse limits. These are enforced against the database, so they hold
// across serverless instances where an in-memory rate limiter would not.
const STK_MAX_PER_PHONE = Number(process.env.STK_MAX_PER_PHONE || 5);
const STK_PHONE_WINDOW_MS = Number(process.env.STK_PHONE_WINDOW_MS || 15 * 60 * 1000);
const STK_DUPLICATE_WINDOW_MS = Number(process.env.STK_DUPLICATE_WINDOW_MS || 90 * 1000);
const MPESA_MAX_AMOUNT = Number(process.env.MPESA_MAX_AMOUNT || 250_000);
// How old a pending payment must be before the status endpoint asks Daraja
// directly (covers lost callbacks without waiting for the reconciliation cron).
const STATUS_QUERY_AFTER_MS = Number(process.env.MPESA_STATUS_QUERY_AFTER_MS || 20 * 1000);

let lastReachabilityCheck = 0;
let reachabilityCached = null;

function ensureRuntimePersistence(res) {
  if (isStrictRuntime && !store.backendName().startsWith('supabase')) {
    res.status(503).json({
      success: false,
      error: {
        message: 'Portal services require Supabase in production.',
        code: 'PERSISTENCE_UNAVAILABLE',
      },
    });
    return false;
  }

  return true;
}

async function productionProvidersAvailable() {
  if (!isStrictRuntime) return true;

  const now = Date.now();
  if (reachabilityCached !== null && now - lastReachabilityCheck < REACHABILITY_TTL_MS) {
    return reachabilityCached;
  }

  const status = await checkSupabaseReachability();
  reachabilityCached = status.connected;
  lastReachabilityCheck = now;
  if (!status.connected) {
    console.error('[portalController] Supabase is unreachable in production; failing fast.', status.error || '');
  }
  return status.connected;
}

async function ensureProviders(res) {
  if (!ensureRuntimePersistence(res)) return false;

  if (isStrictRuntime) {
    const available = await productionProvidersAvailable();
    if (!available) {
      res.status(503).json({
        success: false,
        error: {
          message: 'Persistence provider is unavailable.',
          code: 'PERSISTENCE_UNAVAILABLE',
        },
      });
      return false;
    }
  }

  return true;
}

// Helper to normalize phone / email
export { normalizeIdentifier };

// ---------------- Input helpers ----------------

function text(value, max = 200) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, max);
}

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Strip secrets (PIN hash + salt) before a client record leaves the server. */
function publicClient(client) {
  if (!client) return client;
  const { access_pin_hash, access_pin_salt, ...safe } = client;
  return safe;
}

function fail(res, status, code, message, extra = {}) {
  res.status(status).json({ success: false, error: { message, code }, ...extra });
  return { rejected: true };
}

/**
 * Authorize a request that wants to act on an existing client record.
 *
 * - Profiles with a PIN: the correct PIN is mandatory.
 * - Profiles without a PIN (quote-only / legacy): a PIN may be *claimed*, but
 *   only if the request also matches the email on file (when one exists).
 *   Knowing a phone number alone never grants access to someone's data.
 *
 * mode 'strict' rejects when the caller cannot be verified. mode 'order'
 * (bookings) allows an unverified caller to create an order linked to the
 * profile but reports claimed:false so the profile itself is left untouched.
 *
 * Returns { rejected: true } after sending a response, or { claimed } on success.
 */
function authorizeExistingClient(res, client, pin, { email = '', mode = 'strict' } = {}) {
  if (client.access_pin_hash) {
    if (!pin) {
      return fail(res, 403, 'ACCESS_PIN_REQUIRED', 'This phone number or email is already registered. Enter your access PIN to continue.');
    }
    if (!verifyPin(pin, client.access_pin_hash, client.access_pin_salt)) {
      return fail(res, 403, 'INVALID_PIN', 'Incorrect account PIN. If you forgot it, contact Lawn Craft support.');
    }
    return { claimed: true };
  }

  const emailOnFile = String(client.email || '').trim().toLowerCase();
  const emailGiven = String(email || '').trim().toLowerCase();
  const emailMatches = !emailOnFile || (emailGiven && emailGiven === emailOnFile);

  if (!pin || !emailMatches) {
    if (mode === 'order') return { claimed: false };
    if (!pin) {
      return fail(res, 403, 'ACCESS_PIN_REQUIRED',
        'This profile has no access PIN yet. Choose a PIN (and use the email on file) to activate your hub.',
        { pin_required: true });
    }
    return fail(res, 403, 'CLAIM_EMAIL_MISMATCH',
      'To activate this profile, register with the same email address that was used for your quote.');
  }

  const { hash, salt } = hashPin(pin);
  client.access_pin_hash = hash;
  client.access_pin_salt = salt;
  return { claimed: true };
}

function newLoyalty(points, normPhone, fallbackSuffix) {
  return {
    points_balance: points,
    tier: 'Bronze',
    rate_per_point: 50.0,
    dollar_value: points * 50,
    cash_value: points * 50,
    referral_code: 'LAWN-' + (normPhone.slice(-4) || fallbackSuffix),
    next_tier: 'Silver',
    points_to_next_tier: Math.max(0, 250 - points),
  };
}

// ---------------- Client profiles ----------------

// Create or Register a Client Profile
export async function createClientProfile(req, res) {
  try {
    if (!(await ensureProviders(res))) return;

    const body = req.body || {};
    const name = text(body.name, 100);
    const phone = text(body.phone, 30);
    const email = text(body.email, 254).toLowerCase();
    const address = text(body.address, 200);
    const grassType = text(body.grass_type, 60);
    const servicePlan = text(body.service_plan, 60);
    const propertySize = Number(body.property_size) || 0;
    const pin = text(body.pin, 6);

    if (pin && !isValidPin(pin)) {
      return fail(res, 400, 'INVALID_PIN_FORMAT', 'Access PIN must be 4 to 6 digits.');
    }

    if (name.length < 2) {
      return fail(res, 400, 'INVALID_NAME', 'Client full name is required (at least 2 characters).');
    }

    if (phone.length < 7) {
      return fail(res, 400, 'INVALID_PHONE', 'A valid phone number is required.');
    }

    const normPhone = normalizeIdentifier(phone);

    const existing = await store.findClientByPhoneOrEmail(phone, email);
    if (existing) {
      const auth = authorizeExistingClient(res, existing, pin, { email, mode: 'strict' });
      if (auth.rejected) return;

      if (address) existing.address = address;
      if (propertySize) existing.property_size = propertySize;
      if (grassType) existing.grass_type = grassType;
      if (servicePlan) existing.service_plan = servicePlan;
      if (email && !existing.email) existing.email = email;
      await store.upsertClient(existing);

      return res.status(200).json({
        success: true,
        message: 'Client profile updated successfully.',
        client: publicClient(existing),
      });
    }

    const { hash, salt } = pin ? hashPin(pin) : { hash: null, salt: null };
    const newClient = {
      id: newId('cl'),
      name,
      phone,
      email,
      address,
      property_size: propertySize,
      grass_type: grassType || 'Kikuyu Turf',
      service_plan: servicePlan || 'Custom Care',
      customer_since: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      access_pin_hash: hash,
      access_pin_salt: salt,
      loyalty: newLoyalty(100, normPhone, 'VIP'),
    };

    await store.upsertClient(newClient);

    return res.status(201).json({
      success: true,
      message: 'Client profile registered successfully.',
      client: publicClient(newClient),
    });
  } catch (err) {
    console.error('[createClientProfile Error]', err);
    return res.status(err.statusCode || 500).json({
      success: false,
      error: {
        message: 'Failed to create client profile.',
        code: err.statusCode === 503 ? err.code : 'CLIENT_CREATE_FAILED',
      },
    });
  }
}

// Lookup Client by Phone or Email (Strict Real Data, No Mock Synthetics)
export async function lookupClient(req, res) {
  try {
    if (!(await ensureProviders(res))) return;

    const rawIdentifier = text(req.body?.identifier, 254);
    const pin = text(req.body?.pin, 6);
    const normalized = normalizeIdentifier(rawIdentifier);

    if (!normalized) {
      return fail(res, 400, 'IDENTIFIER_REQUIRED', 'Phone number or email is required.');
    }

    const client = await store.findClient(rawIdentifier);

    // If not found, return a clean 404 (No fake profiles)
    if (!client) {
      return res.status(404).json({
        success: false,
        not_found: true,
        message: 'No registered client profile found for this phone number or email.',
        identifier: rawIdentifier,
      });
    }

    if (!pin) {
      return fail(res, 403, 'ACCESS_PIN_REQUIRED', 'An access PIN is required to view your hub.');
    }

    if (!client.access_pin_hash) {
      // Quote-only profile without a PIN: require one to be set first, so a
      // phone number alone never grants access to personal data.
      return fail(res, 403, 'ACCESS_PIN_REQUIRED',
        'This profile needs an access PIN before the hub can be opened. Register with the same phone number and email to set one.',
        { pin_required: true });
    }

    if (!verifyPin(pin, client.access_pin_hash, client.access_pin_salt)) {
      return fail(res, 403, 'INVALID_PIN', 'Incorrect account PIN. Please try again.');
    }

    const match = { id: client.id, phone: client.phone, email: client.email };

    const [clientWorkOrders, clientInvoices, clientQuotes] = await Promise.all([
      store.workOrdersByClient(match),
      store.invoicesByClient(match),
      store.quotesByClient(match),
    ]);

    return res.status(200).json({
      success: true,
      client: {
        id: client.id,
        name: client.name,
        phone: client.phone,
        email: client.email,
        address: client.address,
        property_size: client.property_size,
        grass_type: client.grass_type,
        service_plan: client.service_plan,
        customer_since: client.customer_since,
      },
      loyalty: client.loyalty,
      work_orders: clientWorkOrders,
      invoices: clientInvoices,
      quotes: clientQuotes,
    });
  } catch (err) {
    console.error('[lookupClient Error]', err);
    return res.status(err.statusCode || 500).json({
      success: false,
      error: {
        message: 'Failed to retrieve client profile.',
        code: err.statusCode === 503 ? err.code : 'LOOKUP_FAILED',
      },
    });
  }
}

// ---------------- Work orders ----------------

// 1-Click Work Order Booking (Creates Real Client + Order + Invoice).
// The price is computed server-side from the catalogue; any price sent by the
// browser is ignored.
export async function createWorkOrder(req, res) {
  try {
    if (!(await ensureProviders(res))) return;

    const payload = req.body || {};
    const pin = text(payload.pin, 6);
    if (pin && !isValidPin(pin)) {
      return fail(res, 400, 'INVALID_PIN_FORMAT', 'Access PIN must be 4 to 6 digits.');
    }

    const clientName = text(payload.client_name || payload.name, 100);
    const clientPhone = text(payload.phone || payload.client_phone, 30);
    const clientEmail = text(payload.email || payload.client_email, 254).toLowerCase();
    const address = text(payload.address, 200) || 'Property Location Pending';
    const notes = text(payload.notes, 500) || 'Service booked online via Lawn Craft portal.';
    const scheduledDate = text(payload.scheduled_date, 60) || 'Next Available Slot (within 48 hrs)';

    if (clientName.length < 2) {
      return fail(res, 400, 'NAME_REQUIRED', 'Client name is required for booking.');
    }

    if (clientPhone.length < 7) {
      return fail(res, 400, 'PHONE_REQUIRED', 'Phone number is required for dispatch notification.');
    }

    const pricing = priceWorkOrder({
      service_type: text(payload.service_type || payload.title, 120),
      property_size: payload.property_size,
      grass: payload.grass,
      frequency: payload.frequency,
      addons: payload.addons,
      coupon_code: payload.coupon_code,
    });
    const serviceType = pricing.service_type;
    const propertySize = pricing.property_size;
    const price = pricing.total;

    const normPhone = normalizeIdentifier(clientPhone);

    // Look up or create client record
    let clientId;
    const matchedClient = await store.findClientByPhoneOrEmail(clientPhone, clientEmail);

    if (matchedClient) {
      const auth = authorizeExistingClient(res, matchedClient, pin, { email: clientEmail, mode: 'order' });
      if (auth.rejected) return;

      clientId = matchedClient.id;
      if (auth.claimed) {
        // Verified owner: enrich the profile and award booking points.
        if (address && !matchedClient.address) matchedClient.address = address;
        if (propertySize && !matchedClient.property_size) matchedClient.property_size = propertySize;
        if (matchedClient.loyalty) {
          matchedClient.loyalty.points_balance += 30; // +30 points for booking
          matchedClient.loyalty.dollar_value = matchedClient.loyalty.points_balance * matchedClient.loyalty.rate_per_point;
          matchedClient.loyalty.cash_value = matchedClient.loyalty.dollar_value;
        }
        await store.upsertClient(matchedClient);
      }
    } else {
      const { hash, salt } = pin ? hashPin(pin) : { hash: null, salt: null };
      const newClient = {
        id: newId('cl'),
        name: clientName,
        phone: clientPhone,
        email: clientEmail,
        address,
        property_size: propertySize,
        grass_type: text(payload.grass_type, 60) || 'Turf Grass',
        service_plan: text(payload.service_plan, 60) || 'On-Demand Precision Care',
        customer_since: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        access_pin_hash: hash,
        access_pin_salt: salt,
        loyalty: newLoyalty(100, normPhone, 'CARE'),
      };
      await store.upsertClient(newClient);
      clientId = newClient.id;
    }

    const newOrderId = newId('wo');
    const invoiceId = newId('inv');

    const workOrder = {
      id: newOrderId,
      client_id: clientId,
      client_name: clientName,
      client_phone: clientPhone,
      client_email: clientEmail,
      title: `${serviceType} - ${clientName}`,
      service_type: serviceType,
      status: 'incoming', // always enters the supervisor dispatch queue
      scheduled_date: scheduledDate,
      total_price: price,
      property_size: propertySize,
      address,
      invoice_id: invoiceId,
      notes,
      coupon_code: pricing.coupon ? pricing.coupon.code : null,
      crew_name: 'Pending Supervisor Dispatch',
      created_at: new Date().toISOString(),
      checklist: [
        { task: 'Perimeter Safety Sweep & Obstacle Verification', status: 'pending' },
        { task: 'Precision Edge Detailing & Border Trim', status: 'pending' },
        { task: 'Core Precision Mowing (Standard Cut Height)', status: 'pending' },
        { task: 'Clippings Vacuuming & Green Waste Bagging', status: 'pending' },
        { task: 'Walkway, Patio & Driveway Blower Detailing', status: 'pending' },
      ],
    };

    await store.upsertWorkOrder(workOrder);

    // Auto-generate invoice (prices are VAT-inclusive at 16%).
    const subtotal = Math.round((price / 1.16) * 100) / 100;
    const taxVat = Math.round((price - subtotal) * 100) / 100;
    const invoiceRecord = {
      id: invoiceId,
      invoice_number: 'INV-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000),
      client_id: clientId,
      client_name: clientName,
      client_phone: clientPhone,
      client_email: clientEmail,
      client_address: address,
      service_title: serviceType,
      total_amount: price,
      balance_due: price,
      status: 'unpaid',
      issue_date: new Date().toISOString().split('T')[0],
      due_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      subtotal,
      tax_vat: taxVat,
      pin_number: process.env.COMPANY_KRA_PIN || undefined,
      discount: pricing.discount || 0,
      coupon_code: pricing.coupon ? pricing.coupon.code : null,
      items: pricing.line_items,
    };

    await store.upsertInvoice(invoiceRecord);

    // Non-blocking notifications to the client and the business owner.
    void notify.notifyClientOrderBooked(workOrder).catch(() => {});
    void notify.notifyOwnerNewOrder(workOrder, invoiceRecord).catch(() => {});

    return res.status(201).json({
      success: true,
      message: 'Work order scheduled successfully and added to dispatch queue.',
      data: workOrder,
      invoice: invoiceRecord,
      pricing: {
        subtotal: pricing.subtotal,
        discount: pricing.discount,
        total: pricing.total,
        coupon: pricing.coupon,
        coupon_rejected: pricing.coupon_rejected,
      },
    });
  } catch (err) {
    console.error('[createWorkOrder Error]', err);
    return res.status(err.statusCode || 500).json({
      success: false,
      error: {
        message: 'Failed to create work order.',
        code: err.statusCode === 503 ? err.code : 'CREATE_WORK_ORDER_FAILED',
      },
    });
  }
}

// Get Single Work Order (Strict Real Data, No Mock Fallback)
export async function getWorkOrder(req, res) {
  try {
    if (!(await ensureProviders(res))) return;

    const { orderId } = req.params;
    const order = await store.workOrderById(orderId);

    if (!order) {
      return fail(res, 404, 'WORK_ORDER_NOT_FOUND', 'Work order not found.');
    }

    return res.status(200).json({
      success: true,
      data: order,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      error: {
        message: 'Failed to fetch work order.',
        code: err.statusCode === 503 ? err.code : 'WORK_ORDER_FETCH_FAILED',
      },
    });
  }
}

// ---------------- Payments ----------------

// Lipa Na M-Pesa STK Push (real Safaricom Daraja integration)
export async function stkPushMpesa(req, res) {
  try {
    if (!(await ensureProviders(res))) return;

    if (!isMpesaConfigured()) {
      return fail(res, 503, 'MPESA_NOT_CONFIGURED', 'M-Pesa payments are not configured on this server.');
    }

    const { phone, amount, invoice_id, account_reference } = req.body || {};

    const msisdn = normalizeMpesaPhone(phone);
    if (!msisdn) {
      return fail(res, 400, 'INVALID_PHONE', 'A valid Kenyan M-Pesa phone number is required.');
    }

    // Per-phone throttle: stops the endpoint being used to spam STK prompts
    // at arbitrary numbers using our shortcode.
    const windowStart = new Date(Date.now() - STK_PHONE_WINDOW_MS).toISOString();
    const recentPushes = await store.countPaymentsForPhoneSince(msisdn, windowStart);
    if (recentPushes >= STK_MAX_PER_PHONE) {
      return fail(res, 429, 'TOO_MANY_PAYMENT_REQUESTS',
        'Too many payment prompts have been sent to this number. Please wait a few minutes and try again.');
    }

    let invoice = null;
    let chargeAmount = Number(amount);

    if (invoice_id) {
      invoice = await store.invoiceById(text(invoice_id, 64));
      if (!invoice) {
        return fail(res, 404, 'INVOICE_NOT_FOUND', 'Invoice not found.');
      }
      if (invoice.status === 'paid') {
        return fail(res, 409, 'INVOICE_ALREADY_PAID', 'This invoice has already been paid.');
      }

      // Duplicate-prompt guard: if a push for this invoice is still awaiting
      // the customer's PIN, hand back that checkout so the UI resumes polling.
      const inFlight = await store.latestPendingPaymentForInvoice(invoice.id);
      if (inFlight && Date.now() - Date.parse(inFlight.created_at || 0) < STK_DUPLICATE_WINDOW_MS) {
        return res.status(409).json({
          success: false,
          error: {
            message: 'A payment prompt for this invoice was sent moments ago. Check your phone or wait a minute before retrying.',
            code: 'PAYMENT_IN_PROGRESS',
          },
          checkout_request_id: inFlight.checkout_request_id,
        });
      }

      const balance = Number(invoice.balance_due ?? invoice.total_amount ?? 0);
      // The server is the source of truth for the amount; never trust a client-supplied total.
      if (Number.isFinite(chargeAmount) && chargeAmount > 0) {
        if (Math.round(chargeAmount) !== Math.round(balance)) {
          return fail(res, 400, 'AMOUNT_MISMATCH', 'Payment amount does not match the outstanding balance.');
        }
      } else {
        chargeAmount = balance;
      }
    }

    if (!Number.isFinite(chargeAmount) || chargeAmount < 1) {
      return fail(res, 400, 'INVALID_AMOUNT', 'A positive payment amount is required.');
    }
    if (chargeAmount > MPESA_MAX_AMOUNT) {
      return fail(res, 400, 'AMOUNT_TOO_LARGE', `M-Pesa payments are limited to KSh ${MPESA_MAX_AMOUNT.toLocaleString('en-US')} per transaction.`);
    }

    const accountRef = text(account_reference, 12) || (invoice ? invoice.invoice_number : getMpesaConfig().accountReference);
    const push = await initiateStkPush({
      phone: msisdn,
      amount: chargeAmount,
      accountReference: accountRef,
      description: invoice ? `Invoice ${invoice.invoice_number}` : 'Lawn Craft payment',
    });

    if (push.ResponseCode && String(push.ResponseCode) !== '0') {
      return fail(res, 502, 'STK_PUSH_REJECTED', push.ResponseDescription || 'M-Pesa rejected the STK push request.');
    }

    const payment = {
      id: newId('pay'),
      invoice_id: invoice ? invoice.id : null,
      client_id: invoice ? invoice.client_id : null,
      phone: msisdn,
      amount: chargeAmount,
      account_reference: accountRef,
      merchant_request_id: push.MerchantRequestID || null,
      checkout_request_id: push.CheckoutRequestID || null,
      status: 'pending',
      result_code: null,
      result_desc: null,
      mpesa_receipt: null,
      created_at: new Date().toISOString(),
      raw_response: push,
    };
    await store.upsertPayment(payment);

    if (invoice) {
      invoice.payment_status = 'pending';
      invoice.payment_method = `Lipa Na M-Pesa (${msisdn})`;
      invoice.checkout_request_id = payment.checkout_request_id;
      await store.upsertInvoice(invoice);
    }

    return res.status(200).json({
      success: true,
      message: `STK Push sent to ${msisdn}. Enter your M-Pesa PIN on your handset to complete payment.`,
      checkout_request_id: payment.checkout_request_id,
      merchant_request_id: payment.merchant_request_id,
      customer_message: push.CustomerMessage || null,
      amount: chargeAmount,
      account_reference: accountRef,
    });
  } catch (err) {
    console.error('[stkPushMpesa Error]', err.message);
    return res.status(err.statusCode || 500).json({
      success: false,
      error: {
        message: err.statusCode ? err.message : 'STK push initiation failed.',
        code: err.code || 'STK_PUSH_FAILED',
      },
    });
  }
}

// Query the status of a pending M-Pesa payment (used by the client UI to poll).
// If Safaricom's callback has not arrived after a short grace period, ask
// Daraja directly so a lost callback never leaves the customer waiting.
export async function mpesaStatus(req, res) {
  try {
    if (!(await ensureProviders(res))) return;

    const { checkoutRequestId } = req.params;
    let payment = await store.paymentByCheckoutId(checkoutRequestId);

    if (!payment) {
      return fail(res, 404, 'PAYMENT_NOT_FOUND', 'Payment record not found.');
    }

    const ageMs = Date.now() - Date.parse(payment.created_at || 0);
    if (payment.status === 'pending' && isMpesaConfigured() && ageMs > STATUS_QUERY_AFTER_MS) {
      try {
        const result = await queryStkStatus({ checkoutRequestId: payment.checkout_request_id });
        await settleFromDarajaQuery(payment, result);
        payment = (await store.paymentByCheckoutId(checkoutRequestId)) || payment;
      } catch (err) {
        // Daraja answers HTTP 500 "transaction is being processed" while the
        // customer still has the prompt open; keep the payment pending.
        console.warn('[mpesaStatus] Daraja query did not return a result:', err.message);
      }
    }

    let invoice = null;
    if (payment.invoice_id) {
      invoice = await store.invoiceById(payment.invoice_id);
    }

    return res.status(200).json({
      success: true,
      data: {
        checkout_request_id: payment.checkout_request_id,
        status: payment.status,
        result_code: payment.result_code,
        result_desc: payment.result_desc,
        mpesa_receipt: payment.mpesa_receipt || null,
        amount: payment.amount,
        amount_paid: payment.amount_paid ?? null,
        invoice_id: payment.invoice_id || null,
        invoice_status: invoice ? invoice.status : null,
        invoice_balance_due: invoice ? invoice.balance_due : null,
      },
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      error: {
        message: 'Failed to retrieve payment status.',
        code: err.statusCode === 503 ? err.code : 'PAYMENT_STATUS_FAILED',
      },
    });
  }
}

// Settle a confirmed-success payment and its invoice (idempotent). The invoice
// is only marked paid when the amount M-Pesa actually confirmed covers the
// outstanding balance; a smaller amount is recorded as a partial payment.
async function applySuccessfulPayment(payment, { receipt, amount, phone, resultCode = '0', resultDesc, payload } = {}) {
  const alreadySettled = payment.status === 'success';
  const confirmedAmount = amount != null && Number.isFinite(Number(amount)) ? Number(amount) : Number(payment.amount);

  payment.status = 'success';
  payment.result_code = resultCode;
  payment.result_desc = resultDesc || 'The service request is processed successfully.';
  payment.mpesa_receipt = receipt || payment.mpesa_receipt;
  payment.amount_paid = confirmedAmount;
  payment.paid_phone = phone || payment.paid_phone || payment.phone;
  payment.completed_at = payment.completed_at || new Date().toISOString();
  if (payload) payment.callback_payload = payload;
  await store.upsertPayment(payment);

  // A replayed callback must not touch the invoice a second time.
  if (!alreadySettled && payment.invoice_id) {
    const invoice = await store.invoiceById(payment.invoice_id);
    if (invoice && invoice.status !== 'paid') {
      const balance = Number(invoice.balance_due ?? invoice.total_amount ?? 0);
      invoice.payment_method = `Lipa Na M-Pesa (${payment.paid_phone || payment.phone})`;
      invoice.mpesa_receipt = payment.mpesa_receipt;

      if (Math.round(confirmedAmount) >= Math.round(balance)) {
        invoice.status = 'paid';
        invoice.balance_due = 0.0;
        invoice.paid_at = new Date().toISOString();
        invoice.payment_status = 'paid';
        if (Math.round(confirmedAmount) > Math.round(balance)) {
          invoice.overpaid_by = Math.round((confirmedAmount - balance) * 100) / 100;
        }
      } else {
        console.warn(`[payments] Partial payment on ${invoice.id}: KSh ${confirmedAmount} of ${balance}`);
        invoice.status = 'partially_paid';
        invoice.balance_due = Math.round((balance - confirmedAmount) * 100) / 100;
        invoice.payment_status = 'partial';
      }
      await store.upsertInvoice(invoice);
    }
  }

  if (!alreadySettled) {
    void notify.notifyClientPaymentReceipt(payment, null).catch(() => {});
  }
}

// Mark a payment failed/cancelled; the invoice stays payable (idempotent).
async function applyFailedPayment(payment, { resultCode, resultDesc, payload } = {}) {
  if (payment.status === 'success') return; // never downgrade a confirmed payment
  const terminal = payment.status === 'failed' || payment.status === 'cancelled';
  payment.status = resultCode === '1032' ? 'cancelled' : 'failed';
  payment.result_code = resultCode;
  payment.result_desc = resultDesc || 'Payment was not completed.';
  if (payload) payment.callback_payload = payload;
  await store.upsertPayment(payment);

  if (payment.invoice_id) {
    const invoice = await store.invoiceById(payment.invoice_id);
    if (invoice && invoice.status !== 'paid') {
      invoice.payment_status = 'failed';
      await store.upsertInvoice(invoice);
    }
  }

  if (!terminal) {
    void notify.notifyClientPaymentFailed(payment, null).catch(() => {});
  }
}

function extractMetadata(source) {
  const metadata = Array.isArray(source?.CallbackMetadata?.Item) ? source.CallbackMetadata.Item : [];
  const findItem = (name) => metadata.find((item) => item && item.Name === name);
  return {
    receipt: findItem('MpesaReceiptNumber') ? String(findItem('MpesaReceiptNumber').Value) : null,
    amount: findItem('Amount') ? Number(findItem('Amount').Value) : null,
    phone: findItem('PhoneNumber') ? String(findItem('PhoneNumber').Value) : null,
  };
}

// Safaricom Daraja payment result callback. Always ACK with ResultCode 0 so
// Safaricom does not retry, even when reconciliation of the transaction fails.
export async function mpesaCallback(req, res) {
  const ack = () => res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });

  try {
    const config = getMpesaConfig();
    const providedToken = req.params?.token || req.query?.token;
    if (!verifyCallbackToken(providedToken, config)) {
      console.warn('[mpesaCallback] Rejected callback with an invalid or missing token.');
      return res.status(401).json({ ResultCode: 1, ResultDesc: 'Unauthorized' });
    }

    const callback = req.body?.Body?.stkCallback;
    if (!callback || !callback.CheckoutRequestID) {
      console.warn('[mpesaCallback] Received malformed callback payload.');
      return ack();
    }

    if (!(await ensureProviders(res))) {
      // Persistence is unavailable; ACK so Safaricom does not retry, and log for manual reconciliation.
      console.error('[mpesaCallback] Persistence unavailable while processing callback', callback.CheckoutRequestID);
      return ack();
    }

    const payment = await store.paymentByCheckoutId(String(callback.CheckoutRequestID));
    if (!payment) {
      console.warn('[mpesaCallback] No payment found for CheckoutRequestID', callback.CheckoutRequestID);
      return ack();
    }

    const resultCode = String(callback.ResultCode);

    if (resultCode === '0') {
      await applySuccessfulPayment(payment, {
        ...extractMetadata(callback),
        resultCode,
        resultDesc: callback.ResultDesc,
        payload: callback,
      });
    } else {
      await applyFailedPayment(payment, {
        resultCode,
        resultDesc: callback.ResultDesc,
        payload: callback,
      });
    }

    return ack();
  } catch (err) {
    console.error('[mpesaCallback Error]', err);
    // Still ACK to prevent Safaricom retry storms; the payment remains pending for reconciliation.
    return ack();
  }
}

/**
 * Apply a Daraja stkpushquery result to a pending payment.
 * Returns 'settled' | 'cancelled' | 'failed' | 'pending'.
 */
async function settleFromDarajaQuery(payment, result) {
  // stkpushquery returns ResultCode at the top level (and sometimes nested
  // under Body). Normalize both shapes.
  const topLevel = result?.Body ?? result ?? {};
  const queryCode = String(topLevel?.ResultCode ?? '');
  const queryDesc = String(topLevel?.ResultDesc ?? 'Unknown status');

  if (queryCode === '0') {
    await applySuccessfulPayment(payment, {
      ...extractMetadata(topLevel),
      resultCode: queryCode,
      resultDesc: queryDesc,
      payload: result,
    });
    return 'settled';
  }
  if (queryCode === '1032') {
    await applyFailedPayment(payment, { resultCode: queryCode, resultDesc: queryDesc, payload: result });
    return 'cancelled';
  }
  if (queryCode) {
    await applyFailedPayment(payment, { resultCode: queryCode, resultDesc: queryDesc, payload: result });
    return 'failed';
  }
  // Daraja reported no terminal result; keep pending for a later window.
  return 'pending';
}

// Lost-callback reconciliation: Daraja never delivered a result for a pending
// STK push, or our callback handler failed before confirming it. Query the
// official stkpushquery endpoint for stale pending payments and settle them.
export async function reconcilePendingPayments({
  graceMs = Number(process.env.RECONCILE_GRACE_MS || 15 * 60 * 1000),
  limit = Number(process.env.RECONCILE_BATCH_LIMIT || 25),
  budgetMs = Number(process.env.RECONCILE_TIME_BUDGET_MS || 40 * 1000),
} = {}) {
  const startedAt = Date.now();
  const thresholdIso = new Date(Date.now() - graceMs).toISOString();

  const pending = await store.pendingPaymentsOlderThan(thresholdIso, limit);

  const summary = {
    checked: 0,
    settled: 0,
    failed: 0,
    cancellations: 0,
    still_pending: 0,
    errors: 0,
    skipped_for_time: 0,
  };

  for (const payment of pending) {
    // Stay inside the serverless execution window; the next run picks up the rest.
    if (Date.now() - startedAt > budgetMs) {
      summary.skipped_for_time += 1;
      continue;
    }

    summary.checked += 1;
    if (!payment.checkout_request_id) {
      summary.errors += 1;
      continue;
    }

    try {
      const result = await queryStkStatus({ checkoutRequestId: payment.checkout_request_id });
      const outcome = await settleFromDarajaQuery(payment, result);
      if (outcome === 'settled') summary.settled += 1;
      else if (outcome === 'cancelled') summary.cancellations += 1;
      else if (outcome === 'failed') summary.failed += 1;
      else summary.still_pending += 1;
    } catch (err) {
      console.error('[reconcile] Status query failed for', payment.checkout_request_id, err.message);
      summary.errors += 1;
    }
  }

  return summary;
}

// Reconciliation endpoint (local background job / Vercel cron / admin trigger).
export async function reconcileHandler(req, res) {
  try {
    if (!(await ensureProviders(res))) return;
    if (!isMpesaConfigured()) {
      return res.status(200).json({ success: true, skipped: true, reason: 'MPESA_NOT_CONFIGURED' });
    }
    const summary = await reconcilePendingPayments();
    return res.status(200).json({ success: true, ...summary });
  } catch (err) {
    console.error('[reconcileHandler Error]', err.message);
    return res.status(err.statusCode || 500).json({
      success: false,
      error: { message: 'Payment reconciliation failed.', code: err.code || 'RECONCILE_FAILED' },
    });
  }
}

// Get Single Invoice (Strict Real Data, No Mock Fallback)
export async function getInvoice(req, res) {
  try {
    if (!(await ensureProviders(res))) return;

    const { invoiceId } = req.params;
    const inv = await store.invoiceById(invoiceId);

    if (!inv) {
      return fail(res, 404, 'INVOICE_NOT_FOUND', 'Invoice not found.');
    }

    return res.status(200).json({
      success: true,
      data: inv,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      error: {
        message: 'Failed to retrieve invoice.',
        code: err.statusCode === 503 ? err.code : 'INVOICE_FETCH_FAILED',
      },
    });
  }
}

// ---------------- Coupons ----------------

// Coupon Validator (informational; the same rules are re-applied server-side
// when an order is created, so this response is never trusted for pricing).
export async function validateCoupon(req, res) {
  try {
    if (!(await ensureProviders(res))) return;

    const code = text(req.body?.code, 32).toUpperCase();
    const orderAmount = Number(req.body?.amount || 4500);

    const validCoupons = getCoupons();

    const coupon = validCoupons[code];

    if (!coupon) {
      return res.status(400).json({
        valid: false,
        message: 'Invalid promo code. Try SPRING20 or FIRSTCUT.',
        code: 'INVALID_COUPON',
      });
    }

    if (coupon.minAmount && orderAmount < coupon.minAmount) {
      return res.status(400).json({
        valid: false,
        message: `Promo code ${code} requires a minimum order of KSh ${coupon.minAmount.toLocaleString()}.`,
        code: 'MIN_ORDER_NOT_MET',
      });
    }

    let discountAmount = 0;
    if (coupon.type === 'percent') {
      discountAmount = Math.round((orderAmount * (coupon.value / 100)) * 100) / 100;
    } else {
      discountAmount = Math.min(coupon.value, orderAmount);
    }

    const finalAmount = Math.max(0, Math.round((orderAmount - discountAmount) * 100) / 100);

    return res.status(200).json({
      valid: true,
      code,
      discount_type: coupon.type,
      discount_value: coupon.value,
      discount_amount: discountAmount,
      final_amount: finalAmount,
      description: coupon.desc,
      message: `Success! ${coupon.desc} applied.`,
    });
  } catch (err) {
    return res.status(500).json({
      valid: false,
      message: 'Failed to validate promo code.',
      code: 'VALIDATION_ERROR',
    });
  }
}

// Register Quote from Forms into Portal Store (delegates to the active backend)
export function registerQuoteInPortal(quoteData) {
  return store.registerQuote(quoteData);
}

// ERP / Portal statistics for system diagnostics
export async function getPortalStats() {
  return store.portalStats();
}
