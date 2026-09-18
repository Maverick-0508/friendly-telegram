import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabase } from '../config/supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, '../../data/portal-store.json');

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
const mockLeads = [];

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

async function findClientSupabase(identifier) {
  if (!identifier) return null;
  const raw = String(identifier).trim();
  const isEmail = raw.includes('@');
  const key = normalizeIdentifier(raw);

  const { data, error } = isEmail
    ? await supabase.from('clients').select('*').eq('email', raw.toLowerCase()).limit(1)
    : await supabase.from('clients').select('*').or(`phone.eq.${raw},phone.eq.${key}`).limit(1);

  if (error) throw persistenceError(error.message);
  return data && data[0] ? hydrate(data[0]) : null;
}

async function findClientByPhoneOrEmailSupabase(phone, email) {
  const conds = [];
  if (!conds.length && phone) {
    const key = normalizeIdentifier(phone);
    conds.push(`phone.eq.${phone}`, `phone.eq.${key}`);
  }
  if (email) {
    conds.push(`email.eq.${String(email).trim().toLowerCase()}`);
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

async function upsertClientSupabase(client) {
  const { error } = await supabase
    .from('clients')
    .upsert({
      id: client.id,
      name: client.name || null,
      phone: client.phone || null,
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
    phone: wo.client_phone || null,
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
    phone: inv.client_phone || null,
    email: inv.client_email ? inv.client_email.toLowerCase() : null,
    data: inv,
  }, { onConflict: 'id' });

  if (error) throw persistenceError(error.message);
}

async function upsertQuoteSupabase(quote) {
  const { error } = await supabase.from('quotes').upsert({
    id: quote.id,
    client_id: quote.client_id || null,
    phone: quote.phone || null,
    email: quote.email ? quote.email.toLowerCase() : null,
    data: quote,
  }, { onConflict: 'id' });

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
      const conds = [];
      const key = match.phone ? normalizeIdentifier(match.phone) : '';
      if (match.id) conds.push(`client_id.eq.${match.id}`);
      if (match.phone) conds.push(`phone.eq.${match.phone}`, `phone.eq.${key}`);
      if (match.email) conds.push(`email.eq.${String(match.email).toLowerCase()}`);
      if (!conds.length) return [];
      const { data, error } = await supabase.from('work_orders').select('*').or(conds.join(','));
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
      const conds = [];
      const key = match.phone ? normalizeIdentifier(match.phone) : '';
      if (match.id) conds.push(`client_id.eq.${match.id}`);
      if (match.phone) conds.push(`phone.eq.${match.phone}`, `phone.eq.${key}`);
      if (match.email) conds.push(`email.eq.${String(match.email).toLowerCase()}`);
      if (!conds.length) return [];
      const { data, error } = await supabase.from('invoices').select('*').or(conds.join(','));
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
      const conds = [];
      const key = match.phone ? normalizeIdentifier(match.phone) : '';
      if (match.id) conds.push(`client_id.eq.${match.id}`);
      if (match.phone) conds.push(`phone.eq.${match.phone}`, `phone.eq.${key}`);
      if (match.email) conds.push(`email.eq.${String(match.email).toLowerCase()}`);
      if (!conds.length) return [];
      const { data, error } = await supabase.from('quotes').select('*').or(conds.join(','));
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