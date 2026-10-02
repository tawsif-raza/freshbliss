// Delivery zones: pure functions, no React and no Firebase, so they are easy to test.
//
// A zone is one document in Firestore (`deliveryZones`), written only by the server and readable by
// everyone, so the checkout page can tell a customer their fee straight away. The rule here is the
// SAME rule the server uses in createCheckout/findZone: take the active zones, lowest `priority`
// number first, and the first one whose pincode pattern matches wins. The server still decides when
// the customer pays; this is only the instant preview.

export const PINCODE = /^[0-9]{6}$/;

// A raw Firestore zone -> a clean one, or null if it could not be used safely.
export function normaliseZone(id, data) {
  if (!data || data.active !== true) return null;
  const regex = data.match && typeof data.match.regex === 'string' ? data.match.regex : null;
  if (!regex || !Number.isInteger(data.fee) || data.fee < 0) return null;
  return {
    id,
    name: typeof data.name === 'string' ? data.name : id,
    fee: data.fee,
    etaMin: Number.isInteger(data.etaMin) ? data.etaMin : null,
    etaMax: Number.isInteger(data.etaMax) ? data.etaMax : null,
    regex,
    priority: Number.isFinite(data.priority) ? data.priority : 999,
    freeDeliveryFrom: Number.isInteger(data.freeDeliveryFrom) ? data.freeDeliveryFrom : null,
  };
}

// The zone that serves `pincode`, or null. A zone with a broken pattern is skipped, never fatal.
export function matchZone(zones, pincode) {
  if (typeof pincode !== 'string' || !PINCODE.test(pincode)) return null;
  const ordered = [...zones].sort((a, b) => a.priority - b.priority);
  for (const zone of ordered) {
    try {
      if (new RegExp(zone.regex).test(pincode)) return zone;
    } catch {
      // a bad pattern in the data: ignore this zone
    }
  }
  return null;
}

// What delivery costs for this zone and subtotal (whole rupees): free once the zone's threshold is met.
export function deliveryFeeFor(zone, subtotal) {
  if (!zone) return null;
  return zone.freeDeliveryFrom !== null && subtotal >= zone.freeDeliveryFrom ? 0 : zone.fee;
}

// "30 to 45 minutes", "Within 45 minutes", or '' when the zone has no estimate.
export function describeEta(zone) {
  if (!zone) return '';
  const { etaMin, etaMax } = zone;
  if (etaMin !== null && etaMax !== null) return etaMin === etaMax ? `${etaMin} minutes` : `${etaMin} to ${etaMax} minutes`;
  if (etaMax !== null) return `Within ${etaMax} minutes`;
  if (etaMin !== null) return `About ${etaMin} minutes`;
  return '';
}

// 0 -> "Free", otherwise "₹30".
export const feeLabel = (fee) => (fee === 0 ? 'Free' : `₹${fee}`);
