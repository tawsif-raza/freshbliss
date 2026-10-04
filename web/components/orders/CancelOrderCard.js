// "Need to cancel?" on the customer's order page.
//   - until the order is packed: a Cancel button, then a short confirmation with a reason
//   - once it is packed or on its way: a note saying why it can no longer be cancelled online
// The server makes the real decision (cancelMyOrder); this card only asks politely and shows the result.

import { useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import InfoCard from '@/components/orders/InfoCard';
import { BUSINESS } from '@/content/business';
import { friendlyError } from '@/lib/errors';
import { functions } from '@/lib/firebaseClient';
import { CUSTOMER_CANCEL_REASONS, customerCancelState } from '@/lib/orderStatus';

export default function CancelOrderCard({ order }) {
  const state = customerCancelState(order);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState(CUSTOMER_CANCEL_REASONS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const reasonRef = useRef(null);

  if (state === 'no') return null;

  if (state === 'locked') {
    return (
      <InfoCard title="Need to cancel?">
        <p className="text-body text-ink">
          Your order is packed, so it can no longer be cancelled here.{' '}
          {BUSINESS.supportEmail ? (
            <>
              Please email <a className="font-bold text-brand-text underline" href={`mailto:${BUSINESS.supportEmail}?subject=${encodeURIComponent(`Order ${order.id}`)}`}>{BUSINESS.supportEmail}</a> and we will help.
            </>
          ) : (
            'Please contact support and we will help.'
          )}
        </p>
      </InfoCard>
    );
  }

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await httpsCallable(functions, 'cancelMyOrder')({ orderId: order.id, reason });
      // Nothing more to do: the live order updates and the page switches to "cancelled" by itself.
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  }

  function ask() {
    setAsking(true);
    // Let the form appear, then move the keyboard focus into it.
    requestAnimationFrame(() => reasonRef.current?.focus());
  }

  return (
    <InfoCard title="Need to cancel?">
      {!asking ? (
        <>
          <p className="text-body text-ink-muted">You can cancel until your order is packed. You will get a full refund to your original payment method.</p>
          <button type="button" onClick={ask} className="mt-4 min-h-11 rounded-pill border border-danger px-6 text-nav-link text-danger hover:bg-surface-danger">
            Cancel order
          </button>
        </>
      ) : (
        <div role="group" aria-labelledby="cancel-q">
          <p id="cancel-q" className="text-body font-bold text-ink">Cancel this order?</p>
          <label htmlFor="cancel-reason" className="mt-3 block text-small text-ink">
            Reason
          </label>
          <select
            id="cancel-reason"
            ref={reasonRef}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy}
            className="mt-1 min-h-11 w-full max-w-sm rounded-md border border-ink-muted bg-surface-card px-3 text-body text-ink"
          >
            {CUSTOMER_CANCEL_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          {error && (
            <p role="alert" className="mt-3 text-small font-bold text-danger">
              {error}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={() => setAsking(false)} disabled={busy} className="min-h-11 rounded-pill bg-brand px-6 text-nav-link text-on-brand hover:brightness-110 disabled:opacity-60">
              Keep my order
            </button>
            <button type="button" onClick={confirm} disabled={busy} className="min-h-11 rounded-pill border border-danger px-6 text-nav-link text-danger hover:bg-surface-danger disabled:opacity-60">
              {busy ? 'Cancelling...' : 'Yes, cancel order'}
            </button>
          </div>
        </div>
      )}
    </InfoCard>
  );
}
