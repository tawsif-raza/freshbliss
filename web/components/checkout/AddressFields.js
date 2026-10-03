// The delivery address as three boxes plus a "Save as" tag, in place of one big text area:
//   House / Flat / Block No.   (required)     Apartment / Road / Area   (required)     Landmark   (optional)
//   Save as:  Home | Work | Other
// On a phone the boxes stack; from the small breakpoint up the first two share a row and the landmark runs the
// full width, so the right-hand edge lines up with the "Delivery instructions" box below (both fill the card).
// checkout/index.js joins the parts into the one address line the order stores (lib/address.js: formatAddress).
//
//   value     { flat, area, landmark, addressType }
//   onChange  (patch) => void        merged into the form by the page
//   errors    { flat, area }          messages to show, or null/undefined
//   flatRef, areaRef                  so the page can focus the first box with a problem
//   disabled                          true while the order is being paid
//
// The tags are real radio buttons (so the arrow keys and screen readers work as people expect), dressed as pills:
// the chosen one stays deep green with light text.

import { Briefcase, House, MapPin } from 'lucide-react';
import { Field, inputClass } from '@/components/Field';
import { ADDRESS_LIMITS, ADDRESS_TYPES } from '@/lib/address';

const TAG_ICONS = { home: House, work: Briefcase, other: MapPin };

// Deep green focus ring on these inputs (the page-wide one is gold).
const box = (invalid) => `${inputClass(invalid)} min-h-11 focus-visible:outline-brand`;

export default function AddressFields({ value, onChange, errors = {}, flatRef, areaRef, disabled = false }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="House / Flat / Block No." error={errors.flat}>
          {({ id, invalid, describedBy }) => (
            <input
              ref={flatRef}
              id={id}
              type="text"
              value={value.flat}
              onChange={(e) => onChange({ flat: e.target.value })}
              maxLength={ADDRESS_LIMITS.flat}
              autoComplete="address-line1"
              placeholder="Flat 4B"
              aria-invalid={invalid}
              aria-describedby={describedBy}
              disabled={disabled}
              className={box(invalid)}
            />
          )}
        </Field>

        <Field label="Apartment / Road / Area" error={errors.area}>
          {({ id, invalid, describedBy }) => (
            <input
              ref={areaRef}
              id={id}
              type="text"
              value={value.area}
              onChange={(e) => onChange({ area: e.target.value })}
              maxLength={ADDRESS_LIMITS.area}
              autoComplete="address-line2"
              placeholder="MG Road, Indiranagar"
              aria-invalid={invalid}
              aria-describedby={describedBy}
              disabled={disabled}
              className={box(invalid)}
            />
          )}
        </Field>

        <div className="sm:col-span-2">
          <Field label="Landmark" optional>
            {({ id }) => (
              <input
                id={id}
                type="text"
                value={value.landmark}
                onChange={(e) => onChange({ landmark: e.target.value })}
                maxLength={ADDRESS_LIMITS.landmark}
                placeholder="Near Metro station"
                disabled={disabled}
                className={box(false)}
              />
            )}
          </Field>
        </div>
      </div>

      <fieldset disabled={disabled}>
        <legend className="text-nav-link text-ink">Save as</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {ADDRESS_TYPES.map((tag) => {
            const Icon = TAG_ICONS[tag.id];
            return (
              <label key={tag.id} className="relative">
                <input type="radio" name="address-type" value={tag.id} checked={value.addressType === tag.id} onChange={() => onChange({ addressType: tag.id })} className="peer sr-only" />
                <span className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-pill border border-line bg-surface-card px-5 text-nav-link text-brand-text motion-safe:transition-colors motion-safe:duration-200 hover:bg-surface-cream peer-checked:border-brand peer-checked:bg-brand peer-checked:text-on-brand peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-gold-bright peer-disabled:cursor-not-allowed peer-disabled:opacity-60">
                  <Icon size={18} aria-hidden="true" />
                  {tag.label}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
