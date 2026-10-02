// The itemised order summary on the checkout page: every box, then Subtotal, Discount, Delivery,
// Rider tip and the final Total, before the customer presses Pay.
//
//   items       cart items from useCart() (name, sizeLabel, qty, lineTotal, available)
//   pricing     { subtotal, discount, deliveryFee, tip, total }   or null if not known yet
//   estimated   true while these figures are our own preview and the server's price is still on its way
//   promoCode   the applied code, to name the discount

import SummaryRow from '@/components/SummaryRow';
import { feeLabel } from '@/lib/zoneMatch';

export default function CheckoutSummary({ items, pricing, estimated = false, promoCode = null }) {
  const subtotal = pricing?.subtotal ?? items.reduce((sum, i) => sum + (i.available ? i.lineTotal : 0), 0);

  return (
    <div>
      <ul className="divide-y divide-line">
        {items.map((item) => (
          <li key={item.id} className="flex justify-between gap-4 py-2 text-body text-ink first:pt-0">
            <span>
              {item.qty} × {item.name} <span className="text-ink-muted">({item.sizeLabel})</span>
            </span>
            <span className="font-bold">₹{item.lineTotal}</span>
          </li>
        ))}
      </ul>

      <dl className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
        <SummaryRow label="Subtotal" value={`₹${subtotal}`} />
        {pricing?.discount > 0 && <SummaryRow label={promoCode ? `Discount (${promoCode})` : 'Discount'} value={`-₹${pricing.discount}`} />}
        {pricing ? <SummaryRow label="Delivery" value={feeLabel(pricing.deliveryFee)} /> : <SummaryRow label="Delivery" value="Enter your pincode" muted />}
        {pricing?.tip > 0 && <SummaryRow label="Rider tip" value={`₹${pricing.tip}`} />}
        <div className="mt-2 border-t border-line pt-2">
          {pricing ? <SummaryRow label={estimated ? 'Estimated total' : 'Total'} value={`₹${pricing.total}`} strong /> : <SummaryRow label="Total" value="Calculated next" muted />}
        </div>
      </dl>
      {estimated && pricing && <p className="mt-2 text-small text-ink-muted">Confirming the exact total...</p>}
    </div>
  );
}
