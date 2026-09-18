import { checkSupabaseReachability } from '../config/supabase.js';
import { store, normalizeIdentifier } from '../services/store.js';
import {
  getMpesaConfig,
  isMpesaConfigured,
  initiateStkPush,
  normalizeMpesaPhone,
  verifyCallbackToken,
} from '../services/mpesa.js';
import { getCoupons } from '../config/coupons.js';

const isStrictRuntime = process.env.NODE_ENV === 'production' && process.env.ALLOW_IN_MEMORY_FALLBACK !== 'true';
const REACHABILITY_TTL_MS = 15_000;

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

// Create or Register a Client Profile
export async function createClientProfile(req, res) {
  try {
    if (!(await ensureProviders(res))) return;

    const { name, phone, email, address, property_size, grass_type, service_plan } = req.body || {};

    if (!name || name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: { message: 'Client full name is required (at least 2 characters).', code: 'INVALID_NAME' }
      });
    }

    if (!phone || phone.trim().length < 7) {
      return res.status(400).json({
        success: false,
        error: { message: 'A valid phone number is required.', code: 'INVALID_PHONE' }
      });
    }

    const normPhone = normalizeIdentifier(phone);
    const cleanEmail = email ? email.toLowerCase().trim() : '';

    // Check if already exists
    let existing = await store.findClientByPhoneOrEmail(phone, cleanEmail);
    if (existing) {
      // Update fields if provided
      if (address) existing.address = address;
      if (property_size) existing.property_size = Number(property_size);
      if (grass_type) existing.grass_type = grass_type;
      if (service_plan) existing.service_plan = service_plan;
      if (cleanEmail && !existing.email) existing.email = cleanEmail;
      await store.upsertClient(existing);

      return res.status(200).json({
        success: true,
        message: 'Client profile updated successfully.',
        client: existing
      });
    }

    const clientId = 'cl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const newClient = {
      id: clientId,
      name: name.trim(),
      phone: phone.trim(),
      email: cleanEmail,
      address: address ? address.trim() : '',
      property_size: Number(property_size) || 0,
      grass_type: grass_type || 'Kikuyu Turf',
      service_plan: service_plan || 'Custom Care',
      customer_since: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      loyalty: {
        points_balance: 100, // Welcome enrollment reward (KSh 5,000 value)
        tier: 'Bronze',
        rate_per_point: 50.00,
        dollar_value: 5000.00,
        cash_value: 5000.00,
        referral_code: 'LAWN-' + (normPhone.slice(-4) || 'VIP'),
        next_tier: 'Silver',
        points_to_next_tier: 150
      }
    };

    await store.upsertClient(newClient);

    return res.status(201).json({
      success: true,
      message: 'Client profile registered successfully.',
      client: newClient
    });
  } catch (err) {
    console.error('[createClientProfile Error]', err);
    return res.status(err.statusCode || 500).json({
      success: false,
      error: {
        message: 'Failed to create client profile.',
        code: err.statusCode === 503 ? err.code : 'CLIENT_CREATE_FAILED'
      }
    });
  }
}

// Lookup Client by Phone or Email (Strict Real Data, No Mock Synthetics)
export async function lookupClient(req, res) {
  try {
    if (!(await ensureProviders(res))) return;

    const rawIdentifier = req.body?.identifier || req.query?.identifier || '';
    const normalized = normalizeIdentifier(rawIdentifier);

    if (!normalized) {
      return res.status(400).json({
        success: false,
        error: { message: 'Phone number or email is required.', code: 'IDENTIFIER_REQUIRED' }
      });
    }

    const client = await store.findClient(rawIdentifier);

    // If not found, return a clean 404 (No fake profiles)
    if (!client) {
      return res.status(404).json({
        success: false,
        not_found: true,
        message: 'No registered client profile found for this phone number or email.',
        identifier: rawIdentifier
      });
    }

    const match = { id: client.id, phone: client.phone, email: client.email };

    // Gather client work orders
    const clientWorkOrders = await store.workOrdersByClient(match);

    // Gather client invoices
    const clientInvoices = await store.invoicesByClient(match);

    // Gather client quotes
    const clientQuotes = await store.quotesByClient(match);

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
        customer_since: client.customer_since
      },
      loyalty: client.loyalty,
      work_orders: clientWorkOrders,
      invoices: clientInvoices,
      quotes: clientQuotes
    });
  } catch (err) {
    console.error('[lookupClient Error]', err);
    return res.status(err.statusCode || 500).json({
      success: false,
      error: {
        message: 'Failed to retrieve client profile.',
        code: err.statusCode === 503 ? err.code : 'LOOKUP_FAILED'
      }
    });
  }
}

