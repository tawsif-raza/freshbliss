// The confirmation shown after paying: the order id, the receipt, and where to go next. When the payment could
// not be completed it says so and offers a way back to checkout.
//
//   outcome  { result, quote } for the finished order
//   onBack   called by "Back to checkout"

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import Callout from '@/components/Callout';
import OrderLines from '@/components/orders/OrderLines';
import SummaryRow from '@/components/SummaryRow';
import { feeLabel } from '@/lib/zones';

export default function OrderResult({ outcome, onBack }) {
  const { result, quote } = outcome;
  const headingRef = useRef(null);
  const cancelled = result.status === 'CANCELLED';
  const p = quote.pricing;

  // Move focus to the result so screen reader users hear it.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 ref={headingRef} tabIndex={-1} className="text-heading-2 text-brand-text">
        {cancelled ? 'We could not complete your order' : 'Thank you. Your order is confirmed.'}
      </h1>

      <Callout tone={cancelled ? 'danger' : 'note'} className="mt-4.5">
        {result.message}
        <p className="mt-2 text-small text-ink-muted">
          Order ID: <span className="text-code text-ink">{result.orderId}</span>
        </p>
      </Callout>

      {cancelled ? (
        <button type="button" onClick={onBack} className="mt-6 min-h-11 rounded-pill bg-brand px-6 text-nav-link text-on-brand hover:brightness-110">
          Back to checkout
        </button>
      ) : (
        <>
          <section aria-labelledby="receipt-title" className="mt-6 rounded-xl border border-line bg-surface-card p-6 shadow-card">
            <h2 id="receipt-title" className="text-heading-3 text-ink">
              Your receipt
            </h2>
            <div className="mt-3">
              <OrderLines items={quote.items} />
            </div>
            <dl className="mt-3 flex flex-col gap-1 border-t border-line pt-3">
              <SummaryRow label="Subtotal" value={`₹${p.subtotal}`} />
              {p.discount > 0 && <SummaryRow label="Discount" value={`-₹${p.discount}`} />}
              <SummaryRow label="Delivery" value={feeLabel(p.deliveryFee)} />
              {p.tip > 0 && <SummaryRow label="Rider tip" value={`₹${p.tip}`} />}
              <div className="mt-2 border-t border-line pt-2">
                <SummaryRow label="Total paid" value={`₹${p.total}`} strong />
              </div>
            </dl>
          </section>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={`/orders/${result.orderId}`} className="inline-grid min-h-11 place-items-center rounded-pill bg-gold-bright px-6 text-nav-link text-on-gold hover:brightness-95">
              Track your order
            </Link>
            <Link href={`/orders/${result.orderId}?receipt=1`} className="inline-grid min-h-11 place-items-center rounded-pill border border-brand px-6 text-nav-link text-brand-text hover:bg-surface-cream">
              View printable receipt
            </Link>
            <Link href="/products" className="inline-grid min-h-11 place-items-center rounded-pill border border-brand px-6 text-nav-link text-brand-text hover:bg-surface-cream">
              Continue shopping
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
