// Tells a visitor, in plain words, what we know about delivery to their pincode.
// Pure display: the matching is done by lib/zoneMatch.js, from the live zones in Firestore.
//
//   pincode  what they have typed so far
//   zones    the live zones, and zonesStatus: 'loading' | 'ready' | 'error'
//   subtotal (optional) the cart subtotal, so a "free from ₹X" zone can show its real fee
//
// Four outcomes: nothing typed yet, still typing, inside an area (fee and estimate), outside every
// area. If the zones could not be loaded it says nothing alarming: the server checks the pincode when
// the customer pays.

import { PINCODE, deliveryFeeFor, describeEta, feeLabel, matchZone } from '@/lib/zoneMatch';

// The result as plain data, so a page can also act on it (for example block the Pay button).
//   { kind: 'empty' | 'typing' | 'checking' | 'unknown' | 'outside' | 'ok', zone? }
export function zoneOutcome(pincode, zones, zonesStatus) {
  if (!pincode) return { kind: 'empty' };
  if (!PINCODE.test(pincode)) return { kind: 'typing' };
  if (zonesStatus === 'loading') return { kind: 'checking' };
  if (zonesStatus === 'error') return { kind: 'unknown' };
  const zone = matchZone(zones, pincode);
  return zone ? { kind: 'ok', zone } : { kind: 'outside' };
}

export default function ZoneStatus({ pincode, zones, zonesStatus, subtotal = 0, className = '' }) {
  const outcome = zoneOutcome(pincode, zones, zonesStatus);

  if (outcome.kind === 'outside') {
    return (
      <div role="alert" className={`rounded-sm border-l-[5px] border-danger bg-surface-danger p-4 ${className}`}>
        <p className="text-nav-link text-ink">Outside delivery area</p>
        <p className="mt-1 text-small text-ink">We do not deliver to {pincode} yet. Try a different pincode.</p>
      </div>
    );
  }

  if (outcome.kind === 'ok') {
    const fee = deliveryFeeFor(outcome.zone, subtotal);
    const eta = describeEta(outcome.zone);
    return (
      <p role="status" className={`rounded-sm border-l-[5px] border-gold bg-surface-callout p-4 text-small text-ink ${className}`}>
        <span className="font-bold">We deliver to {pincode}.</span> Delivery: <span className="font-bold">{feeLabel(fee)}</span>
        {eta && <> · Arrives in {eta}</>}
        {outcome.zone.name && <span className="text-ink-muted"> ({outcome.zone.name})</span>}
      </p>
    );
  }

  // Nothing to warn about: keep the space for screen readers to announce later changes.
  return (
    <p role="status" className={`text-small text-ink-muted ${className}`}>
      {outcome.kind === 'typing' ? 'Enter all 6 digits.' : outcome.kind === 'checking' ? 'Checking delivery area...' : ''}
    </p>
  );
}