// 1-Click Work Order Booking (Creates Real Client + Order + Invoice)
export async function createWorkOrder(req, res) {
  try {
    if (!(await ensureProviders(res))) return;

    const payload = req.body || {};
    const serviceType = payload.service_type || payload.title || 'Precision Lawn Care';
    const clientName = (payload.client_name || payload.name || '').trim();
    const clientPhone = (payload.phone || payload.client_phone || '').trim();
    const clientEmail = (payload.email || payload.client_email || '').trim().toLowerCase();
    const address = (payload.address || '').trim() || 'Property Location Pending';
    const propertySize = Number(payload.property_size) || 0;
    const price = Number(payload.price || payload.total_price || 4500);
    let clientId = payload.client_id || null;

    if (!clientName) {
      return res.status(400).json({
        success: false,
        error: { message: 'Client name is required for booking.', code: 'NAME_REQUIRED' }
      });
    }

    if (!clientPhone) {
      return res.status(400).json({
        success: false,
        error: { message: 'Phone number is required for dispatch notification.', code: 'PHONE_REQUIRED' }
      });
    }

    const normPhone = normalizeIdentifier(clientPhone);

    // Look up or create client record
    let matchedClient = await store.findClientByPhoneOrEmail(clientPhone, clientEmail);

    if (matchedClient) {
      clientId = matchedClient.id;
      if (address && !matchedClient.address) matchedClient.address = address;
      if (propertySize && !matchedClient.property_size) matchedClient.property_size = propertySize;
      if (matchedClient.loyalty) {
        matchedClient.loyalty.points_balance += 30; // +30 points for booking
        matchedClient.loyalty.dollar_value = matchedClient.loyalty.points_balance * matchedClient.loyalty.rate_per_point;
        matchedClient.loyalty.cash_value = matchedClient.loyalty.dollar_value;
      }
      await store.upsertClient(matchedClient);
    } else {
      const newClientId = 'cl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      const newClient = {
        id: newClientId,
        name: clientName,
        phone: clientPhone,
        email: clientEmail,
        address: address,
        property_size: propertySize,
        grass_type: payload.grass_type || 'Turf Grass',
        service_plan: payload.service_plan || 'On-Demand Precision Care',
        customer_since: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        loyalty: {
          points_balance: 100, // 100 points enrollment + order reward (KSh 5,000 value)
          tier: 'Bronze',
          rate_per_point: 50.00,
          dollar_value: 5000.00,
          cash_value: 5000.00,
          referral_code: 'LAWN-' + (normPhone.slice(-4) || 'CARE'),
          next_tier: 'Silver',
          points_to_next_tier: 150
        }
      };
      await store.upsertClient(newClient);
      clientId = newClient.id;
    }

    const newOrderId = 'wo_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const invoiceId = 'inv_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

    const workOrder = {
      id: newOrderId,
      client_id: clientId,
      client_name: clientName,
      client_phone: clientPhone,
      client_email: clientEmail,
      title: `${serviceType} - ${clientName}`,
      service_type: serviceType,
      status: payload.status || 'incoming',
      scheduled_date: payload.scheduled_date || 'Next Available Slot (within 48 hrs)',
      total_price: price,
      property_size: propertySize,
      address: address,
      invoice_id: invoiceId,
      notes: payload.notes || 'Service booked online via Lawn Craft portal.',
      crew_name: 'Pending Supervisor Dispatch',
      checklist: [
        { task: 'Perimeter Safety Sweep & Obstacle Verification', status: 'pending' },
        { task: 'Precision Edge Detailing & Border Trim', status: 'pending' },
        { task: 'Core Precision Mowing (Standard Cut Height)', status: 'pending' },
        { task: 'Clippings Vacuuming & Green Waste Bagging', status: 'pending' },
        { task: 'Walkway, Patio & Driveway Blower Detailing', status: 'pending' }
      ]
    };

    await store.upsertWorkOrder(workOrder);

    // Auto-generate invoice
    const subtotal = Math.round((price / 1.16) * 100) / 100;
    const taxVat = Math.round((price - subtotal) * 100) / 100;
    const invoiceRecord = {
      id: invoiceId,
      invoice_number: 'INV-2026-' + Math.floor(1000 + Math.random() * 9000),
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
      items: [
        {
          description: propertySize ? `${serviceType} (${propertySize.toLocaleString()} sq ft)` : serviceType,
          quantity: 1,
          unit_price: price,
          amount: price
        }
      ]
    };

    await store.upsertInvoice(invoiceRecord);

    return res.status(201).json({
      success: true,
      message: 'Work order scheduled successfully and added to dispatch queue.',
      data: workOrder,
      invoice: invoiceRecord
    });
  } catch (err) {
    console.error('[createWorkOrder Error]', err);
    return res.status(err.statusCode || 500).json({
      success: false,
      error: {
        message: 'Failed to create work order.',
        code: err.statusCode === 503 ? err.code : 'CREATE_WORK_ORDER_FAILED'
      }
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
      return res.status(404).json({
        success: false,
        error: { message: 'Work order not found.', code: 'WORK_ORDER_NOT_FOUND' }
      });
    }

    return res.status(200).json({
      success: true,
      data: order
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      error: {
        message: 'Failed to fetch work order.',
        code: err.statusCode === 503 ? err.code : 'WORK_ORDER_FETCH_FAILED'
      }
    });
  }
}

