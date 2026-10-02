// A printable receipt for one order, shown in a modal (a real <dialog>, so the keyboard is trapped in
// it, Esc closes it, and focus returns to the button that opened it).
//
// "Print / Save as PDF" uses the browser's own print window. The print rules are in styles/globals.css:
// when printing, everything on the page except this receipt is hidden, so it comes out clean on
// paper or as a PDF (choose "Save as PDF" as the printer).
//
//   order    the order document ({ id, items, pricing, promo, address, payment, status, ... })
//   open     whether the modal is showing
//   onClose  called when it is closed (the Close button, Esc, or a click outside)
//
// It prints only what the order really holds. It has no tax line (see content/business.js).

import { useEffect, useId, useRef } from 'react';
import SummaryRow from '@/components/SummaryRow';
import { BUSINESS } from '@/content/business';
import { formatOrderDate, maskPaymentId, shortOrderNumber } from '@/lib/pricing';
import { feeLabel } from '@/lib/zoneMatch';

const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const PAYMENT_STATUS = { PAID: 'Paid', PAID_MOCK: 'Test order', REFUND_PENDING: 'Refund pending', REFUNDED: 'Refunded' };

export default function OrderReceipt({ order, open, onClose }) {
  const dialogRef = useRef(null);
  const titleId = useId();

  // Open and close the real dialog to match `open`.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const items = Array.isArray(order.items) ? order.items : [];
  const p = order.pricing ?? {};
  const placed = formatOrderDate(order.createdAt?.toDate?.());
  const reference = maskPaymentId(order.payment?.razorpayPaymentId);
  const paymentStatus = PAYMENT_STATUS[order.paymentStatus] ?? order.paymentStatus ?? '';

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose(); // a click on the dimmed area outside
      }}
      className="fb-receipt-dialog m-auto w-[min(42rem,calc(100vw-2rem))] max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl border border-line bg-surface-card p-0 text-ink shadow-card backdrop:bg-ink/40"
    >
      <div className="p-6 sm:p-8">
        {/* The part that is printed */}
        <div className="fb-print-area">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
            <div>
              <p className="font-serif text-[26px] leading-none font-bold text-brand-text">{BUSINESS.name}</p>
              {BUSINESS.legalName && <p className="mt-1 text-small text-ink">{BUSINESS.legalName}</p>}
              {BUSINESS.address && <p className="text-small text-ink-muted">{BUSINESS.address}</p>}
              {BUSINESS.gstin && <p className="text-small text-ink-muted">GSTIN: {BUSINESS.gstin}</p>}
              {BUSINESS.contact && <p className="text-small text-ink-muted">{BUSINESS.contact}</p>}
            </div>
            <div className="text-right">
              <h2 id={titleId} className="text-heading-3 text-ink">
                Order receipt
              </h2>
              <p className="mt-1 text-body font-bold text-ink">{shortOrderNumber(order.id)}</p>
              {placed && <p className="text-small text-ink-muted">{placed}</p>}
            </div>
          </header>

          <section aria-label="Delivery" className="mt-4">
            <h3 className="text-nav-link text-ink">Delivered to</h3>
            <p className="mt-1 text-body text-ink">{order.address}</p>
            <p className="text-small text-ink-muted">
              {order.zone?.name ? `${order.zone.name}, ` : ''}Pincode {order.pincode}
            </p>
          </section>

          <table className="mt-5 w-full border-collapse text-left text-body text-ink">
            <caption className="sr-only">Items in this order</caption>
            <thead>
              <tr className="border-b border-line text-small text-ink-muted">
                <th scope="col" className="py-2 pr-2 font-bold">
                  Item
                </th>
                <th scope="col" className="px-2 py-2 text-right font-bold">
                  Qty
                </th>
                <th scope="col" className="px-2 py-2 text-right font-bold">
                  Price
                </th>
                <th scope="col" className="py-2 pl-2 text-right font-bold">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={`${i.productId}:${i.size}`} className="border-b border-line align-top">
                  <td className="py-2 pr-2">
                    {i.name} <span className="text-ink-muted">({capitalise(String(i.size))})</span>
                  </td>
                  <td className="px-2 py-2 text-right">{i.qty}</td>
                  <td className="px-2 py-2 text-right">₹{i.unitPrice}</td>
                  <td className="py-2 pl-2 text-right font-bold">₹{i.lineTotal}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <dl className="mt-4 ml-auto flex max-w-xs flex-col gap-1">
            <SummaryRow label="Subtotal" value={`₹${p.subtotal}`} />
            {p.discount > 0 && <SummaryRow label={order.promo?.code ? `Discount (${order.promo.code})` : 'Discount'} value={`-₹${p.discount}`} />}
            <SummaryRow label="Delivery" value={feeLabel(p.deliveryFee)} />
            {p.tip > 0 && <SummaryRow label="Rider tip" value={`₹${p.tip}`} />}
            <div className="mt-2 border-t border-line pt-2">
              <SummaryRow label="Total" value={`₹${p.total}`} strong />
            </div>
          </dl>

          <section aria-label="Payment" className="mt-5 border-t border-line pt-4 text-small text-ink">
            {order.paymentStatus === 'PAID_MOCK' ? (
              <p>
                <span className="font-bold">Payment:</span> test order, no payment was taken
              </p>
            ) : (
              <p>
                <span className="font-bold">Payment:</span> online, through Razorpay{paymentStatus && ` (${paymentStatus})`}
              </p>
            )}
            {reference && (
              <p>
                <span className="font-bold">Payment reference:</span> <span className="text-code">{reference}</span>
              </p>
            )}
            <p className="mt-2 text-ink-muted">All amounts are in Indian rupees (INR). Thank you for ordering from {BUSINESS.name}.</p>
          </section>
        </div>

        {/* Buttons: never printed */}
        <div className="fb-no-print mt-6 flex flex-wrap justify-end gap-3">
          <button type="button" onClick={onClose} className="min-h-11 rounded-pill border border-brand px-6 text-nav-link text-brand-text hover:bg-surface-cream">
            Close
          </button>
          <button type="button" onClick={() => window.print()} className="min-h-11 rounded-pill bg-gold-bright px-6 text-nav-link text-on-gold hover:brightness-95">
            Print / Save as PDF
          </button>
        </div>
      </div>
    </dialog>
  );
}
