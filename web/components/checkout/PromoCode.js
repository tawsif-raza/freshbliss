// The promo code box. The customer types a code and presses Apply; the PAGE then asks the server
// whether it is good (promo codes exist only on the server, so a visitor can never list them) and
// tells this widget what it found.
//
//   applied   the code the customer has applied, or null
//   status    'none' | 'pending' | 'checking' | 'applied' | 'error'
//               pending   applied but not yet checked (for example the pincode is still missing)
//   message   what to say under the box (the discount, or why the code did not work)
//   onApply   (code) => void      onRemove  () => void

import { useId, useState } from 'react';

const CODE = /^[A-Z0-9_-]{1,32}$/;

export default function PromoCode({ applied, status, message, onApply, onRemove, disabled = false }) {
  const id = useId();
  const messageId = `${id}-message`;
  const [text, setText] = useState('');
  const [localError, setLocalError] = useState('');

  function submit(event) {
    event.preventDefault();
    const code = text.trim().toUpperCase();
    if (!CODE.test(code)) {
      setLocalError('Enter a promo code, using letters, numbers, - or _.');
      return;
    }
    setLocalError('');
    onApply(code);
    setText('');
  }

  const shownError = localError || (status === 'error' ? message : '');

  return (
    <div>
      <label htmlFor={id} className="text-nav-link text-ink">
        Promo code <span className="font-normal text-ink-muted">(optional)</span>
      </label>

      {applied ? (
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3 rounded-md border border-green-accent bg-surface-tag px-3 py-2">
          <p className="text-body font-bold text-brand-text">{applied}</p>
          <button type="button" onClick={onRemove} disabled={disabled} className="min-h-11 rounded-pill px-3 text-nav-link text-brand-text underline disabled:text-ink-muted">
            Remove
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-1 flex gap-3">
          <input
            id={id}
            value={text}
            onChange={(e) => setText(e.target.value.toUpperCase().slice(0, 32))}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder="WELCOME10"
            disabled={disabled}
            aria-invalid={Boolean(shownError)}
            aria-describedby={messageId}
            className={`min-h-11 min-w-0 flex-1 rounded-md border bg-surface-card px-3 text-body text-ink placeholder:text-ink-muted ${shownError ? 'border-danger' : 'border-green-accent'}`}
          />
          <button
            type="submit"
            disabled={disabled || text.trim() === ''}
            className="min-h-11 rounded-pill border border-brand px-5 text-nav-link text-brand-text hover:bg-surface-cream disabled:cursor-not-allowed disabled:border-line disabled:text-ink-muted disabled:hover:bg-surface-card"
          >
            Apply
          </button>
        </form>
      )}

      <p id={messageId} role="status" className={`mt-1 min-h-[1.5em] text-small ${shownError ? 'font-bold text-danger' : 'text-brand-text'}`}>
        {shownError || (status === 'checking' ? 'Checking this code...' : message)}
      </p>
    </div>
  );
}