// Lipa Na M-Pesa STK Push (real Safaricom Daraja integration)
export async function stkPushMpesa(req, res) {
  try {
    if (!(await ensureProviders(res))) return;

    if (!isMpesaConfigured()) {
      return res.status(503).json({
        success: false,
        error: {
          message: 'M-Pesa payments are not configured on this server.',
          code: 'MPESA_NOT_CONFIGURED',
        },
      });
    }

    const { phone, amount, invoice_id, account_reference } = req.body || {};

    const msisdn = normalizeMpesaPhone(phone);
    if (!msisdn) {
      return res.status(400).json({
        success: false,
        error: { message: 'A valid Kenyan M-Pesa phone number is required.', code: 'INVALID_PHONE' },
      });
    }

    let invoice = null;
    let chargeAmount = Number(amount);

    if (invoice_id) {
      invoice = await store.invoiceById(invoice_id);
      if (!invoice) {
        return res.status(404).json({
          success: false,
          error: { message: 'Invoice not found.', code: 'INVOICE_NOT_FOUND' },
        });
      }
      if (invoice.status === 'paid') {
        return res.status(409).json({
          success: false,
          error: { message: 'This invoice has already been paid.', code: 'INVOICE_ALREADY_PAID' },
        });
      }
      const balance = Number(invoice.balance_due ?? invoice.total_amount ?? 0);
      // The server is the source of truth for the amount; never trust a client-supplied total.
      if (Number.isFinite(chargeAmount) && chargeAmount > 0) {
        if (Math.round(chargeAmount) !== Math.round(balance)) {
          return res.status(400).json({
            success: false,
            error: { message: 'Payment amount does not match the outstanding balance.', code: 'AMOUNT_MISMATCH' },
          });
        }
      } else {
        chargeAmount = balance;
      }
    }

    if (!Number.isFinite(chargeAmount) || chargeAmount < 1) {
      return res.status(400).json({
        success: false,
        error: { message: 'A positive payment amount is required.', code: 'INVALID_AMOUNT' },
      });
    }

    const accountRef = account_reference || (invoice ? invoice.invoice_number : getMpesaConfig().accountReference);
    const push = await initiateStkPush({
      phone: msisdn,
      amount: chargeAmount,
      accountReference: accountRef,
      description: invoice ? `Invoice ${invoice.invoice_number}` : 'Lawn Craft payment',
    });

    if (push.ResponseCode && String(push.ResponseCode) !== '0') {
      return res.status(502).json({
        success: false,
        error: {
          message: push.ResponseDescription || 'M-Pesa rejected the STK push request.',
          code: 'STK_PUSH_REJECTED',
        },
      });
    }

    const payment = {
      id: 'pay_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
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
export async function mpesaStatus(req, res) {
  try {
    if (!(await ensureProviders(res))) return;

    const { checkoutRequestId } = req.params;
    const payment = await store.paymentByCheckoutId(checkoutRequestId);

    if (!payment) {
      return res.status(404).json({
        success: false,
        error: { message: 'Payment record not found.', code: 'PAYMENT_NOT_FOUND' },
      });
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
        invoice_id: payment.invoice_id || null,
        invoice_status: invoice ? invoice.status : null,
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

// Safaricom Daraja payment result callback. Always ACK with ResultCode 0 so
// Safaricom does not retry, even when reconciliation of the transaction fails.
export async function mpesaCallback(req, res) {
  const ack = () => res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });

  try {
    const config = getMpesaConfig();
    const providedToken = req.params?.token || req.query?.token;
    if (!verifyCallbackToken(providedToken, config)) {
      console.warn('[mpesaCallback] Rejected callback with an invalid token.');
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

    const payment = await store.paymentByCheckoutId(callback.CheckoutRequestID);
    if (!payment) {
      console.warn('[mpesaCallback] No payment found for CheckoutRequestID', callback.CheckoutRequestID);
      return ack();
    }

    const resultCode = String(callback.ResultCode);
    const metadata = Array.isArray(callback.CallbackMetadata?.Item)
      ? callback.CallbackMetadata.Item
      : [];
    const findItem = (name) => metadata.find((item) => item && item.Name === name);
    const receiptItem = findItem('MpesaReceiptNumber');
    const amountItem = findItem('Amount');
    const phoneItem = findItem('PhoneNumber');

    if (resultCode === '0') {
      const receipt = receiptItem ? String(receiptItem.Value) : null;
      payment.status = 'success';
      payment.result_code = resultCode;
      payment.result_desc = callback.ResultDesc || 'The service request is processed successfully.';
      payment.mpesa_receipt = receipt;
      payment.amount = amountItem ? Number(amountItem.Value) : payment.amount;
      payment.paid_phone = phoneItem ? String(phoneItem.Value) : payment.phone;
      payment.completed_at = new Date().toISOString();
      payment.callback_payload = callback;
      await store.upsertPayment(payment);

      if (payment.invoice_id) {
        const invoice = await store.invoiceById(payment.invoice_id);
        if (invoice && invoice.status !== 'paid') {
          invoice.status = 'paid';
          invoice.balance_due = 0.0;
          invoice.paid_at = new Date().toISOString();
          invoice.payment_method = `Lipa Na M-Pesa (${payment.paid_phone || payment.phone})`;
          invoice.mpesa_receipt = receipt;
          invoice.payment_status = 'paid';
          await store.upsertInvoice(invoice);
        }
      }
    } else {
      payment.status = resultCode === '1032' ? 'cancelled' : 'failed';
      payment.result_code = resultCode;
      payment.result_desc = callback.ResultDesc || 'Payment was not completed.';
      payment.callback_payload = callback;
      await store.upsertPayment(payment);

      if (payment.invoice_id) {
        const invoice = await store.invoiceById(payment.invoice_id);
        if (invoice && invoice.status !== 'paid') {
          invoice.payment_status = 'failed';
          await store.upsertInvoice(invoice);
        }
      }
    }

    return ack();
  } catch (err) {
    console.error('[mpesaCallback Error]', err);
    // Still ACK to prevent Safaricom retry storms; the payment remains pending for reconciliation.
    return ack();
  }
}

// Get Single Invoice (Strict Real Data, No Mock Fallback)
export async function getInvoice(req, res) {
  try {
    if (!(await ensureProviders(res))) return;

    const { invoiceId } = req.params;
    const inv = await store.invoiceById(invoiceId);

    if (!inv) {
      return res.status(404).json({
        success: false,
        error: { message: 'Invoice not found.', code: 'INVOICE_NOT_FOUND' }
      });
    }

    return res.status(200).json({
      success: true,
      data: inv
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      error: {
        message: 'Failed to retrieve invoice.',
        code: err.statusCode === 503 ? err.code : 'INVOICE_FETCH_FAILED'
      }
    });
  }
}

// Coupon Validator
export async function validateCoupon(req, res) {
  try {
    if (!(await ensureProviders(res))) return;

    const code = String(req.body?.code || '').trim().toUpperCase();
    const orderAmount = Number(req.body?.amount || 4500);

    const validCoupons = getCoupons();

    const coupon = validCoupons[code];

    if (!coupon) {
      return res.status(400).json({
        valid: false,
        message: 'Invalid promo code. Try SPRING20 or FIRSTCUT.',
        code: 'INVALID_COUPON'
      });
    }

    if (coupon.minAmount && orderAmount < coupon.minAmount) {
      return res.status(400).json({
        valid: false,
        message: `Promo code ${code} requires a minimum order of KSh ${coupon.minAmount.toLocaleString()}.`,
        code: 'MIN_ORDER_NOT_MET'
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
      message: `Success! ${coupon.desc} applied.`
    });
  } catch (err) {
    return res.status(500).json({
      valid: false,
      message: 'Failed to validate promo code.',
      code: 'VALIDATION_ERROR'
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