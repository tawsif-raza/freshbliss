// The order page's summary card: the boxes, the money, and where it is going.

import InfoCard from '@/components/orders/InfoCard';
import OrderLines from '@/components/orders/OrderLines';
import SummaryRow from '@/components/SummaryRow';
import { slotText } from '@/lib/slots';

export default function OrderSummary({ order }) {
  const items = order.items ?? [];
  const p = order.pricing ?? {};
  const totalLabel = { REFUND_PENDING: 'Total (refund pending)', REFUNDED: 'Total refunded', PAID_MOCK: 'Total (test order)' }[order.paymentStatus] ?? 'Total paid';

  return (
    <InfoCard title="Order summary">
      <OrderLines items={items} />

      <dl className="mt-3 flex flex-col gap-1 border-t border-line pt-3">
        <SummaryRow label="Subtotal" value={`₹${p.subtotal}`} />
        {p.discount > 0 && <SummaryRow label="Discount" value={`-₹${p.discount}`} />}
        <SummaryRow label="Delivery" value={p.deliveryFee === 0 ? 'Free' : `₹${p.deliveryFee}`} />
        {p.tip > 0 && <SummaryRow label="Rider tip" value={`₹${p.tip}`} />}
        <div className="mt-2 border-t border-line pt-2">
          <SummaryRow label={totalLabel} value={`₹${p.total}`} strong />
        </div>
      </dl>

      <div className="mt-5 border-t border-line pt-4">
        <h3 className="text-nav-link text-ink">Delivering to</h3>
        <p className="mt-1 text-body text-ink">{order.address}</p>
        <p className="text-small text-ink-muted">
          {order.zone?.name ? `${order.zone.name}, ` : ''}Pincode {order.pincode}
        </p>
        {order.slot && <p className="mt-2 text-small text-ink">Delivery time: {slotText(order.slot)}</p>}
        {order.note && <p className="mt-2 text-small text-ink-muted">Instructions: {order.note}</p>}
      </div>
    </InfoCard>
  );
}
