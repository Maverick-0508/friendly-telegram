import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabase } from '../config/supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Development-only JSON persistence. Tests point PORTAL_STORE_FILE at a
// per-suite file so parallel test processes do not clobber each other.
const DATA_FILE = process.env.PORTAL_STORE_FILE
  ? path.resolve(process.env.PORTAL_STORE_FILE)
  : path.join(__dirname, '../../data/portal-store.json');

const isStrictRuntime = process.env.NODE_ENV === 'production' && process.env.ALLOW_IN_MEMORY_FALLBACK !== 'true';
const allowDiskPersistence = process.env.NODE_ENV !== 'production';

function willUseSupabase() {
  return isStrictRuntime && !!supabase;
}

function assertStoreAvailable() {
  if (!willUseSupabase() && isStrictRuntime) {
    throw persistenceError('Persistence provider is not configured.');
  }
}

function persistenceError(message) {
  const err = new Error(message || 'Persistence provider is unavailable.');
  err.statusCode = 503;
  err.code = 'PERSISTENCE_UNAVAILABLE';
  return err;
}

// ---------------- Memory backend (development / non-strict) ----------------

const clients = new Map();
const workOrders = new Map();
const invoices = new Map();
const quotes = new Map();
const payments = new Map();
const paymentsByCheckout = new Map();
const mockLeads = [];
const analyticsEvents = [];

function normalizeIdentifier(raw) {
  if (!raw) return '';
  const str = String(raw).trim().toLowerCase();
  if (str.includes('@')) return str;
  const digits = str.replace(/\D/g, '');
  if (digits.startsWith('254') && digits.length === 12) {
    return '0' + digits.slice(3);
  }
  return digits;
}

function indexClient(client) {
  if (!client || !client.id) return;
  clients.set(client.id, client);
  if (client.phone) {
    clients.set(normalizeIdentifier(client.phone), client);
  }
  if (client.email) {
    clients.set(client.email.toLowerCase().trim(), client);
  }
}

function scanClientsFor(identifier) {
  const raw = String(identifier || '').trim();
  const key = normalizeIdentifier(raw);
  if (!key) return null;
  for (const c of clients.values()) {
    if (!c || !c.id) continue;
    if (normalizeIdentifier(c.phone || '') === key) return c;
    if (c.email && c.email.toLowerCase() === raw.toLowerCase()) return c;
  }
  return null;
}

function findClientMemory(identifier) {
  if (!identifier) return null;
  const raw = String(identifier).trim();
  const key = normalizeIdentifier(raw);
  return clients.get(key) || clients.get(raw.toLowerCase()) || scanClientsFor(raw);
}

function findClientByPhoneOrEmailMemory(phone, email) {
  const phoneKey = phone ? normalizeIdentifier(phone) : '';
  const emailKey = email ? String(email).trim().toLowerCase() : '';
  if (phoneKey) {
    const byPhone = clients.get(phoneKey) || scanClientsFor(phoneKey);
    if (byPhone) return byPhone;
  }
  if (emailKey) {
    return clients.get(emailKey) || scanClientsFor(emailKey);
  }
  return null;
}

function persistToDisk() {
  if (!allowDiskPersistence) return;
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const uniqueClients = Array.from(new Map(
      Array.from(clients.values()).filter(c => c && c.id).map(c => [c.id, c])
    ).values());
    const uniqueWorkOrders = Array.from(new Map(
      Array.from(workOrders.values()).filter(w => w && w.id).map(w => [w.id, w])
    ).values());
    const uniqueInvoices = Array.from(new Map(
      Array.from(invoices.values()).filter(i => i && i.id).map(i => [i.id, i])
    ).values());
    const uniqueQuotes = Array.from(new Map(
      Array.from(quotes.values()).filter(q => q && q.id).map(q => [q.id, q])
    ).values());

    fs.writeFileSync(DATA_FILE, JSON.stringify({
      clients: uniqueClients,
      workOrders: uniqueWorkOrders,
      invoices: uniqueInvoices,
      quotes: uniqueQuotes,
      payments: Array.from(payments.values()).filter(p => p && p.id),
    }, null, 2));
  } catch (err) {
    console.error('[portalStore] Error persisting data store:', err.message);
  }
}

