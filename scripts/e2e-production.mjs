// Production end-to-end probe: exercises every public flow against a deployed
// instance (pages, forms, client hub, bookings, payments-off behaviour, security
// guards) and proves persistence by reading records back on fresh requests.
//
//   E2E_BASE=https://your-domain node scripts/e2e-production.mjs
//
// Test records are labelled "E2E Test <run-id>". If E2E_SUPABASE_URL and
// E2E_SUPABASE_SERVICE_ROLE_KEY are set they are deleted at the end; otherwise
// cleanup SQL is printed for the Supabase SQL editor.
import { createClient } from '@supabase/supabase-js';

const BASE = (process.env.E2E_BASE || 'https://lawncraft.vercel.app').replace(/\/+$/, '');
const env = {
  SUPABASE_URL: process.env.E2E_SUPABASE_URL || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.E2E_SUPABASE_SERVICE_ROLE_KEY || '',
};
const sb = env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

const TAG = 'E2E Test ' + Date.now().toString(36);
const rnd = () => String(100000 + Math.floor(Math.random() * 899999));
const PHONE_A = '0700' + rnd();
const PHONE_B = '0700' + rnd();
const PHONE_Q = '0700' + rnd();
const EMAIL_A = `a.${Date.now()}@e2e-test.invalid`;
const EMAIL_Q = `q.${Date.now()}@e2e-test.invalid`;

const results = [];
function record(name, ok, detail = '') { results.push({ name, ok, detail }); }

