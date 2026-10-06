// "Do we deliver to you?": a one-line pincode check on the home page, so a visitor learns the fee and the wait before they
// choose a box. It uses the LIVE delivery zones (lib/zones.js), the same matching rule as the product page and the checkout
// (lib/zoneMatch.js), and the same words (components/ZoneStatus.js). A valid pincode is remembered in this browser, so the
// product page, the cart and the checkout start with it filled in.
//
// It only PREVIEWS: the server checks the pincode again when the customer pays.

import { useId, useState } from 'react';
import { MapPin } from 'lucide-react';
import ZoneStatus from '@/components/ZoneStatus';
import { PINCODE, useSavedPincode, useZones } from '@/lib/zones';

export default function PincodeCheck() {
  const id = useId();
  const { zones, status } = useZones();
  const { pincode: saved, setPincode } = useSavedPincode();
  // What the visitor is typing now; until they type, show the pincode saved from an earlier visit.
  const [typed, setTyped] = useState(null);
  const value = typed ?? saved;

  function onChange(event) {
    const digits = event.target.value.replace(/\D/g, '').slice(0, 6);
    setTyped(digits);
    if (PINCODE.test(digits)) setPincode(digits);
  }

  return (
    <section id="delivery" aria-labelledby={`${id}-title`} className="scroll-mt-24 border-b border-line/60 bg-surface-cream">
      <div className="fb-container grid items-center gap-6 py-8 md:grid-cols-[1fr_minmax(0,28rem)] md:gap-12 md:py-10">
        <div className="flex items-start gap-4">
          <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-full bg-brand text-on-brand">
            <MapPin size={24} strokeWidth={1.75} />
          </span>
          <div>
            <h2 id={`${id}-title`} className="text-heading-3 text-brand-text">
              Do we deliver to you?
            </h2>
            <p className="mt-1 text-body text-ink-muted">Enter your pincode to see the delivery fee and how long it usually takes.</p>
          </div>
        </div>

        <div>
          <label htmlFor={id} className="sr-only">
            Your pincode
          </label>
          <input
            id={id}
            value={value}
            onChange={onChange}
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={6}
            placeholder="560001"
            aria-describedby={`${id}-result`}
            className="min-h-12 w-full rounded-pill border border-green-accent bg-surface-card px-5 text-body text-ink tracking-widest placeholder:tracking-normal placeholder:text-ink-muted"
          />
          <div id={`${id}-result`} className="mt-3 min-h-[3.5rem]">
            <ZoneStatus pincode={value} zones={zones} zonesStatus={status} />
          </div>
        </div>
      </div>
    </section>
  );
}