function loadFromDisk() {
  if (!allowDiskPersistence) return;
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    if (!raw.trim()) return;
    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed.clients)) {
      for (const c of parsed.clients) {
        if (!c || !c.id) continue;
        clients.set(c.id, c);
        if (c.phone) clients.set(normalizeIdentifier(c.phone), c);
        if (c.email) clients.set(c.email.toLowerCase().trim(), c);
      }
    }
    if (Array.isArray(parsed.workOrders)) {
      for (const w of parsed.workOrders) {
        if (w && w.id) workOrders.set(w.id, w);
      }
    }
    if (Array.isArray(parsed.invoices)) {
      for (const i of parsed.invoices) {
        if (i && i.id) invoices.set(i.id, i);
      }
    }
    if (Array.isArray(parsed.quotes)) {
      for (const q of parsed.quotes) {
        if (q && q.id) quotes.set(q.id, q);
      }
    }
    if (Array.isArray(parsed.payments)) {
      for (const p of parsed.payments) {
        if (!p || !p.id) continue;
        payments.set(p.id, p);
        if (p.checkout_request_id) paymentsByCheckout.set(p.checkout_request_id, p.id);
      }
    }
  } catch (err) {
    console.error('[portalStore] Error loading data from disk:', err.message);
  }
}

loadFromDisk();

// ---------------- Supabase backend (production) ----------------

function hydrate(row) {
  if (row && row.data && typeof row.data === 'object' && !Array.isArray(row.data)) {
    return row.data;
  }
  return row;
}

