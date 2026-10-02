// A quantity with minus and plus buttons that stop at the limits.
//
//   value     the quantity now
//   max       the most that can be chosen (stock left, and the per-line limit). 0 = none can be added.
//   onChange  (quantity) => void
//   label     what the quantity is of, for screen readers ("Classic Fresh Mix")
//   compact   smaller buttons, for tight spaces like the slide-out cart (still a comfortable tap size)
//
// The buttons turn off at the limits instead of letting a customer ask for what we cannot sell.

export default function QuantityStepper({ value, onChange, max, min = 1, label = 'Quantity', disabled = false, compact = false }) {
  const none = max < min;
  const atMin = value <= min;
  const atMax = value >= max;
  const button = `grid ${compact ? 'size-10' : 'size-11'} place-items-center rounded-full border border-green-accent bg-surface-card text-heading-3 text-brand-text hover:bg-surface-cream disabled:cursor-not-allowed disabled:border-line disabled:text-ink-muted disabled:hover:bg-surface-card`;

  return (
    <div role="group" aria-label={label} className="inline-flex items-center gap-3">
      <button type="button" className={button} aria-label={`Decrease ${label}`} disabled={disabled || none || atMin} onClick={() => onChange(value - 1)}>
        <span aria-hidden="true">−</span>
      </button>
      <output aria-live="polite" className={`${compact ? 'min-w-6 text-body font-bold' : 'min-w-8 text-heading-3'} text-center text-ink`}>
        {none ? 0 : value}
      </output>
      <button type="button" className={button} aria-label={`Increase ${label}`} disabled={disabled || none || atMax} onClick={() => onChange(value + 1)}>
        <span aria-hidden="true">+</span>
      </button>
    </div>
  );
}
