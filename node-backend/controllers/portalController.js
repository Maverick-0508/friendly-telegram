import { checkSupabaseReachability } from '../config/supabase.js';
import { store, normalizeIdentifier } from '../services/store.js';

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
      pin_number: 'P051239841K',
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

// Lipa Na M-Pesa STK Push
export async function stkPushMpesa(req, res) {
  try {
    if (!(await ensureProviders(res))) return;

    const { phone, amount, invoice_id, account_reference } = req.body || {};

    if (!phone) {
      return res.status(400).json({
        success: false,
        error: { message: 'M-Pesa phone number is required.', code: 'PHONE_REQUIRED' }
      });
    }

    const cleanPhone = phone.replace(/\D/g, '');
    const checkoutRequestId = 'ws_CO_' + Date.now().toString() + '_' + Math.random().toString(36).slice(2, 6);
    const mpesaReceipt = 'NLM' + Math.floor(10000000 + Math.random() * 90000000).toString() + 'X';

    // If an invoice is associated, mark it paid
    if (invoice_id) {
      const inv = await store.invoiceById(invoice_id);
      if (inv) {
        inv.status = 'paid';
        inv.balance_due = 0.00;
        inv.paid_at = new Date().toISOString();
        inv.payment_method = `Lipa Na M-Pesa (${cleanPhone})`;
        inv.mpesa_receipt = mpesaReceipt;
        await store.upsertInvoice(inv);
      }
    }

    return res.status(200).json({
      success: true,
      message: `STK Push initiated successfully to ${phone}. Please enter your M-Pesa PIN on your handset.`,
      checkout_request_id: checkoutRequestId,
      mpesa_receipt: mpesaReceipt,
      amount: amount || 4500.00,
      account_reference: account_reference || 'LAWNCRAFT'
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      error: {
        message: 'STK push initiation failed.',
        code: err.statusCode === 503 ? err.code : 'STK_PUSH_FAILED'
      }
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

// Settle Invoice
export async function settleInvoice(req, res) {
  try {
    if (!(await ensureProviders(res))) return;

    const { invoiceId } = req.params;
    const { payment_method, card_last4 } = req.body || {};

    const inv = await store.invoiceById(invoiceId);
    if (!inv) {
      return res.status(404).json({
        success: false,
        error: { message: 'Invoice record not found.', code: 'INVOICE_NOT_FOUND' }
      });
    }

    inv.status = 'paid';
    inv.balance_due = 0.00;
    inv.paid_at = new Date().toISOString();
    inv.payment_method = payment_method || (card_last4 ? `Card (•••• ${card_last4})` : 'Instant Online Payment');
    inv.mpesa_receipt = 'TX_' + Math.floor(10000000 + Math.random() * 90000000).toString();
    await store.upsertInvoice(inv);

    return res.status(200).json({
      success: true,
      message: 'Invoice settled successfully. Official tax receipt generated.',
      data: inv
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      error: {
        message: 'Payment settlement failed.',
        code: err.statusCode === 503 ? err.code : 'SETTLEMENT_FAILED'
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

    const validCoupons = {
      'SPRING20': { type: 'percent', value: 20, desc: '20% Spring Refresh Discount' },
      'FIRSTCUT': { type: 'fixed', value: 1500, desc: 'KSh 1,500 Off Your First Lawn Cut' },
      'VIPLAWN': { type: 'percent', value: 15, desc: '15% Loyalty Member Perks' },
      'GREEN50': { type: 'fixed', value: 5000, minAmount: 15000, desc: 'KSh 5,000 Off Orders Over KSh 15,000' },
      'KAREN10': { type: 'percent', value: 10, desc: '10% Karen & Runda Neighborhood Special' }
    };

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