// PostgREST `or=` filters are a mini-language: an unquoted value containing
// `,` or `)` would let a caller append their own conditions (e.g. `x,id.neq.0`
// matches every row). Every user-supplied value is therefore double-quoted
// with quotes/backslashes escaped, which PostgREST treats as a literal.
export function quoteFilterValue(value) {
  const str = String(value ?? '');
  return `"${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function eqFilter(column, value) {
  return `${column}.eq.${quoteFilterValue(value)}`;
}

// Build the standard "this record belongs to that client" OR-filter.
function clientMatchFilter(match) {
  const conds = [];
  if (match.id) conds.push(eqFilter('client_id', match.id));
  if (match.phone) {
    conds.push(eqFilter('phone', match.phone));
    const key = normalizeIdentifier(match.phone);
    if (key && key !== match.phone) conds.push(eqFilter('phone', key));
  }
  if (match.email) conds.push(eqFilter('email', String(match.email).toLowerCase()));
  return conds.join(',');
}

async function findClientSupabase(identifier) {
  if (!identifier) return null;
  const raw = String(identifier).trim();
  const isEmail = raw.includes('@');
  const key = normalizeIdentifier(raw);

  const { data, error } = isEmail
    ? await supabase.from('clients').select('*').eq('email', raw.toLowerCase()).limit(1)
    : await supabase.from('clients').select('*').or(`${eqFilter('phone', raw)},${eqFilter('phone', key)}`).limit(1);

  if (error) throw persistenceError(error.message);
  return data && data[0] ? hydrate(data[0]) : null;
}

async function findClientByPhoneOrEmailSupabase(phone, email) {
  const conds = [];
  if (phone) {
    const key = normalizeIdentifier(phone);
    conds.push(eqFilter('phone', phone), eqFilter('phone', key));
  }
  if (email) {
    conds.push(eqFilter('email', String(email).trim().toLowerCase()));
  }
  if (!conds.length) return null;

  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .or(conds.join(','))
    .limit(1);

  if (error) throw persistenceError(error.message);
  return data && data[0] ? hydrate(data[0]) : null;
}

// Indexed phone columns hold the normalized local form (07XXXXXXXX) so a
// client who registered as +2547... is still found when they type 07...
// Lookups query both the raw and normalized value, so rows written by earlier
// versions (raw phone) keep matching too.
function indexedPhone(raw) {
  if (!raw) return null;
  return normalizeIdentifier(raw) || String(raw).trim() || null;
}

async function upsertClientSupabase(client) {
  const { error } = await supabase
    .from('clients')
    .upsert({
      id: client.id,
      name: client.name || null,
      phone: indexedPhone(client.phone),
      email: client.email ? client.email.toLowerCase() : null,
      data: client,
    }, { onConflict: 'id' });

  if (error) throw persistenceError(error.message);
}

async function workOrderByIdSupabase(id) {
  const { data, error } = await supabase.from('work_orders').select('*').eq('id', id).limit(1);
  if (error) throw persistenceError(error.message);
  return data && data[0] ? hydrate(data[0]) : null;
}

async function upsertWorkOrderSupabase(wo) {
  const { error } = await supabase.from('work_orders').upsert({
    id: wo.id,
    client_id: wo.client_id || null,
    status: wo.status || null,
    invoice_id: wo.invoice_id || null,
    phone: indexedPhone(wo.client_phone),
    email: wo.client_email ? wo.client_email.toLowerCase() : null,
    data: wo,
  }, { onConflict: 'id' });

  if (error) throw persistenceError(error.message);
}

async function invoiceByIdSupabase(id) {
  const { data, error } = await supabase.from('invoices').select('*').eq('id', id).limit(1);
  if (error) throw persistenceError(error.message);
  return data && data[0] ? hydrate(data[0]) : null;
}

async function upsertInvoiceSupabase(inv) {
  const { error } = await supabase.from('invoices').upsert({
    id: inv.id,
    client_id: inv.client_id || null,
    status: inv.status || null,
    phone: indexedPhone(inv.client_phone),
    email: inv.client_email ? inv.client_email.toLowerCase() : null,
    data: inv,
  }, { onConflict: 'id' });

  if (error) throw persistenceError(error.message);
}

async function upsertQuoteSupabase(quote) {
  const { error } = await supabase.from('quotes').upsert({
    id: quote.id,
    client_id: quote.client_id || null,
    phone: indexedPhone(quote.phone),
    email: quote.email ? quote.email.toLowerCase() : null,
    data: quote,
  }, { onConflict: 'id' });

  if (error) throw persistenceError(error.message);
}

async function upsertPaymentSupabase(payment) {
  const { error } = await supabase.from('payments').upsert({
    id: payment.id,
    invoice_id: payment.invoice_id || null,
    client_id: payment.client_id || null,
    checkout_request_id: payment.checkout_request_id || null,
    merchant_request_id: payment.merchant_request_id || null,
    phone: payment.phone || null,
    amount: payment.amount ?? null,
    status: payment.status || null,
    updated_at: new Date().toISOString(),
    data: payment,
  }, { onConflict: 'id' });

  if (error) throw persistenceError(error.message);
}

async function paymentByIdSupabase(id) {
  const { data, error } = await supabase.from('payments').select('*').eq('id', id).limit(1);
  if (error) throw persistenceError(error.message);
  return data && data[0] ? hydrate(data[0]) : null;
}

async function paymentByCheckoutIdSupabase(checkoutRequestId) {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('checkout_request_id', checkoutRequestId)
    .limit(1);
  if (error) throw persistenceError(error.message);
  return data && data[0] ? hydrate(data[0]) : null;
}

async function pendingPaymentsOlderThanSupabase(thresholdIso, limit) {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('status', 'pending')
    .lt('created_at', thresholdIso)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw persistenceError(error.message);
  return (data || []).map(hydrate);
}

async function countPaymentsForPhoneSinceSupabase(phone, sinceIso) {
  const { count, error } = await supabase
    .from('payments')
    .select('id', { count: 'exact', head: true })
    .eq('phone', phone)
    .gte('created_at', sinceIso);
  if (error) throw persistenceError(error.message);
  return count || 0;
}

async function latestPendingPaymentForInvoiceSupabase(invoiceId) {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('invoice_id', invoiceId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw persistenceError(error.message);
  return data && data[0] ? hydrate(data[0]) : null;
}

async function trackAnalyticsSupabase(event) {
  const { error } = await supabase.from('analytics').insert({
    page: event.page || null,
    referrer: event.referrer || null,
    payload: event,
  });
  if (error) throw persistenceError(error.message);
}

// ---------------- Unified store API ----------------

export const store = {
  backendName() {
    if (willUseSupabase()) return 'supabase';
    return isStrictRuntime ? 'unavailable' : 'memory';
  },

  async findClient(identifier) {
    assertStoreAvailable();
    if (willUseSupabase()) return findClientSupabase(identifier);
    return findClientMemory(identifier);
  },

  async findClientByPhoneOrEmail(phone, email) {
    assertStoreAvailable();
    if (willUseSupabase()) return findClientByPhoneOrEmailSupabase(phone, email);
    return findClientByPhoneOrEmailMemory(phone, email);
  },

  async upsertClient(client) {
    assertStoreAvailable();
    if (willUseSupabase()) return upsertClientSupabase(client);
    indexClient(client);
    persistToDisk();
  },

  async workOrderById(id) {
    assertStoreAvailable();
    if (willUseSupabase()) return workOrderByIdSupabase(id);
    return workOrders.get(id) || null;
  },

  async upsertWorkOrder(wo) {
    assertStoreAvailable();
    if (willUseSupabase()) return upsertWorkOrderSupabase(wo);
    workOrders.set(wo.id, wo);
    persistToDisk();
  },

  async workOrdersByClient(match) {
    assertStoreAvailable();
    if (willUseSupabase()) {
      const filter = clientMatchFilter(match);
      if (!filter) return [];
      const { data, error } = await supabase.from('work_orders').select('*').or(filter);
      if (error) throw persistenceError(error.message);
      return (data || []).map(hydrate);
    }

    const normalized = match.phone ? normalizeIdentifier(match.phone) : '';
    return Array.from(workOrders.values())
      .filter(w => (
        (match.id && w.client_id === match.id) ||
        (w.client_phone && normalizeIdentifier(w.client_phone) === normalized) ||
        (w.client_email && match.email && w.client_email.toLowerCase() === String(match.email).toLowerCase())
      ))
      .sort((a, b) => (a.status === 'in_progress' ? -1 : 1));
  },

  async invoiceById(id) {
    assertStoreAvailable();
    if (willUseSupabase()) return invoiceByIdSupabase(id);
    return invoices.get(id) || null;
  },

  async upsertInvoice(inv) {
    assertStoreAvailable();
    if (willUseSupabase()) return upsertInvoiceSupabase(inv);
    invoices.set(inv.id, inv);
    persistToDisk();
  },

  async invoicesByClient(match) {
    assertStoreAvailable();
    if (willUseSupabase()) {
      const filter = clientMatchFilter(match);
      if (!filter) return [];
      const { data, error } = await supabase.from('invoices').select('*').or(filter);
      if (error) throw persistenceError(error.message);
      return (data || []).map(hydrate);
    }

    const normalized = match.phone ? normalizeIdentifier(match.phone) : '';
    return Array.from(invoices.values())
      .filter(i => (
        (match.id && i.client_id === match.id) ||
        (i.client_phone && normalizeIdentifier(i.client_phone) === normalized) ||
        (i.client_email && match.email && i.client_email.toLowerCase() === String(match.email).toLowerCase())
      ))
      .sort((a, b) => (a.status === 'unpaid' ? -1 : 1));
  },

  async quotesByClient(match) {
    assertStoreAvailable();
    if (willUseSupabase()) {
      const filter = clientMatchFilter(match);
      if (!filter) return [];
      const { data, error } = await supabase.from('quotes').select('*').or(filter);
      if (error) throw persistenceError(error.message);
      return (data || []).map(hydrate);
    }

    const normalized = match.phone ? normalizeIdentifier(match.phone) : '';
    return Array.from(quotes.values())
      .filter(q => (
        (match.id && q.client_id === match.id) ||
        (q.phone && normalizeIdentifier(q.phone) === normalized) ||
        (q.email && match.email && q.email.toLowerCase() === String(match.email).toLowerCase())
      ));
  },

  async submitLead(lead) {
    assertStoreAvailable();
    if (willUseSupabase()) {
      const { data, error } = await supabase
        .from('leads')
        .insert({
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          message: lead.message,
          source: lead.source || 'website',
        })
        .select('id, name, email, phone, message, source, created_at')
        .single();

      if (error) throw persistenceError(error.message);
      return data;
    }

    const mockLead = {
      id: lead.id || 'lead_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      message: lead.message,
      source: lead.source || 'website',
      created_at: lead.created_at || new Date().toISOString(),
    };
    mockLeads.push(mockLead);
    return mockLead;
  },

  async registerQuote(quoteData) {
    assertStoreAvailable();
    const rawPhone = quoteData.phone || '';
    const normPhone = normalizeIdentifier(rawPhone);
    const clientName = (quoteData.full_name || quoteData.name || '').trim() || 'Client';
    const clientEmail = (quoteData.email || '').trim().toLowerCase();
    const serviceType = quoteData.service_type || quoteData.service || 'Precision Lawn Care';

    let client = await this.findClientByPhoneOrEmail(rawPhone, clientEmail);

    if (!client) {
      client = {
        id: 'cl_' + Date.now().toString(36),
        name: clientName,
        phone: rawPhone,
        email: clientEmail,
        address: quoteData.address || '',
        property_size: Number(quoteData.property_size) || 0,
        grass_type: 'Turf Grass',
        service_plan: 'Custom Care',
        customer_since: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        loyalty: {
          points_balance: 50,
          tier: 'Bronze',
          rate_per_point: 50.00,
          dollar_value: 2500.00,
          cash_value: 2500.00,
          referral_code: 'LAWN-' + (normPhone.slice(-4) || 'CARE'),
          next_tier: 'Silver',
          points_to_next_tier: 200,
        },
      };
      await this.upsertClient(client);
    }

    const quoteId = quoteData.id || ('qt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5));
    const estimatedPrice = Number(quoteData.total_amount)
      || (Number(quoteData.property_size) ? Math.max(3500, Math.round(Number(quoteData.property_size) * 0.8)) : 4500.00);

    const newQuote = {
      id: quoteId,
      quote_number: 'QT-2026-' + Math.floor(1000 + Math.random() * 9000),
      client_id: client ? client.id : null,
      client_name: clientName,
      phone: rawPhone,
      email: clientEmail,
      title: `${serviceType} Consultation & Estimate`,
      status: 'pending_review',
      total_amount: estimatedPrice,
      address: quoteData.address || '',
      property_size: quoteData.property_size || null,
      property_type: quoteData.property_type || '',
      service_type: serviceType,
      service_frequency: quoteData.service_frequency || 'Bi-Weekly',
      preferred_start_date: quoteData.preferred_start_date || null,
      additional_details: quoteData.additional_details || quoteData.message || '',
      created_at: quoteData.created_at || new Date().toISOString(),
      items: [
        { description: `${serviceType} - Site Survey & Initial Cut`, amount: estimatedPrice },
      ],
    };

    await this.upsertQuote(newQuote);
    return newQuote;
  },

  async upsertQuote(quote) {
    assertStoreAvailable();
    if (willUseSupabase()) return upsertQuoteSupabase(quote);
    quotes.set(quote.id, quote);
    persistToDisk();
  },

  async paymentById(id) {
    assertStoreAvailable();
    if (willUseSupabase()) return paymentByIdSupabase(id);
    return payments.get(id) || null;
  },

  async paymentByCheckoutId(checkoutRequestId) {
    assertStoreAvailable();
    if (!checkoutRequestId) return null;
    if (willUseSupabase()) return paymentByCheckoutIdSupabase(checkoutRequestId);
    const id = paymentsByCheckout.get(checkoutRequestId);
    return id ? payments.get(id) || null : null;
  },

  async pendingPaymentsOlderThan(thresholdIso, limit = 50) {
    assertStoreAvailable();
    if (willUseSupabase()) return pendingPaymentsOlderThanSupabase(thresholdIso, limit);
    const cut = Date.parse(thresholdIso);
    return Array.from(payments.values())
      .filter((p) => p && p.status === 'pending' && Date.parse(p.created_at || 0) < cut)
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
      .slice(0, limit);
  },

  // Number of STK pushes sent to a phone since `sinceIso` (abuse throttle).
  async countPaymentsForPhoneSince(phone, sinceIso) {
    assertStoreAvailable();
    if (willUseSupabase()) return countPaymentsForPhoneSinceSupabase(phone, sinceIso);
    const cut = Date.parse(sinceIso);
    return Array.from(payments.values())
      .filter((p) => p && p.phone === phone && Date.parse(p.created_at || 0) >= cut)
      .length;
  },

  // Most recent still-pending STK push for an invoice (duplicate-prompt guard).
  async latestPendingPaymentForInvoice(invoiceId) {
    assertStoreAvailable();
    if (!invoiceId) return null;
    if (willUseSupabase()) return latestPendingPaymentForInvoiceSupabase(invoiceId);
    return Array.from(payments.values())
      .filter((p) => p && p.invoice_id === invoiceId && p.status === 'pending')
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0] || null;
  },

  async trackAnalytics(event) {
    assertStoreAvailable();
    if (willUseSupabase()) return trackAnalyticsSupabase(event);
    analyticsEvents.push({ ...event, ts: new Date().toISOString() });
    return null;
  },

  async upsertPayment(payment) {
    assertStoreAvailable();
    if (willUseSupabase()) return upsertPaymentSupabase(payment);
    payments.set(payment.id, payment);
    if (payment.checkout_request_id) {
      paymentsByCheckout.set(payment.checkout_request_id, payment.id);
    }
    persistToDisk();
    return payment;
  },

  async portalStats() {
    assertStoreAvailable();
    if (willUseSupabase()) {
      const [clientsRes, woRes, invoicesRes, quotesRes] = await Promise.all([
        supabase.from('clients').select('id'),
        supabase.from('work_orders').select('status'),
        supabase.from('invoices').select('status'),
        supabase.from('quotes').select('id'),
      ]);
      for (const res of [clientsRes, woRes, invoicesRes, quotesRes]) {
        if (res.error) throw persistenceError(res.error.message);
      }
      const statuses = (list) => new Set((list || []).map(x => x.status));
      return {
        store_backend: 'supabase',
        total_clients: (clientsRes.data || []).length,
        total_work_orders: (woRes.data || []).length,
        total_invoices: (invoicesRes.data || []).length,
        total_quotes: (quotesRes.data || []).length,
        active_in_progress_crews: (woRes.data || []).filter(w => w.status === 'in_progress').length,
        unpaid_invoices: (invoicesRes.data || []).filter(i => i.status === 'unpaid').length,
      };
    }

    return {
      store_backend: 'memory',
      total_clients: clients.size,
      total_work_orders: workOrders.size,
      total_invoices: invoices.size,
      total_quotes: quotes.size,
      active_in_progress_crews: Array.from(workOrders.values()).filter(w => w.status === 'in_progress').length,
      unpaid_invoices: Array.from(invoices.values()).filter(i => i.status === 'unpaid').length,
    };
  },
};

export { normalizeIdentifier };