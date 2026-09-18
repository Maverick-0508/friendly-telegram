// Promotion codes are business configuration, not hardcoded application data.
// Override or extend via the COUPONS_JSON environment variable, e.g.:
// COUPONS_JSON={"SPRING20":{"type":"percent","value":20,"desc":"20% off"}}
const DEFAULT_COUPONS = {
  SPRING20: { type: 'percent', value: 20, desc: '20% Spring Refresh Discount' },
  FIRSTCUT: { type: 'fixed', value: 1500, desc: 'KSh 1,500 Off Your First Lawn Cut' },
  VIPLAWN: { type: 'percent', value: 15, desc: '15% Loyalty Member Perks' },
  GREEN50: { type: 'fixed', value: 5000, minAmount: 15000, desc: 'KSh 5,000 Off Orders Over KSh 15,000' },
  KAREN10: { type: 'percent', value: 10, desc: '10% Karen & Runda Neighborhood Special' },
};

export function getCoupons() {
  const raw = process.env.COUPONS_JSON;
  if (!raw) return DEFAULT_COUPONS;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (err) {
    console.error('[coupons] COUPONS_JSON is not valid JSON; using defaults.', err.message);
  }
  return DEFAULT_COUPONS;
}
