// Server-side price catalogue. The browser never decides what an order costs:
// it sends the *inputs* (service, lawn size, grass, frequency, add-ons, promo
// code) and the server computes the price with these rates. Keep the numbers in
// sync with the calculator UI in public/portal.js so the estimate a visitor sees
// matches the invoice they receive.
//
// Override any of these via PRICING_JSON, e.g.
// PRICING_JSON={"minimumOrder":3000,"services":{"Core Aeration":9000}}

import { getCoupons } from './coupons.js';

const DEFAULT_PRICING = {
  // Absolute floor for any invoice (KSh).
  minimumOrder: 2500,
  // Minimum for a mowing job before frequency / add-ons.
  minimumCut: 3500,
  // Used when a request names no known service and no lawn size.
  defaultServicePrice: 4500,
  // Lawn-cut rates per square foot, keyed by grass type.
  grass: {
    kikuyu: { name: 'Kikuyu Turf', ratePerSqFt: 0.7 },
    bermuda: { name: 'Bermuda Tifway', ratePerSqFt: 0.8 },
    paspalum: { name: 'Paspalum', ratePerSqFt: 0.75 },
    buffalo: { name: 'Buffalo Grass', ratePerSqFt: 0.9 },
  },
  frequency: {
    weekly: { name: 'Weekly (Best Health)', multiplier: 0.85 },
    biweekly: { name: 'Bi-Weekly (Most Popular)', multiplier: 1.0 },
    monthly: { name: 'Monthly Maintenance', multiplier: 1.25 },
    onetime: { name: 'One-Time Precision Cut', multiplier: 1.4 },
  },
  // Calculator add-ons (flat KSh).
  addons: {
    edging: { name: 'Precision Edge Trimming', price: 1500 },
    fertilizer: { name: 'Organic Feed Treatment', price: 3500 },
    aeration: { name: 'Core Soil Aeration', price: 5500 },
    hedges: { name: 'Perimeter Hedge Shaping', price: 3000 },
  },
  // Fixed-price services bookable by name (1-click add-ons in the hub, quotes).
  services: {
    'Core Aeration': 8500,
    'Hedge Sculpting': 4500,
    'Sprinkler Tune-Up': 5000,
    'Organic Bio-Fertilization': 6500,
    'Lawn Mowing': 4500,
    'Lawn Edging': 2500,
    'Seasonal Maintenance': 6500,
    'Full Landscape Maintenance': 12000,
    'Precision Lawn Care': 4500,
  },
};

let cached = null;
let cachedRaw = undefined;

export function getPricing() {
  const raw = process.env.PRICING_JSON;
  if (cached && cachedRaw === raw) return cached;
  cachedRaw = raw;
  cached = DEFAULT_PRICING;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        cached = {
          ...DEFAULT_PRICING,
          ...parsed,
          grass: { ...DEFAULT_PRICING.grass, ...(parsed.grass || {}) },
          frequency: { ...DEFAULT_PRICING.frequency, ...(parsed.frequency || {}) },
          addons: { ...DEFAULT_PRICING.addons, ...(parsed.addons || {}) },
          services: { ...DEFAULT_PRICING.services, ...(parsed.services || {}) },
        };
      }
    } catch (err) {
      console.error('[pricing] PRICING_JSON is not valid JSON; using defaults.', err.message);
    }
  }
  return cached;
}

function findServicePrice(pricing, serviceType) {
  if (!serviceType) return null;
  const wanted = String(serviceType).trim().toLowerCase();
  for (const [name, price] of Object.entries(pricing.services)) {
    if (name.toLowerCase() === wanted) return { name, price: Number(price) };
  }
  return null;
}

function applyCoupon(code, subtotal) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) return { code: null, discount: 0 };
  const coupon = getCoupons()[normalized];
  if (!coupon) return { code: normalized, discount: 0, invalid: true };
  if (coupon.minAmount && subtotal < coupon.minAmount) {
    return { code: normalized, discount: 0, invalid: true, reason: 'MIN_ORDER_NOT_MET' };
  }
  const discount = coupon.type === 'percent'
    ? Math.round(subtotal * (Number(coupon.value) / 100))
    : Math.min(Number(coupon.value) || 0, subtotal);
  return { code: normalized, discount, description: coupon.desc || '' };
}

/**
 * Compute the authoritative price for a booking request.
 *
 * Accepted inputs (all optional, all validated):
 *   service_type   – a catalogue service name (fixed price), or a free-form
 *                    label when lawn-cut inputs are supplied
 *   property_size  – lawn size in sq ft (drives the lawn-cut price)
 *   grass          – key of pricing.grass (kikuyu | bermuda | ...)
 *   frequency      – key of pricing.frequency (weekly | biweekly | ...)
 *   addons         – array of pricing.addons keys
 *   coupon_code    – promo code applied server-side
 *
 * Returns { total, subtotal, discount, coupon, line_items, service_type }.
 */
export function priceWorkOrder(input = {}) {
  const pricing = getPricing();
  const propertySize = Math.max(0, Math.min(1_000_000, Math.round(Number(input.property_size) || 0)));
  const grassKey = String(input.grass || '').toLowerCase();
  const freqKey = String(input.frequency || '').toLowerCase();
  const addonKeys = Array.isArray(input.addons)
    ? input.addons.map((k) => String(k).toLowerCase()).filter((k) => pricing.addons[k])
    : [];
  const lineItems = [];

  const fixed = findServicePrice(pricing, input.service_type);
  const wantsLawnCut = Boolean(pricing.grass[grassKey] || pricing.frequency[freqKey]);

  let serviceType = fixed ? fixed.name : String(input.service_type || '').trim();
  let subtotal = 0;

  if (fixed && !wantsLawnCut) {
    subtotal = fixed.price;
    lineItems.push({ description: fixed.name, quantity: 1, unit_price: fixed.price, amount: fixed.price });
  } else {
    const grass = pricing.grass[grassKey] || pricing.grass.kikuyu;
    const freq = pricing.frequency[freqKey] || pricing.frequency.biweekly;
    const sizeForPricing = propertySize || 5000;
    let cut = Math.max(pricing.minimumCut, Math.round(sizeForPricing * grass.ratePerSqFt));
    cut = Math.round(cut * freq.multiplier);
    if (!serviceType) serviceType = `${grass.name} Cut (${freq.name})`;
    subtotal = cut;
    lineItems.push({
      description: `${serviceType} (${sizeForPricing.toLocaleString('en-US')} sq ft)`,
      quantity: 1,
      unit_price: cut,
      amount: cut,
    });
  }

  for (const key of addonKeys) {
    const addon = pricing.addons[key];
    subtotal += addon.price;
    lineItems.push({ description: addon.name, quantity: 1, unit_price: addon.price, amount: addon.price });
  }

  const coupon = applyCoupon(input.coupon_code, subtotal);
  const total = Math.max(pricing.minimumOrder, subtotal - coupon.discount);

  return {
    service_type: serviceType || 'Precision Lawn Care',
    property_size: propertySize,
    subtotal,
    discount: coupon.discount,
    coupon: coupon.discount > 0 ? { code: coupon.code, description: coupon.description } : null,
    coupon_rejected: coupon.invalid ? coupon.code : null,
    total,
    line_items: lineItems,
  };
}
