// One line in the cart: photo, name, size, price, quantity stepper, remove.
//
//   item        a priced line from useCart().items
//   maxQty      the most this line can hold (stock and per-line limit), from getMaxQuantity
//   onChangeQty (nextQty) => void
//   onRemove    () => void
//   locked      true while a payment is in progress (nothing may change then)

import OptimizedImage from '@/components/OptimizedImage';
import { useId } from 'react';

function StepIcon({ plus }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
      <path d="M5 12h14" />
      {plus && <path d="M12 5v14" />}
    </svg>
  );
}

const stepButton =
  'grid size-11 place-items-center rounded-full border border-green-accent text-brand-text motion-safe:transition-colors hover:bg-surface-cream disabled:cursor-not-allowed disabled:border-line disabled:text-ink-muted disabled:hover:bg-transparent';

export default function CartLineItem({ item, maxQty, onChangeQty, onRemove, locked = false }) {
  const { name, sizeLabel, image, qty, price, lineTotal, stock, available, inStock } = item;
  const hintId = useId();

  const atMax = qty >= maxQty;
  // Why the "+" is off, in words (never colour alone).
  const limitHint = atMax && available && inStock ? (maxQty >= 20 ? 'Maximum of 20 per box.' : `Only ${maxQty} available.`) : '';

  // A problem the customer has to fix before paying.
  let problem = '';
  if (!available) problem = 'This box is no longer available. Remove it to continue.';
  else if (stock <= 0) problem = 'Out of stock. Remove it to continue.';
  else if (!inStock) problem = `Only ${stock} left. Lower the quantity to continue.`;

  return (
    <li className="flex gap-4 rounded-xl border border-line bg-surface-card p-4 shadow-card">
      <div className="size-24 shrink-0 overflow-hidden rounded-md bg-surface-cream">
        {image ? (
          <OptimizedImage src={image} alt={name} width={96} height={96} className="h-full w-full rounded-md object-cover" />
        ) : (
          <div className="grid h-full place-items-center px-2 text-center text-small text-ink-muted">No photo yet</div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-heading-3 text-ink">{name}</h3>
            {available && <p className="text-small text-ink-muted">Size: {sizeLabel}</p>}
            {available && <p className="text-small text-ink-muted">₹{price} each</p>}
          </div>
          {available && <p className="text-heading-3 whitespace-nowrap text-brand-text">₹{lineTotal}</p>}
        </div>

        {problem && <p className="text-small font-bold text-danger">{problem}</p>}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          {available && stock > 0 ? (
            <div role="group" aria-label={`Quantity for ${name}, ${sizeLabel}`} className="flex items-center gap-1">
              <button
                type="button"
                className={stepButton}
                aria-label={`Decrease quantity of ${name}`}
                disabled={locked || qty <= 1}
                onClick={() => onChangeQty(qty - 1)}
              >
                <StepIcon />
              </button>
              <output aria-live="polite" className="min-w-9 text-center text-heading-3 text-ink">
                {qty}
              </output>
              <button
                type="button"
                className={stepButton}
                aria-label={`Increase quantity of ${name}`}
                aria-describedby={limitHint ? hintId : undefined}
                disabled={locked || atMax}
                onClick={() => onChangeQty(qty + 1)}
              >
                <StepIcon plus />
              </button>
            </div>
          ) : (
            <span />
          )}

          <button
            type="button"
            onClick={onRemove}
            disabled={locked}
            aria-label={`Remove ${name}${available ? `, ${sizeLabel}` : ''} from cart`}
            className="min-h-11 rounded-pill px-3 text-nav-link text-danger underline underline-offset-4 disabled:cursor-not-allowed disabled:text-ink-muted"
          >
            Remove
          </button>
        </div>

        {limitHint && (
          <p id={hintId} className="text-small text-ink-muted">
            {limitHint}
          </p>
        )}
      </div>
    </li>
  );
}
