// One cancelled order that is waiting for its refund.
// "Process Refund" calls the staff-only processRefund function, which changes
// paymentStatus from REFUND_PENDING to REFUNDED.
//
// IMPORTANT: for now this only RECORDS the refund. It does not send money. Staff
// refund the payment in the Razorpay dashboard first (the panel shows the payment id
// to look up), then confirm here. The Razorpay Refund API will replace that manual
// step later.

import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import ActionPanel from '@/components/admin/ActionPanel';
import { inputClass } from '@/components/admin/ActiveOrderCard';
import Callout from '@/components/Callout';
import { friendlyError } from '@/lib/errors';
import { functions } from '@/lib/firebaseClient';
import { formatTime } from '@/lib/orderStatus';

const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export default function RefundCard({ order }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const paymentId = order.payment?.razorpayPaymentId;
  const bySystem = order.cancelledBy === 'system';

  async function confirmRefund() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await httpsCallable(functions, 'processRefund')({ orderId: order.id, note });
      // The card leaves this list by itself once the order is REFUNDED.
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
        <span className="rounded-pill border border-danger bg-surface-danger px-3 py-1 text-small font-bold text-danger">Refund pending</span>
      </div>
      <p className="mt-1 text-small text-ink-muted">
        Cancelled at {formatTime(order.timestamps?.CANCELLED) || '...'} · {bySystem ? 'automatically (sold out while paying)' : 'by staff'}
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
      <p className="mt-2 text-body font-bold text-brand-text">Refund ₹{order.pricing?.total}</p>

      <div className="mt-4">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={busy}
          aria-expanded={open}
          className="min-h-11 rounded-pill bg-brand px-5 text-nav-link text-on-brand hover:brightness-110 disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-muted"
        >
          Process Refund
        </button>
      </div>

      {open && (
        <ActionPanel
          title="Confirm the refund"
          confirmLabel="Mark as refunded"
          busyLabel="Saving..."
          closeLabel="Not yet"
          busy={busy}
          error={error}
          onConfirm={confirmRefund}
          onClose={() => setOpen(false)}
        >
          <Callout>
            This records that the refund was made. <strong>It does not send any money yet.</strong> Refund ₹{order.pricing?.total} in the Razorpay
            dashboard first (Payments, then search for the payment id below), then confirm here.
          </Callout>
          <p className="text-small text-ink">
            Razorpay payment id: <span className="text-code text-ink">{paymentId || 'not recorded'}</span>
          </p>
          <label className="text-small text-ink">
            Note <span className="text-ink-muted">(optional)</span>
            <input className={`${inputClass} mt-1`} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} disabled={busy} placeholder="For example: refund id from Razorpay" />
          </label>
        </ActionPanel>
      )}
    </li>
  );
}
