// "Delete my data / Close my account", at the bottom of the account page (DPDP Act: the right to erasure).
//
// It says plainly what goes and what stays, then asks for confirmation in a dialog: the customer must type DELETE before the
// red button works, and the button says what it does. The real work is on the server (lib/erasure.js ->
// firebase/functions/requestDataErasure.js). When it has to wait (an order is still on the way) the server's explanation is
// shown in the dialog and nothing has changed.
//
// The dialog is a real <dialog>: the keyboard stays inside it, Esc closes it, and focus returns to the button that opened it.
// While the erasure is running it cannot be closed, so it cannot be abandoned half way on screen (the server finishes anyway).
//
// Drawn for signed-in customers and for guests (a guest's orders hold an address too). Nothing is drawn until Firebase has
// said who it is. The words here must match content/privacy.js and firebase/functions/shared/erasure.js.

import { useEffect, useId, useRef, useState } from 'react';
import { LoaderCircle, TriangleAlert } from 'lucide-react';
import { inputClass } from '@/components/Field';
import { useAuthUser } from '@/context/AuthContext';
import { eraseMyData, leaveAfterErasure } from '@/lib/erasure';
import { ERASE_PHRASE, isErasePhrase } from '@/lib/erasureHelpers';
import { friendlyError } from '@/lib/errors';

const GOES = [
  'Your sign-in account, with the name, email address or mobile number it holds.',
  'Your cart and your wishlist.',
  'The delivery address and delivery notes on your orders, and any words in your reviews.',
];
const STAYS = [
  'Your paid orders, refunds and payment records. The shop must keep them for its accounts. Your address and notes are replaced with "[REDACTED - DPDP ERASURE]" and nothing links them to you any more, so what is left is the boxes, the amounts and the dates.',
  'Razorpay keeps its own record of your payments, under its own terms.',
];

function Confirm({ open, onClose }) {
  const dialogRef = useRef(null);
  const inputId = useId();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  async function erase(event) {
    event.preventDefault();
    if (busy || !isErasePhrase(typed)) return;
    setBusy(true);
    setError('');
    try {
      const result = await eraseMyData();
      await leaveAfterErasure();
      // A full page load (not a client-side route change), so nothing of the old session (cart, orders, account) is left in
      // memory. `replace` also keeps the Back button from returning to an account page that no longer exists.
      window.location.replace(`/account/erased?orders=${Number.isInteger(result?.orders) ? result.orders : 0}`);
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  }

  // closing resets the box, so the next opening starts clean
  function close() {
    if (busy) return;
    setTyped('');
    setError('');
    onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="erase-title"
      onCancel={(event) => {
        event.preventDefault(); // Esc: let `close` decide (it refuses while working)
        close();
      }}
      onClose={() => !busy && onClose()}
      onClick={(event) => {
        if (event.target === dialogRef.current) close();
      }}
      className="fb-no-print m-auto w-[min(92vw,32rem)] rounded-2xl border border-line bg-surface-card p-0 text-ink shadow-2xl backdrop:bg-ink/50"
    >
      <form onSubmit={erase} className="p-6">
        <h2 id="erase-title" className="flex items-center gap-2 text-heading-3 text-ink">
          <TriangleAlert size={22} className="text-danger" aria-hidden="true" />
          Delete my data?
        </h2>
        <p className="mt-2 text-body text-ink">This closes your account and cannot be undone.</p>

        <label htmlFor={inputId} className="mt-5 block text-nav-link text-ink">
          Type <span className="font-bold">{ERASE_PHRASE}</span> to confirm
        </label>
        <input
          id={inputId}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          disabled={busy}
          aria-describedby={error ? 'erase-error' : undefined}
          className={`mt-1 min-h-12 ${inputClass(Boolean(error))}`}
        />

        <p id="erase-error" role="alert" className="mt-3 min-h-[1.5em] text-small font-bold text-danger">
          {error}
        </p>

        <div className="mt-4 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="min-h-12 rounded-pill border border-green-accent px-6 text-nav-link text-brand-text hover:bg-surface-cream disabled:opacity-60"
          >
            Keep my account
          </button>
          <button
            type="submit"
            disabled={busy || !isErasePhrase(typed)}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-pill bg-danger px-6 text-nav-link text-surface-page hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && <LoaderCircle size={18} aria-hidden="true" className="motion-safe:animate-spin" />}
            {busy ? 'Deleting' : 'Delete my data'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

export default function DeleteAccountCard() {
  const { status } = useAuthUser();
  const [open, setOpen] = useState(false);
  const opener = useRef(null);

  if (status !== 'user' && status !== 'guest') return null;

  return (
    <section aria-labelledby="delete-title" className="mt-12 max-w-2xl rounded-xl border border-line bg-surface-card p-6 shadow-card">
      <h2 id="delete-title" className="text-heading-3 text-ink">
        Delete my data / Close account
      </h2>
      <p className="mt-2 text-body text-ink-muted">You can ask us to erase your personal data at any time. This is what happens:</p>

      <h3 className="mt-4 text-nav-link text-ink">Erased</h3>
      <ul className="mt-1 list-disc space-y-1 pl-6 text-body text-ink">
        {GOES.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <h3 className="mt-4 text-nav-link text-ink">Kept, without your details</h3>
      <ul className="mt-1 list-disc space-y-1 pl-6 text-body text-ink">
        {STAYS.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="mt-4 text-small text-ink-muted">If you have an order that is still on the way, we need your address until it is delivered, so you can delete your data once it has arrived.</p>

      <button
        ref={opener}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="mt-5 inline-flex min-h-11 items-center rounded-pill border border-danger px-6 text-nav-link text-danger hover:bg-surface-danger"
      >
        Delete my data…
      </button>

      <Confirm
        open={open}
        onClose={() => {
          setOpen(false);
          opener.current?.focus();
        }}
      />
    </section>
  );
}
