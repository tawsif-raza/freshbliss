// One order that is still being worked on. Staff can:
//   - push it to its next step (calls updateOrderStatus)
//   - cancel it, which starts the refund workflow (calls cancelOrder)
// Neither writes to Firestore directly: the security rules let no browser change
// an order, so both go through staff-only Cloud Functions. The card itself updates
// when the live list (onSnapshot in the page) hears the change.

import Link from 'next/link';
import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import ActionPanel from '@/components/admin/ActionPanel';
import Callout from '@/components/Callout';
import { friendlyError } from '@/lib/errors';
import { functions, usingEmulators } from '@/lib/firebaseClient';
import { CANCEL_REASONS, NEXT_ACTION, formatTime, restockByDefault, statusLabel } from '@/lib/orderStatus';

const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export const inputClass = 'min-h-11 w-full rounded-md border border-green-accent bg-surface-card px-3 text-body text-ink placeholder:text-ink-muted';

export default function ActiveOrderCard({ order }) {
  const action = NEXT_ACTION[order.status];
  const askForRider = action?.to === 'OUT_FOR_DELIVERY';

  // moving the order forward
  const [rider, setRider] = useState({ name: usingEmulators ? 'Test rider' : '', phone: '', vehicle: '' }); // name prefilled in the emulator only
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // cancelling
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancel, setCancel] = useState({ reason: CANCEL_REASONS[0], details: '', restock: restockByDefault(order.status) });
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState(null);

  async function advance() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await httpsCallable(functions, 'updateOrderStatus')({
        orderId: order.id,
        status: action.to,
        ...(askForRider ? { rider } : {}),
      });
      // Nothing to do on success: the live list re-renders this card by itself.
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmCancel() {
    if (cancelBusy) return;
    const details = cancel.details.trim();
    if (cancel.reason === 'Other' && details.length < 3) {
      setCancelError('Please write the reason (at least 3 characters).');
      return;
    }
    const reason = cancel.reason === 'Other' ? details : details ? `${cancel.reason}: ${details}` : cancel.reason;

    setCancelBusy(true);
    setCancelError(null);
    try {
      await httpsCallable(functions, 'cancelOrder')({ orderId: order.id, reason, restock: cancel.restock });
      // The order leaves this list and appears under "Needs refund" by itself.
    } catch (err) {
      setCancelError(friendlyError(err));
    } finally {
      setCancelBusy(false);
    }
  }

  const anyBusy = busy || cancelBusy;

  return (
    <li className="rounded-xl border border-line bg-surface-card p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-code text-ink">#{order.id.slice(0, 8)}</p>
        <span className="rounded-pill bg-surface-tag px-3 py-1 text-small font-bold text-brand-text">{statusLabel(order.status)}</span>
      </div>
      <p className="mt-1 text-small text-ink-muted">Paid at {formatTime(order.timestamps?.PAYMENT_CONFIRMED) || '...'}</p>

      <ul className="mt-3 text-body text-ink">
        {(order.items ?? []).map((i) => (
          <li key={`${i.productId}:${i.size}`}>
            {i.qty} × {i.name} <span className="text-ink-muted">({capitalise(i.size)})</span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-small text-ink">
        {order.address}
        <span className="text-ink-muted">
          {' '}
          · {order.zone?.name ? `${order.zone.name}, ` : ''}
          {order.pincode}
        </span>
      </p>
      {order.note && <p className="text-small text-ink-muted">Note: {order.note}</p>}
      <p className="mt-2 text-body font-bold text-brand-text">₹{order.pricing?.total}</p>

      {askForRider && (
        <fieldset disabled={anyBusy} className="mt-4 grid gap-3 sm:grid-cols-3">
          <legend className="mb-2 text-nav-link text-ink">Rider details</legend>
          <label className="text-small text-ink">
            Name
            <input className={`${inputClass} mt-1`} value={rider.name} maxLength={60} onChange={(e) => setRider((r) => ({ ...r, name: e.target.value }))} />
          </label>
          <label className="text-small text-ink">
            Phone <span className="text-ink-muted">(optional)</span>
            <input className={`${inputClass} mt-1`} value={rider.phone} maxLength={20} inputMode="tel" onChange={(e) => setRider((r) => ({ ...r, phone: e.target.value }))} />
          </label>
          <label className="text-small text-ink">
            Vehicle <span className="text-ink-muted">(optional)</span>
            <input className={`${inputClass} mt-1`} value={rider.vehicle} maxLength={40} onChange={(e) => setRider((r) => ({ ...r, vehicle: e.target.value }))} />
          </label>
        </fieldset>
      )}

      {error && (
        <Callout tone="danger" className="mt-4">
          {error}
        </Callout>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {action && (
          <button
            type="button"
            onClick={advance}
            disabled={anyBusy}
            aria-busy={busy}
            className="min-h-11 rounded-pill bg-brand px-5 text-nav-link text-on-brand hover:brightness-110 disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-muted"
          >
            {busy ? 'Updating...' : action.label}
          </button>
        )}
        <button
          type="button"
          onClick={() => setCancelOpen((open) => !open)}
          disabled={anyBusy}
          aria-expanded={cancelOpen}
          className="min-h-11 rounded-pill border border-danger px-5 text-nav-link text-danger hover:bg-surface-danger disabled:cursor-not-allowed disabled:border-line disabled:text-ink-muted"
        >
          Cancel Order
        </button>
        <Link href={`/orders/${order.id}`} target="_blank" className="min-h-11 content-center text-nav-link text-brand-text underline underline-offset-4">
          Open customer view
        </Link>
      </div>

      {cancelOpen && (
        <ActionPanel
          title="Cancel this order and refund the customer"
          confirmLabel="Cancel order and refund"
          busyLabel="Cancelling..."
          closeLabel="Keep order"
          busy={cancelBusy}
          error={cancelError}
          onConfirm={confirmCancel}
          onClose={() => setCancelOpen(false)}
        >
          <label className="text-small text-ink">
            Reason
            <select
              className={`${inputClass} mt-1`}
              value={cancel.reason}
              onChange={(e) => setCancel((c) => ({ ...c, reason: e.target.value }))}
              disabled={cancelBusy}
            >
              {CANCEL_REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label className="text-small text-ink">
            {cancel.reason === 'Other' ? 'Details' : 'More details'} {cancel.reason !== 'Other' && <span className="text-ink-muted">(optional)</span>}
            <input
              className={`${inputClass} mt-1`}
              value={cancel.details}
              maxLength={150}
              onChange={(e) => setCancel((c) => ({ ...c, details: e.target.value }))}
              disabled={cancelBusy}
            />
          </label>
          <label className="flex items-start gap-3 text-small text-ink">
            <input
              type="checkbox"
              className="mt-0.5 size-5 shrink-0 accent-[var(--fb-brand)]"
              checked={cancel.restock}
              onChange={(e) => setCancel((c) => ({ ...c, restock: e.target.checked }))}
              disabled={cancelBusy}
            />
            <span>
              Return the boxes to stock
              <span className="block text-ink-muted">
                {restockByDefault(order.status)
                  ? 'The boxes are not packed yet, so they can go back on the shelf.'
                  : 'The boxes are already packed, so this is off by default. Turn it on only if they can be sold again.'}
              </span>
            </span>
          </label>
          <p className="text-small text-ink-muted">The customer sees the order as cancelled with a refund pending. You then process the refund under &quot;Needs refund&quot;.</p>
        </ActionPanel>
      )}
    </li>
  );
}
