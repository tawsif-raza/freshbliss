// Pick a tip for the rider: pill buttons for ₹0, ₹10, ₹20 and ₹30 (the only amounts the server accepts).
// Real radio buttons underneath, so the arrow keys and screen readers work.

import { useId } from 'react';
import { TIP_OPTIONS } from '@/lib/pricing';

export default function TipSelector({ value, onChange, disabled = false }) {
  const group = useId();
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="text-nav-link text-ink">Rider tip</legend>
      <p className="text-small text-ink-muted">Optional. A thank-you to your rider.</p>
      <div className="mt-2 flex flex-wrap gap-3">
        {TIP_OPTIONS.map((amount) => {
          const id = `${group}-${amount}`;
          return (
            <div key={amount}>
              <input id={id} type="radio" name={group} value={amount} checked={value === amount} onChange={() => onChange(amount)} className="peer sr-only" />
              <label
                htmlFor={id}
                className="inline-grid min-h-11 min-w-16 cursor-pointer place-items-center rounded-pill border border-green-accent bg-surface-card px-4 text-nav-link text-brand-text motion-safe:transition-colors peer-checked:border-brand peer-checked:bg-brand peer-checked:text-on-brand peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus-ring peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
              >
                ₹{amount}
              </label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
