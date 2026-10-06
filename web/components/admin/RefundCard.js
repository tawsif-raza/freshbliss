// One cancelled order that is waiting for its refund (the "Needs refund" tab).
//
// The refund is normally sent to Razorpay by itself the moment the order is cancelled (firebase/functions/autoRefund.js),
// and Razorpay's webhook turns the order to REFUNDED when it is done, at which point this card leaves the list. So a card
// here is one of three things:
//   - waiting:  the refund is with Razorpay (refundPendingPaise > 0). "Check status" asks Razorpay again.
//   - failed:   Razorpay refused it or could not be reached (refundError). The reason is shown; "Retry refund" sends it again.
//   - not sent: nothing has been sent yet (automatic refunds switched off, or the function has not run). "Refund" sends it.
// All three buttons call the staff-only processRefund function, which is safe to press more than once: it never refunds
// more than the payment, and it first looks at what Razorpay already has (including refunds made by hand in its dashboard).

import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import ActionPanel from '@/components/admin/ActionPanel';
import { inputClass } from '@/components/admin/ActiveOrderCard';
import Callout from '@/components/Callout';
import { friendlyError } from '@/lib/errors';
import { functions } from '@/lib/firebaseClient';
import { formatTime, refundState } from '@/lib/orderStatus';

const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const BUTTON = { failed: 'Retry refund', waiting: 'Check status', 'not-sent': 'Refund via Razorpay' };
const BADGE = { failed: 'Refund failed', waiting: 'Refund with Razorpay', 'not-sent': 'Refund pending' };

export default function RefundCard({ order }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  const state = refundState(order);
  const paymentId = order.payment?.razorpayPaymentId;
  const bySystem = order.cancelledBy === 'system';
  const owedRupees = ((order.payment?.amountPaise ?? (order.pricing?.total ?? 0) * 100) - (order.refundedPaise ?? 0)) / 100;
  const lastRefundId = order.lastRefundId;

  async function send() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const { data } = await httpsCallable(functions, 'processRefund')({ orderId: order.id, note });
      // The card leaves this list by itself once the order is REFUNDED.
      setMessage(
        data?.paymentStatus === 'REFUNDED' ? 'Refunded.' : `Razorpay has the refund (${String(data?.refundStatus ?? 'pending').toLowerCase()}). This card clears when Razorpay confirms it.`,
      );
      setOpen(false);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-xl border border-line bg-surface-card p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-code text-ink">#{order.id.slice(0, 8)}</p>
        <span className="rounded-pill border border-danger bg-surface-danger px-3 py-1 text-small font-bold text-danger">{BADGE[state]}</span>
      </div>
      <p className="mt-1 text-small text-ink-muted">
        Cancelled at {formatTime(order.timestamps?.CANCELLED) || '...'} · {bySystem ? 'automatically (see the reason below)' : order.cancelledBy === 'customer' ? 'by the customer' : 'by staff'}
      </p>
      <p className="mt-2 text-small text-ink">Reason: {order.cancelReason || 'Not recorded'}</p>

      <ul className="mt-3 text-body text-ink">
        {(order.items ?? []).map((i) => (
          <li key={`${i.productId}:${i.size}`}>
            {i.qty} × {i.name} <span className="text-ink-muted">({capitalise(i.size)})</span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-small text-ink-muted">{order.address}</p>
      <p className="mt-2 text-body font-bold text-brand-text">Refund ₹{owedRupees}</p>

      {state === 'failed' && (
        <Callout tone="danger" className="mt-3" title="The automatic refund did not go through.">
          {order.refundError}
        </Callout>
      )}
      {state === 'waiting' && (
        <p className="mt-2 text-small text-ink-muted">
          Sent to Razorpay{lastRefundId ? <> as <span className="text-code text-ink">{lastRefundId}</span></> : ''}. Waiting for Razorpay to confirm it.
        </p>
      )}
      {order.refundAlert && (
        <Callout tone="danger" className="mt-3">
          {order.refundAlert}
        </Callout>
      )}
      {message && (
        <p role="status" className="mt-2 text-small text-ink">
          {message}
        </p>
      )}

      <div className="mt-4">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={busy}
          aria-expanded={open}
          className="min-h-11 rounded-pill bg-brand px-5 text-nav-link text-on-brand hover:brightness-110 disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-muted"
        >
          {BUTTON[state]}
        </button>
      </div>

      {open && (
        <ActionPanel
          title={BUTTON[state]}
          confirmLabel={state === 'waiting' ? 'Check now' : 'Send refund'}
          busyLabel="Working..."
          closeLabel="Not yet"
          busy={busy}
          error={error}
          onConfirm={send}
          onClose={() => setOpen(false)}
        >
          <Callout>
            {state === 'waiting' ? (
              <>This asks Razorpay where the refund has got to. Nothing more is sent.</>
            ) : (
              <>
                <strong>This sends ₹{owedRupees} back to the customer through Razorpay.</strong> It is safe to press twice: the payment can never be
                refunded more than once, and a refund you already made in the Razorpay dashboard is noticed first.
              </>
            )}
          </Callout>
          <p className="text-small text-ink">
            Razorpay payment id: <span className="text-code text-ink">{paymentId || 'not recorded'}</span>
          </p>
          {state !== 'waiting' && (
            <label className="text-small text-ink">
              Note <span className="text-ink-muted">(optional, kept with the refund)</span>
              <input className={`${inputClass} mt-1`} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} disabled={busy} placeholder="For example: customer called, bank issue" />
            </label>
          )}
        </ActionPanel>
      )}
    </li>
  );
}