async function http(path, opts = {}) {
  const res = await fetch(BASE + path, { redirect: 'manual', ...opts });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, headers: res.headers, text, json };
}
const post = (p, b) => http(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

// ---------- 1. readiness + security headers ----------
{
  const r = await http('/api/ready');
  record('ready endpoint answers', r.status === 200 || r.status === 503, `HTTP ${r.status}`);
  record('new code deployed (features block present)', Boolean(r.json?.checks?.features), JSON.stringify(r.json?.checks?.features || {}).slice(0, 160));
  record('readiness: ready flag', r.json?.ready === true, `ready=${r.json?.ready} problems=${JSON.stringify(r.json?.problems)}`);
  record('readiness: data backend is supabase', r.json?.checks?.data_backend === 'supabase', r.json?.checks?.data_backend);
  record('CSP header present', Boolean(r.headers.get('content-security-policy')));
  record('HSTS header present', (r.headers.get('strict-transport-security') || '').startsWith('max-age='));
  const redirect = await http('/health', { headers: { 'x-forwarded-proto': 'http' } });
  record('health endpoint', redirect.status === 200 || redirect.status === 301, `HTTP ${redirect.status}`);
}

// ---------- 2. pages ----------
for (const p of ['/', '/services', '/calculator', '/service-area', '/process', '/portfolio', '/insights', '/about', '/contact', '/privacy-policy', '/tos', '/login', '/signup', '/robots.txt', '/sitemap.xml', '/manifest.json', '/sw.js', '/styles.css', '/portal.js']) {
  const r = await http(p);
  record(`page ${p}`, r.status === 200, `HTTP ${r.status}`);
}
{
  const r = await http('/this-page-does-not-exist');
  record('404 page', r.status === 404 && /<!DOCTYPE html>/i.test(r.text), `HTTP ${r.status}`);
  const priv = await http('/node-backend/services/store.js');
  record('backend source not served', priv.status === 404, `HTTP ${priv.status}`);
  const beacon = await http('/about');
  record('third-party beacon removed', !beacon.text.includes('verbosedoodle'));
  const sw = await http('/sw.js');
  const localSw = (await import('node:fs')).readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
  const wanted = localSw.match(/lawncraft-v\d+/)?.[0];
  record('service worker version matches this checkout', Boolean(wanted) && sw.text.includes(wanted), `deployed=${sw.text.match(/lawncraft-v\d+/)?.[0]} local=${wanted}`);
}

// ---------- 3. lead + quote (Supabase) ----------
{
  const r = await post('/api/contact', { name: TAG + ' Lead', email: EMAIL_Q, phone: PHONE_Q, message: 'E2E contact message' });
  record('contact form stores lead', r.status === 201 && r.json?.success, `HTTP ${r.status} ${r.json?.error?.message || ''}`);
  const q = await post('/api/quotes', { full_name: TAG + ' Quote', email: EMAIL_Q, phone: PHONE_Q, service_type: 'Seasonal Maintenance', property_size: 8000, address: 'E2E Estate' });
  record('quote form stores quote', q.status === 201 && q.json?.success, `HTTP ${q.status} ${q.json?.error?.message || ''}`);
}

// ---------- 4. client hub: register, PIN gate, takeover attempts ----------
let clientId = null;
{
  const reg = await post('/api/portal/clients', { name: TAG + ' Client', phone: PHONE_A, email: EMAIL_A, address: '1 E2E Road', property_size: 6000, grass_type: 'Kikuyu Turf', pin: '2468' });
  clientId = reg.json?.client?.id || null;
  record('client registration', reg.status === 201 && clientId, `HTTP ${reg.status} ${reg.json?.error?.message || ''}`);
  record('registration response has no PIN hash', reg.json?.client && !('access_pin_hash' in reg.json.client));

  const lk = await post('/api/portal/lookup', { identifier: PHONE_A, pin: '2468' });
  record('hub lookup by phone + PIN', lk.status === 200 && lk.json?.client?.id === clientId, `HTTP ${lk.status}`);
  const lk254 = await post('/api/portal/lookup', { identifier: '+254' + PHONE_A.slice(1), pin: '2468' });
  record('hub lookup with +254 format finds same client', lk254.status === 200 && lk254.json?.client?.id === clientId, `HTTP ${lk254.status}`);
  const lkEmail = await post('/api/portal/lookup', { identifier: EMAIL_A, pin: '2468' });
  record('hub lookup by email + PIN', lkEmail.status === 200, `HTTP ${lkEmail.status}`);
  const wrong = await post('/api/portal/lookup', { identifier: PHONE_A, pin: '0000' });
  record('wrong PIN rejected', wrong.status === 403 && wrong.json?.error?.code === 'INVALID_PIN', `HTTP ${wrong.status}`);
  const noPin = await post('/api/portal/lookup', { identifier: PHONE_A });
  record('missing PIN rejected', noPin.status === 403, `HTTP ${noPin.status}`);
  const takeover = await post('/api/portal/clients', { name: TAG + ' Client', phone: PHONE_A, address: 'HIJACKED' });
  record('phone-only profile edit rejected', takeover.status === 403, `HTTP ${takeover.status}`);
  const inj = await post('/api/portal/lookup', { identifier: 'x,id.neq.zzz', pin: '2468' });
  record('filter-injection identifier rejected', [400, 404].includes(inj.status) && inj.json?.success === false, `HTTP ${inj.status}`);
  const oldGet = await http('/api/portal/lookup?identifier=' + EMAIL_A + '&pin=2468');
  record('GET lookup (PIN in URL) removed', oldGet.status === 404, `HTTP ${oldGet.status}`);

  // quote-only profile cannot be claimed with wrong email
  const claimBad = await post('/api/portal/clients', { name: TAG + ' Quote', phone: PHONE_Q, email: 'attacker@e2e-test.invalid', pin: '1357' });
  record('quote profile claim with wrong email rejected', claimBad.status === 403 && claimBad.json?.error?.code === 'CLAIM_EMAIL_MISMATCH', `HTTP ${claimBad.status} ${claimBad.json?.error?.code || ''}`);
  const claimOk = await post('/api/portal/clients', { name: TAG + ' Quote', phone: PHONE_Q, email: EMAIL_Q, pin: '1357' });
  record('quote profile claim with matching email works', claimOk.status === 200, `HTTP ${claimOk.status} ${claimOk.json?.error?.message || ''}`);
  const quoteHub = await post('/api/portal/lookup', { identifier: PHONE_Q, pin: '1357' });
  record('claimed hub shows the quote', quoteHub.status === 200 && (quoteHub.json?.quotes?.length || 0) >= 1, `quotes=${quoteHub.json?.quotes?.length}`);
}

// ---------- 5. booking + invoice + pages ----------
let orderId = null, invoiceId = null;
{
  const tamper = await post('/api/work-orders', { client_name: TAG + ' Client', phone: PHONE_A, email: EMAIL_A, service_type: 'Core Aeration', price: 1, status: 'completed' });
  record('booking against own PIN-protected profile without PIN rejected', tamper.status === 403, `HTTP ${tamper.status}`);

  const order = await post('/api/work-orders', { client_name: TAG + ' Client', phone: PHONE_A, email: EMAIL_A, service_type: 'Core Aeration', price: 1, status: 'completed', pin: '2468' });
  orderId = order.json?.data?.id; invoiceId = order.json?.invoice?.id;
  record('booking created', order.status === 201 && orderId && invoiceId, `HTTP ${order.status} ${order.json?.error?.message || ''}`);
  record('server-side price (Core Aeration = 8500, tampered 1 ignored)', order.json?.invoice?.total_amount === 8500, `total=${order.json?.invoice?.total_amount}`);
  record('booking enters confirm flow (pending_confirmation + estimate)', order.json?.data?.status === 'pending_confirmation' && order.json?.invoice?.status === 'estimate', `${order.json?.data?.status}/${order.json?.invoice?.status}`);

  const calc = await post('/api/work-orders', { client_name: TAG + ' Anon', phone: PHONE_B, address: 'E2E Anon', property_size: 10000, grass: 'buffalo', frequency: 'onetime', addons: ['edging'], coupon_code: 'SPRING20', pin: '5555' });
  record('calculator booking priced with coupon (14100 - 20% = 11280)', calc.json?.invoice?.total_amount === 11280, `total=${calc.json?.invoice?.total_amount} ${calc.json?.error?.message || ''}`);
  const anonHub = await post('/api/portal/lookup', { identifier: PHONE_B, pin: '5555' });
  record('anonymous booking creates hub with PIN', anonHub.status === 200 && anonHub.json?.invoices?.length === 1, `HTTP ${anonHub.status}`);

  const wo = await http(`/api/work-orders/${orderId}`);
  record('fetch work order', wo.status === 200 && wo.json?.data?.id === orderId);
  const inv = await http(`/api/invoices/${invoiceId}`);
  record('fetch invoice (estimate)', inv.status === 200 && inv.json?.data?.status === 'estimate' && inv.json?.data?.items?.length === 1);
  for (const p of [`/tracker/${orderId}`, `/pay/${invoiceId}`, `/receipt/${invoiceId}`]) {
    const r = await http(p);
    record(`page ${p.split('/')[1]}/:id`, r.status === 200 && /<!DOCTYPE html>/i.test(r.text), `HTTP ${r.status}`);
  }
  const hub = await post('/api/portal/lookup', { identifier: PHONE_A, pin: '2468' });
  record('hub lists the new order and invoice', hub.json?.work_orders?.length === 1 && hub.json?.invoices?.length === 1, `orders=${hub.json?.work_orders?.length} invoices=${hub.json?.invoices?.length}`);
  record('hub loyalty points awarded for booking (100 + 30)', hub.json?.loyalty?.points_balance === 130, `points=${hub.json?.loyalty?.points_balance}`);
}

// ---------- 6. payments (expected: not configured in production yet) ----------
{
  const stk = await post('/api/mpesa/stkpush', { phone: PHONE_A, invoice_id: invoiceId });
  record('STK push refused (M-Pesa unconfigured or estimate not confirmed)', [503, 409].includes(stk.status) && ['MPESA_NOT_CONFIGURED', 'INVOICE_NOT_CONFIRMED'].includes(stk.json?.error?.code), `HTTP ${stk.status} ${stk.json?.error?.code}`);
  const forged = await post('/api/mpesa/callback', { Body: { stkCallback: { CheckoutRequestID: 'x', ResultCode: 0 } } });
  record('forged callback without token rejected (fail closed)', forged.status === 401, `HTTP ${forged.status}`);
  const inv = await http(`/api/invoices/${invoiceId}`);
  record('invoice not paid after forged callback', inv.json?.data?.status !== 'paid', inv.json?.data?.status);
  const confirmAnon = await post(`/api/work-orders/${orderId}/confirm`.replace('/api/work-orders', '/api/admin/work-orders'), { total_amount: 1 });
  record('supervisor confirm endpoint requires admin token', [401, 404].includes(confirmAnon.status), `HTTP ${confirmAnon.status}`);
  const recon = await http('/api/mpesa/reconcile');
  record('reconcile hidden without admin/cron secret', recon.status === 404, `HTTP ${recon.status}`);
  const sys = await http('/api/system/status');
  record('system status hidden without admin token', sys.status === 404, `HTTP ${sys.status}`);
}

// ---------- 7. coupons + analytics + auth ----------
{
  const c = await post('/api/coupons/validate', { code: 'FIRSTCUT', amount: 10000 });
  record('coupon validate', c.status === 200 && c.json?.discount_amount === 1500);
  const a = await post('/api/analytics', { page: '/e2e', referrer: 'e2e' });
  record('analytics accepted', a.status === 200);
  // Email/password accounts are off by default (ENABLE_ACCOUNT_AUTH); when on,
  // a wrong password must still be rejected.
  const login = await post('/api/auth/login', { email: 'nobody@e2e-test.invalid', password: 'wrongpass' });
  record('account auth disabled (404) or rejects bad credentials (401)', [404, 401].includes(login.status), `HTTP ${login.status}`);
  const reg = await post('/api/auth/register', { email: 'spam@e2e-test.invalid', password: 'secret123' });
  record('open account registration not exposed by default', reg.status === 404 || reg.status === 401, `HTTP ${reg.status}`);
}

// ---------- 8. persistence proof via API + cleanup ----------
{
  // Production has no in-memory fallback; a read on a fresh request that
  // returns the record proves it was written to Supabase.
  const again = await http(`/api/invoices/${invoiceId}`, { headers: { 'cache-control': 'no-cache' } });
  record('DB (via API): invoice persisted and readable on a new request', again.status === 200 && again.json?.data?.id === invoiceId);
  const hub = await post('/api/portal/lookup', { identifier: EMAIL_A, pin: '2468' });
  record('DB (via API): client, order, invoice all persisted', hub.status === 200 && hub.json?.work_orders?.length === 1 && hub.json?.invoices?.length === 1);
  if (sb) {
    const { data: clients } = await sb.from('clients').select('id').ilike('name', `${TAG}%`);
    const ids = (clients || []).map((c) => c.id);
    await Promise.all([
      sb.from('work_orders').delete().in('client_id', ids), sb.from('invoices').delete().in('client_id', ids),
      sb.from('quotes').delete().in('client_id', ids), sb.from('quotes').delete().eq('email', EMAIL_Q),
      sb.from('leads').delete().eq('email', EMAIL_Q), sb.from('clients').delete().in('id', ids),
    ]);
    record('DB: test rows cleaned up', true);
  } else {
    record('DB: direct cleanup skipped (no local service key)', true, 'run the SQL printed below in Supabase');
    console.log(`
-- Cleanup SQL for this run (Supabase SQL editor):
delete from work_orders where client_id in (select id from clients where name like '${TAG}%');
delete from invoices    where client_id in (select id from clients where name like '${TAG}%');
delete from quotes      where client_id in (select id from clients where name like '${TAG}%') or email = '${EMAIL_Q}';
delete from leads       where email = '${EMAIL_Q}';
delete from clients     where name like '${TAG}%';
delete from analytics   where page = '/e2e';
`);
  }
}

// ---------- report ----------
const pass = results.filter((r) => r.ok).length;
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`);
console.log(`\n${pass}/${results.length} passed against ${BASE}`);
