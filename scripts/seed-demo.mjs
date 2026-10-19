// Seeds the development portal store with a rich, presentable demo client so a
// live sales demo never shows an empty hub. Development only: it refuses to run
// when NODE_ENV=production, and it writes to the same JSON file the dev server
// loads on boot (data/portal-store.json by default).
//
//   npm run demo:seed
//   npm run dev            # then sign in with the phone + PIN printed below
//
// Override the identity with DEMO_PHONE / DEMO_PIN / DEMO_NAME.
import { store } from '../node-backend/services/store.js';
import { hashPin } from '../node-backend/config/pins.js';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed demo data in production.');
  process.exit(1);
}

const DEMO_PHONE = process.env.DEMO_PHONE || '0712345678';
const DEMO_PIN = process.env.DEMO_PIN || '2468';
const DEMO_NAME = process.env.DEMO_NAME || 'Wanjiku Demo';

const now = Date.now();
const day = 86400000;
const dayIso = (offsetDays) => new Date(now + offsetDays * day).toISOString().split('T')[0];
const iso = (offsetDays) => new Date(now + offsetDays * day).toISOString();

const clientId = 'cl_demo_wanjiku';
const client = {
  id: clientId,
  name: DEMO_NAME,
  phone: DEMO_PHONE,
  email: (process.env.DEMO_EMAIL || 'demo@lawncraft.co.ke').toLowerCase(),
  address: '14 Muthaiga Close, Muthaiga, Nairobi',
  property_size: 8500,
  grass_type: 'Kikuyu Turf',
  service_plan: 'Bi-Weekly Precision Care',
  customer_since: 'Jan 2024',
  ...(() => {
    const { hash, salt } = hashPin(DEMO_PIN);
    return { access_pin_hash: hash, access_pin_salt: salt };
  })(),
  loyalty: {
    points_balance: 320,
    tier: 'Gold',
    rate_per_point: 50.0,
    dollar_value: 16000.0,
    cash_value: 16000.0,
    referral_code: 'LAWN-5678',
    next_tier: 'Platinum',
    points_to_next_tier: 80,
  },
};

const checklist = (doneCount) => [
  'Perimeter Safety Sweep & Obstacle Verification',
  'Precision Edge Detailing & Border Trim',
  'Core Precision Mowing (Standard Cut Height)',
  'Clippings Vacuuming & Green Waste Bagging',
  'Walkway, Patio & Driveway Blower Detailing',
].map((task, i) => ({ task, status: i < doneCount ? 'done' : 'pending' }));

const order = (suffix, overrides) => ({
  id: `wo_demo_${suffix}`,
  client_id: clientId,
  client_name: DEMO_NAME,
  client_phone: DEMO_PHONE,
  client_email: client.email,
  address: client.address,
  property_size: client.property_size,
  invoice_id: `inv_demo_${suffix}`,
  coupon_code: null,
  created_at: iso(-2),
  checklist: checklist(0),
  ...overrides,
});

const invoice = (suffix, overrides) => ({
  id: `inv_demo_${suffix}`,
  client_id: clientId,
  client_name: DEMO_NAME,
  client_phone: DEMO_PHONE,
  client_email: client.email,
  client_address: client.address,
  issue_date: dayIso(-2),
  due_date: dayIso(5),
  pin_number: process.env.COMPANY_KRA_PIN || undefined,
  discount: 0,
  coupon_code: null,
  ...overrides,
});

const price = 6800;
const withVat = (total) => ({
  total_amount: total,
  subtotal: Math.round((total / 1.16) * 100) / 100,
  tax_vat: Math.round((total - total / 1.16) * 100) / 100,
});

const workOrders = [
  // Live visit — drives the "Crew On-Site" badge and the in-progress timeline step.
  order('active', {
    title: `Precision Mow & Edge — ${DEMO_NAME}`,
    service_type: 'Precision Mow & Edge',
    status: 'in_progress',
    scheduled_date: dayIso(0),
    total_price: price,
    crew_name: 'Langata Crew B',
    crew_lead: 'Peter Kamau',
    crew_vehicle: 'LC-Truck 04',
    notes: 'Client asked for extra attention along the driveway border.',
    created_at: iso(-1),
    checklist: checklist(3),
  }),
  // Upcoming confirmed visit — carries the unpaid invoice (Pay With M-Pesa).
  order('upcoming', {
    title: `Bi-Weekly Care Visit — ${DEMO_NAME}`,
    service_type: 'Precision Mow & Edge',
    status: 'confirmed',
    scheduled_date: dayIso(3),
    total_price: price,
    crew_name: 'Pending Supervisor Dispatch',
    created_at: iso(-1),
  }),
  // Completed visits — populate "Recent Visits".
  order('past1', {
    title: `Precision Mow & Edge — ${DEMO_NAME}`,
    service_type: 'Precision Mow & Edge',
    status: 'completed',
    scheduled_date: dayIso(-12),
    completed_at: iso(-12),
    total_price: price,
    crew_name: 'Langata Crew B',
    created_at: iso(-13),
    checklist: checklist(5),
  }),
  order('past2', {
    title: `Hedge Trim & Border Detail — ${DEMO_NAME}`,
    service_type: 'Hedge Trim & Border Detail',
    status: 'completed',
    scheduled_date: dayIso(-26),
    completed_at: iso(-26),
    total_price: 4200,
    crew_name: 'Westlands Crew A',
    created_at: iso(-27),
    checklist: checklist(5),
  }),
  order('past3', {
    title: `Seasonal Feed & Aeration — ${DEMO_NAME}`,
    service_type: 'Seasonal Feed & Aeration',
    status: 'completed',
    scheduled_date: dayIso(-40),
    completed_at: iso(-40),
    total_price: 9500,
    crew_name: 'Westlands Crew A',
    created_at: iso(-41),
    checklist: checklist(5),
  }),
];

const invoices = [
  // Paid invoice for the live visit.
  invoice('active', {
    invoice_number: 'INV-2026-1041',
    service_title: 'Precision Mow & Edge',
    status: 'paid',
    balance_due: 0,
    estimated_total: price,
    paid_at: iso(-1),
    payment_status: 'paid',
    ...withVat(price),
  }),
  // Outstanding balance on the upcoming visit.
  invoice('upcoming', {
    invoice_number: 'INV-2026-1087',
    service_title: 'Bi-Weekly Care Visit',
    status: 'unpaid',
    balance_due: price,
    estimated_total: price,
    ...withVat(price),
  }),
  invoice('past1', {
    invoice_number: 'INV-2026-0988',
    service_title: 'Precision Mow & Edge',
    status: 'paid',
    balance_due: 0,
    estimated_total: price,
    paid_at: iso(-11),
    payment_status: 'paid',
    ...withVat(price),
  }),
];

async function main() {
  await store.upsertClient(client);
  for (const wo of workOrders) await store.upsertWorkOrder(wo);
  for (const inv of invoices) await store.upsertInvoice(inv);

  console.log('Demo data seeded.');
  console.log(`  Backend : ${store.backendName()}`);
  console.log(`  Client  : ${DEMO_NAME}`);
  console.log(`  Phone   : ${DEMO_PHONE}`);
  console.log(`  PIN     : ${DEMO_PIN}`);
  console.log(`  Orders  : ${workOrders.length} (1 in progress, 1 upcoming, 3 completed)`);
  console.log(`  Invoices: ${invoices.length} (1 unpaid)`);
  console.log('');
  console.log('If the dev server is already running, restart it so it reloads the store.');
}

main().catch((err) => {
  console.error('Demo seed failed:', err.message);
  process.exit(1);
});
