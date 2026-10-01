// A small confirmation box that opens inside an order card, so a destructive
// action (cancel, refund) always takes a second, deliberate step.
//
//   title        what is being confirmed
//   children     the fields and notes
//   confirmLabel / busyLabel   the confirm button's text (and while working)
//   closeLabel   the "never mind" button's text
//   busy         true while the request is running
//   error        a message to show if it failed
//   onConfirm / onClose

import { useEffect, useRef } from 'react';
import Callout from '@/components/Callout';

export default function ActionPanel({ title, children, confirmLabel, busyLabel, closeLabel, busy = false, error = null, onConfirm, onClose }) {
  const ref = useRef(null);

  // Move keyboard focus into the box when it opens.
  useEffect(() => {
    ref.current?.querySelector('input, select, textarea, button')?.focus();
  }, []);

  return (
    <div
      ref={ref}
      role="group"
      aria-label={title}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !busy) onClose();
      }}
      className="mt-4 rounded-md border border-line bg-surface-cream p-4"
    >
      <h3 className="text-nav-link text-ink">{title}</h3>
      <div className="mt-3 flex flex-col gap-3">{children}</div>

      {error && (
        <Callout tone="danger" className="mt-3">
          {error}
        </Callout>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          aria-busy={busy}
          className="min-h-11 rounded-pill bg-brand px-5 text-nav-link text-on-brand hover:brightness-110 disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-muted"
        >
          {busy ? busyLabel : confirmLabel}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="min-h-11 rounded-pill border border-green-accent px-5 text-nav-link text-brand-text hover:bg-surface-card disabled:cursor-not-allowed disabled:text-ink-muted"
        >
          {closeLabel}
        </button>
      </div>
    </div>
  );
}
