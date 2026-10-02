// Pick a size (Regular or Large). Real radio buttons underneath, so the keyboard arrows, a screen
// reader and form behaviour all work for free; the chips are only the look.
//
//   sizes     [{ id, label, extra }]  (extra = rupees added to the base price)
//   basePrice the box's base price
//   value     the selected size id
//   onChange  (sizeId) => void
//   disabled  turns every size off (for example when the box is sold out)

import { useId } from 'react';

export default function SizeSelector({ sizes, basePrice, value, onChange, disabled = false, legend = 'Size' }) {
  const group = useId();
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="text-nav-link text-ink">{legend}</legend>
      <div className="mt-2 flex flex-wrap gap-3">
        {sizes.map((size) => {
          const id = `${group}-${size.id}`;
          return (
            <div key={size.id}>
              <input
                id={id}
                type="radio"
                name={group}
                value={size.id}
                checked={value === size.id}
                onChange={() => onChange(size.id)}
                className="peer sr-only"
              />
              <label
                htmlFor={id}
                className="flex min-h-11 cursor-pointer flex-col justify-center rounded-md border border-green-accent bg-surface-card px-4 py-1 text-ink motion-safe:transition-colors peer-checked:border-brand peer-checked:bg-brand peer-checked:text-on-brand peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus-ring peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
              >
                <span className="text-nav-link">{size.label}</span>
                <span className="text-small">
                  ₹{basePrice + size.extra}
                  {size.extra > 0 && <span className="opacity-80"> (+₹{size.extra})</span>}
                </span>
              </label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
