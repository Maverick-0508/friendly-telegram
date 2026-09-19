// Lightweight outbound notification service.
//
// Every provider is optional and configured purely through environment
// variables. When the required secrets are blank (the default), notification
// calls log and return without throwing, so the rest of the request is never
// affected by a missing or failing provider.
//
// - Email: Resend (RESEND_API_KEY + NOTIFY_FROM_EMAIL)
// - SMS:   Africa's Talking (AFRICAS_TALKING_USERNAME + AFRICAS_TALKING_API_KEY)

const DEFAULT_TIMEOUT_MS = 10000;

function env(name) {
  const value = process.env[name];
  return value === undefined || value === null ? '' : String(value).trim();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function isEmailConfigured() {
  return Boolean(env('RESEND_API_KEY') && env('NOTIFY_FROM_EMAIL'));
}

export function isSmsConfigured() {
  return Boolean(env('AFRICAS_TALKING_USERNAME') && env('AFRICAS_TALKING_API_KEY'));
}

export function ownerEmail() {
  return env('OWNER_EMAIL') || '';
}

function siteUrl() {
  return (env('PUBLIC_SITE_URL') || 'https://lawncraft.vercel.app').replace(/\/+$/, '');
}

async function fetchWithTimeout(url, options, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Send an email through Resend. Resolves without throwing when unconfigured. */
export async function sendEmail({ to, subject, html, text }) {
  if (!isEmailConfigured()) {
    console.log(`[notify:email] Not configured; skipping "${subject}" to ${to}`);
    return null;
  }
  if (!to) return null;

  try {
    const res = await fetchWithTimeout('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env('NOTIFY_FROM_EMAIL'),
        to: [to],
        subject,
        html,
        text,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`[notify:email] Resend returned ${res.status}: ${detail.slice(0, 400)}`);
      return null;
    }
    return await res.json().catch(() => ({}));
  } catch (err) {
    console.error('[notify:email] Send failed:', err.message);
    return null;
  }
}

/** Send an SMS through Africa's Talking. Resolves without throwing when unconfigured. */
export async function sendSms({ to, message }) {
  if (!isSmsConfigured()) {
    console.log(`[notify:sms] Not configured; skipping SMS to ${to}: ${message}`);
    return null;
  }
  if (!to) return null;

  const digits = String(to).replace(/\D/g, '');
  const msisdn = digits.length === 12 && digits.startsWith('254') ? `+${digits}` : digits;
  const payload = new URLSearchParams();
  payload.set('username', env('AFRICAS_TALKING_USERNAME'));
  payload.set('to', msisdn);
  payload.set('message', message);
  const senderId = env('AFRICAS_TALKING_SENDER');
  if (senderId) payload.set('from', senderId);

  try {
    const res = await fetchWithTimeout('https://api.africastalking.com/version1/messaging', {
      method: 'POST',
      headers: {
        apiKey: env('AFRICAS_TALKING_API_KEY'),
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: payload.toString(),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`[notify:sms] Africa's Talking returned ${res.status}: ${detail.slice(0, 400)}`);
      return null;
    }
    return await res.json().catch(() => ({}));
  } catch (err) {
    console.error('[notify:sms] Send failed:', err.message);
    return null;
  }
}

// ---------------- Composed helpers ----------------

export async function notifyNewLead(lead) {
  const to = ownerEmail();
  if (!to) return null;
  const html = `
    <h2>New lawn care enquiry</h2>
    <p><strong>Name:</strong> ${escapeHtml(lead.name)}</p>
    <p><strong>Phone:</strong> ${escapeHtml(lead.phone)}</p>
    <p><strong>Email:</strong> ${escapeHtml(lead.email)}</p>
    <p><strong>Message:</strong></p>
    <pre>${escapeHtml(lead.message)}</pre>
  `;
  return sendEmail({ to, subject: `New enquiry from ${lead.name}`, html });
}

export async function notifyQuoteRequest(quote) {
  const to = ownerEmail();
  if (!to) return null;
  const html = `
    <h2>New quote request</h2>
    <p><strong>Name:</strong> ${escapeHtml(quote.client_name)}</p>
    <p><strong>Phone:</strong> ${escapeHtml(quote.phone)}</p>
    <p><strong>Email:</strong> ${escapeHtml(quote.email)}</p>
    <p><strong>Service:</strong> ${escapeHtml(quote.service_type)}</p>
    <p><strong>Estimated total:</strong> KSh ${quote.total_amount}</p>
    <p><strong>Address:</strong> ${escapeHtml(quote.address)}</p>
    <p><strong>Details:</strong></p>
    <pre>${escapeHtml(quote.additional_details)}</pre>
  `;
  return sendEmail({ to, subject: `New quote request: ${quote.service_type}`, html });
}

export async function notifyOwnerNewOrder(order, invoice) {
  const to = ownerEmail();
  if (!to) return null;
  const html = `
    <h2>New work order queued for dispatch</h2>
    <p><strong>Order:</strong> ${escapeHtml(order.id)}</p>
    <p><strong>Client:</strong> ${escapeHtml(order.client_name)}</p>
    <p><strong>Phone:</strong> ${escapeHtml(order.client_phone)}</p>
    <p><strong>Email:</strong> ${escapeHtml(order.client_email)}</p>
    <p><strong>Service:</strong> ${escapeHtml(order.service_type)}</p>
    <p><strong>Address:</strong> ${escapeHtml(order.address)}</p>
    <p><strong>Total:</strong> KSh ${order.total_price}</p>
    <p><strong>Invoice:</strong> ${invoice ? escapeHtml(invoice.invoice_number) : order.invoice_id}</p>
  `;
  return sendEmail({ to, subject: `New work order: ${order.service_type}`, html });
}

export async function notifyClientOrderBooked(order, { mode = 'confirm' } = {}) {
  if (!order.client_phone) return null;
  const message = mode === 'confirm'
    ? `Lawn Craft: We received your request for "${order.service_type}" (estimate KSh ${Math.round(order.total_price || 0)}). We will confirm the final price by SMS before any payment. Track: ${siteUrl()}/tracker/${order.id}`
    : `Lawn Craft: Your order "${order.service_type}" is queued for dispatch (est. 48 hrs). Track it at ${siteUrl()}/tracker/${order.id}`;
  return sendSms({ to: order.client_phone, message });
}

export async function notifyClientOrderConfirmed(order, invoice) {
  if (!order.client_phone) return null;
  const amount = Math.round(Number(invoice?.balance_due ?? invoice?.total_amount ?? order.total_price ?? 0));
  const when = order.scheduled_date ? ` Scheduled: ${order.scheduled_date}.` : '';
  return sendSms({
    to: order.client_phone,
    message: `Lawn Craft: Your "${order.service_type}" booking is confirmed at KSh ${amount}.${when} Pay securely with M-Pesa: ${siteUrl()}/pay/${invoice?.id || order.invoice_id}`,
  });
}

export async function notifyClientPaymentReceipt(payment, invoice) {
  if (!payment.phone) return null;
  const amount = payment.amount != null ? `KSh ${payment.amount}` : '';
  return sendSms({
    to: payment.phone,
    message: `Lawn Craft: Payment of ${amount} received${payment.mpesa_receipt ? ` (M-Pesa ref ${payment.mpesa_receipt})` : ''}. ${payment.invoice_id ? `Receipt: ${siteUrl()}/receipt/${payment.invoice_id}` : 'Thank you!'}`,
  });
}

export async function notifyClientPaymentFailed(payment, invoice) {
  if (!payment.phone) return null;
  return sendSms({
    to: payment.phone,
    message: `Lawn Craft: Your payment attempt ${payment.amount != null ? `of KSh ${payment.amount} ` : ''}was not completed. Please try again or contact us.`,
  });
}