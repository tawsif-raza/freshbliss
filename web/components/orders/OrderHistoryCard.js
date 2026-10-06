// One past order on the My orders page: status, date, boxes, total, and the buttons to track it, print its
// receipt or reorder it.

import Link from 'next/link';
import OrderLines from '@/components/orders/OrderLines';
import { statusLabel } from '@/lib/orderStatus';
import { formatOrderDate, shortOrderNumber } from '@/lib/pricing';

// The status as a customer reads it, with the money side where it matters.
function statusText(order) {
  if (order.status === 'CANCELLED') {
    if (order.paymentStatus === 'REFUND_PENDING') return 'Cancelled, refund on its way';
    if (order.paymentStatus === 'REFUNDED') return 'Cancelled, refunded';
    return 'Cancelled';
  }
  return statusLabel(order.status);
}

export default function OrderHistoryCard({ order, onReorder, reorderReady }) {
  const placed = formatOrderDate(order.createdAt?.toDate?.());
  const items = Array.isArray(order.items) ? order.items : [];
  const total = order.pricing?.total;
  const done = order.status === 'DELIVERED';
  const cancelled = order.status === 'CANCELLED';

  return (
    <li className="rounded-xl border border-line bg-surface-card p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-label text-gold">{shortOrderNumber(order.id)}</p>
          {placed && <p className="mt-1 text-small text-ink-muted">{placed}</p>}
        </div>
        <span
          className={`rounded-pill border px-3 py-1 text-small font-bold ${
            cancelled ? 'border-danger bg-surface-danger text-danger' : done ? 'border-line bg-surface-tag text-brand-text' : 'border-gold bg-surface-callout text-ink'
          }`}
        >
          {statusText(order)}
        </span>
      </div>

      <div className="mt-4">
        <OrderLines items={items} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <p className="text-body text-ink">
          Total <span className="text-kpi text-brand-text">₹{total}</span>
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href={`/orders/${order.id}`} className="inline-grid min-h-11 place-items-center rounded-pill border border-brand px-5 text-nav-link text-brand-text hover:bg-surface-cream">
            {done || cancelled ? 'View order' : 'Track order'}
          </Link>
          <Link href={`/orders/${order.id}?receipt=1`} className="inline-grid min-h-11 place-items-center rounded-pill border border-brand px-5 text-nav-link text-brand-text hover:bg-surface-cream">
            Receipt
          </Link>
          <button
            type="button"
            onClick={() => onReorder(order)}
            disabled={!reorderReady}
            className="min-h-11 rounded-pill bg-gold-bright px-5 text-nav-link text-on-gold hover:brightness-95 disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-muted disabled:hover:brightness-100"
          >
            Reorder
          </button>
        </div>
      </div>
    </li>
  );
}
