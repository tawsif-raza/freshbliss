// The cart and checkout page.
// Shows the cart from CartContext, collects the delivery details, and runs the
// payment flow in lib/razorpayCheckout.js. Every figure here is a preview: the
// server prices the order, so the delivery fee only appears once it has.

import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import Callout from '@/components/Callout';
import CartLineItem from '@/components/CartLineItem';
import SummaryRow from '@/components/SummaryRow';
import { useCart } from '@/context/CartContext';
import { useProducts } from '@/lib/catalog';
import { CheckoutError, friendlyError, loadRazorpay, runCheckout, verifyPayment } from '@/lib/razorpayCheckout';

const PINCODE = /^[0-9]{6}$/;

// What the button says at each step of the payment.
const STAGE_TEXT = {
  idle: 'Proceed to Checkout',
  preparing: 'Preparing your order...',
  paying: 'Waiting for payment...',
  confirming: 'Confirming your payment...',
};

const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- small pieces ----------

// A labelled text field with an error line that screen readers read with it.
function Field({ label, error, optional = false, children }) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="text-nav-link text-ink">
        {label}
        {optional && <span className="font-normal text-ink-muted"> (optional)</span>}
      </label>
      <div className="mt-1">{children({ id, invalid: Boolean(error), describedBy: error ? errorId : undefined })}</div>
      {error && (
        <p id={errorId} className="mt-1 text-small font-bold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

const inputClass = (invalid) =>
  `w-full rounded-md border bg-surface-card px-3 text-body text-ink placeholder:text-ink-muted ${
    invalid ? 'border-danger' : 'border-green-accent'
  }`;

// ---------- the receipt shown after paying ----------

function OrderResult({ outcome, onBack }) {
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
        <button
          type="button"
          onClick={onBack}
          className="mt-6 min-h-11 rounded-pill bg-brand px-6 text-nav-link text-on-brand hover:brightness-110"
        >
          Back to cart
        </button>
      ) : (
        <>
          <section aria-labelledby="receipt-title" className="mt-6 rounded-xl border border-line bg-surface-card p-6 shadow-card">
            <h2 id="receipt-title" className="text-heading-3 text-ink">
              Your receipt
            </h2>
            <ul className="mt-3 divide-y divide-line">
              {quote.items.map((i) => (
                <li key={`${i.productId}:${i.size}`} className="flex justify-between gap-4 py-2 text-body text-ink">
                  <span>
                    {i.qty} × {i.name} <span className="text-ink-muted">({capitalise(i.size)})</span>
                  </span>
                  <span className="font-bold">₹{i.lineTotal}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 flex flex-col gap-1 border-t border-line pt-3">
              <SummaryRow label="Subtotal" value={`₹${p.subtotal}`} />
              {p.discount > 0 && <SummaryRow label="Discount" value={`-₹${p.discount}`} />}
              <SummaryRow label="Delivery" value={p.deliveryFee === 0 ? 'Free' : `₹${p.deliveryFee}`} />
              {p.tip > 0 && <SummaryRow label="Rider tip" value={`₹${p.tip}`} />}
              <div className="mt-2 border-t border-line pt-2">
                <SummaryRow label="Total paid" value={`₹${p.total}`} strong />
              </div>
            </dl>
          </section>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/orders/${result.orderId}`}
              className="inline-grid min-h-11 place-items-center rounded-pill bg-gold-bright px-6 text-nav-link text-on-gold hover:brightness-95"
            >
              Track your order
            </Link>
            <Link
              href="/products"
              className="inline-grid min-h-11 place-items-center rounded-pill border border-brand px-6 text-nav-link text-brand-text hover:bg-surface-cream"
            >
              Continue shopping
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

// ---------- the page ----------

export default function CartPage() {
  const { items, lines, subtotal, hydrated, catalogStatus, updateQuantity, removeFromCart, getMaxQuantity, clearCart } = useCart();
  const { reload: reloadCatalogue } = useProducts();

  const [form, setForm] = useState({ pincode: '', address: '', note: '' });
  const [showErrors, setShowErrors] = useState(false);
  const [stage, setStage] = useState('idle'); // idle | preparing | paying | confirming
  const [error, setError] = useState(null); // a problem to show in a danger callout
  const [notice, setNotice] = useState(null); // a gentler message (window closed, attempt failed)
  const [outcome, setOutcome] = useState(null); // the finished order: { result, quote }
  const [unconfirmed, setUnconfirmed] = useState(null); // paid, but not yet confirmed: { pending, quote }
  const pincodeRef = useRef(null);
  const addressRef = useRef(null);

  // Load the payment script in the background so it is ready when they click.
  useEffect(() => {
    loadRazorpay().catch(() => {}); // a failure is reported properly when they click Checkout
  }, []);

  const busy = stage !== 'idle';
  const loaded = hydrated && catalogStatus === 'ready';
  const problems = items.filter((i) => !i.available || !i.inStock);

  const fieldErrors = {
    pincode: PINCODE.test(form.pincode) ? null : 'Enter your 6-digit pincode.',
    address: form.address.trim() ? null : 'Enter your delivery address.',
  };

  // Payment worked (or the order was cancelled for stock): show the result.
  function finish(result, quote) {
    // The server already emptied its copy of the cart. Empty ours too, unless
    // the order was cancelled for stock (the customer keeps their cart then).
    if (result.status !== 'CANCELLED') clearCart();
    setUnconfirmed(null);
    setOutcome({ result, quote });
  }

  async function handleCheckout() {
    if (busy) return;
    setError(null);
    setNotice(null);

    if (fieldErrors.pincode || fieldErrors.address) {
      setShowErrors(true);
      (fieldErrors.pincode ? pincodeRef : addressRef).current?.focus();
      return;
    }

    try {
      const { result, quote } = await runCheckout({
        lines,
        details: { pincode: form.pincode, address: form.address.trim(), note: form.note.trim() },
        hooks: { onStage: setStage, onPaymentFailed: (message) => setNotice(`${message} You can try again in the payment window.`) },
      });
      finish(result, quote);
    } catch (err) {
      if (err instanceof CheckoutError && err.code === 'dismissed') setNotice(err.message);
      else if (err instanceof CheckoutError && err.code === 'verify-failed') setUnconfirmed(err.pending);
      else setError(friendlyError(err));
    } finally {
      setStage('idle');
    }
  }

  // "Check again" after a payment we could not confirm yet. Safe to repeat:
  // the server only ever confirms a payment once.
  async function handleRecheck() {
    if (busy || !unconfirmed) return;
    setError(null);
    setStage('confirming');
    try {
      finish(await verifyPayment(unconfirmed.pending), unconfirmed.quote);
    } catch (err) {
      console.error('Re-check failed:', err);
      setError('We still could not confirm it. Your payment is safe, and we will confirm your order automatically. You can check again in a moment.');
    } finally {
      setStage('idle');
    }
  }

  const head = (
    <Head>
      <title>Your Cart | FreshBliss</title>
    </Head>
  );

  // ----- finished order -----
  if (outcome) {
    return (
      <>
        {head}
        <div className="fb-container py-14.5">
          <OrderResult outcome={outcome} onBack={() => setOutcome(null)} />
        </div>
      </>
    );
  }

  // ----- paid, but not confirmed yet -----
  if (unconfirmed) {
    return (
      <>
        {head}
        <div className="fb-container py-14.5">
          <div className="mx-auto max-w-2xl">
            <h1 className="text-heading-2 text-brand-text">Almost there</h1>
            <Callout className="mt-4.5" title="We have your payment.">
              Your payment went through, but we could not confirm your order yet. Please do not pay again. We will confirm it
              automatically, or you can check again now.
            </Callout>
            {error && (
              <Callout tone="danger" className="mt-4.5">
                {error}
              </Callout>
            )}
            <button
              type="button"
              onClick={handleRecheck}
              disabled={busy}
              className="mt-6 min-h-11 rounded-pill bg-brand px-6 text-nav-link text-on-brand hover:brightness-110 disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-muted"
            >
              {busy ? 'Checking...' : 'Check again'}
            </button>
          </div>
        </div>
      </>
    );
  }

  // ----- the cart -----
  return (
    <>
      {head}
      <div className="fb-container py-14.5">
        <p className="text-label text-gold">Almost yours</p>
        <h1 className="mt-2 text-heading-2 text-brand-text">Your Cart</h1>

        <div className="mt-8.5">
          {/* loading */}
          {!loaded && catalogStatus !== 'error' && (
            <div aria-hidden="true" className="h-40 rounded-xl border border-line bg-surface-card shadow-card motion-safe:animate-pulse" />
          )}
          {!loaded && catalogStatus !== 'error' && (
            <p role="status" className="sr-only">
              Loading your cart
            </p>
          )}

          {/* could not load prices */}
          {catalogStatus === 'error' && (
            <Callout tone="danger" title="We could not load your cart prices.">
              Check your connection and try again.
              <div>
                <button
                  type="button"
                  onClick={reloadCatalogue}
                  className="mt-3 min-h-11 rounded-pill bg-brand px-5 text-nav-link text-on-brand hover:brightness-110"
                >
                  Try again
                </button>
              </div>
            </Callout>
          )}

          {/* empty */}
          {loaded && items.length === 0 && (
            <div className="rounded-xl border border-line bg-surface-card p-8 shadow-card">
              <h2 className="text-heading-3 text-ink">Your cart is empty</h2>
              <p className="mt-1 text-body text-ink-muted">Fresh boxes are waiting for you.</p>
              <Link
                href="/products"
                className="mt-4 inline-grid min-h-11 place-items-center rounded-pill bg-gold-bright px-6 text-nav-link text-on-gold hover:brightness-95"
              >
                Shop Now
              </Link>
            </div>
          )}

          {/* items + summary */}
          {loaded && items.length > 0 && (
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
              <ul className="flex flex-col gap-4.5">
                {items.map((item) => (
                  <CartLineItem
                    key={item.id}
                    item={item}
                    maxQty={getMaxQuantity(item.productId, item.size)}
                    locked={busy}
                    onChangeQty={(qty) => updateQuantity(item.productId, item.size, qty)}
                    onRemove={() => removeFromCart(item.productId, item.size)}
                  />
                ))}
              </ul>

              <aside aria-labelledby="summary-title" className="rounded-xl border border-line bg-surface-card p-6 shadow-card lg:sticky lg:top-24">
                <h2 id="summary-title" className="text-heading-3 text-ink">
                  Order summary
                </h2>

                <dl className="mt-4 flex flex-col gap-2">
                  <SummaryRow label="Subtotal" value={`₹${subtotal}`} />
                  {/* The server works out the fee from the pincode, so it is a placeholder here. */}
                  <SummaryRow label="Delivery" value="Calculated at checkout" muted />
                </dl>
                <p className="mt-2 text-small text-ink-muted">Your delivery fee depends on your pincode. The total is confirmed before you pay.</p>

                <div className="mt-5 flex flex-col gap-4 border-t border-line pt-5">
                  <Field label="Delivery pincode" error={showErrors ? fieldErrors.pincode : null}>
                    {({ id, invalid, describedBy }) => (
                      <input
                        ref={pincodeRef}
                        id={id}
                        value={form.pincode}
                        onChange={(e) => setForm((f) => ({ ...f, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                        inputMode="numeric"
                        autoComplete="postal-code"
                        maxLength={6}
                        placeholder="560001"
                        aria-invalid={invalid}
                        aria-describedby={describedBy}
                        disabled={busy}
                        className={`${inputClass(invalid)} min-h-11`}
                      />
                    )}
                  </Field>

                  <Field label="Delivery address" error={showErrors ? fieldErrors.address : null}>
                    {({ id, invalid, describedBy }) => (
                      <textarea
                        ref={addressRef}
                        id={id}
                        value={form.address}
                        onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                        maxLength={200}
                        rows={3}
                        autoComplete="street-address"
                        aria-invalid={invalid}
                        aria-describedby={describedBy}
                        disabled={busy}
                        className={`${inputClass(invalid)} py-2`}
                      />
                    )}
                  </Field>

                  <Field label="Delivery instructions" optional>
                    {({ id }) => (
                      <textarea
                        id={id}
                        value={form.note}
                        onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                        maxLength={200}
                        rows={2}
                        placeholder="Ring the bell twice"
                        disabled={busy}
                        className={`${inputClass(false)} py-2`}
                      />
                    )}
                  </Field>
                </div>

                {problems.length > 0 && (
                  <Callout tone="danger" className="mt-5">
                    Some items need your attention before you can check out.
                  </Callout>
                )}
                {error && (
                  <Callout tone="danger" className="mt-5">
                    {error}
                  </Callout>
                )}
                {notice && <Callout className="mt-5">{notice}</Callout>}

                <button
                  type="button"
                  onClick={handleCheckout}
                  disabled={busy || problems.length > 0}
                  aria-busy={busy}
                  className="mt-5 min-h-13 w-full rounded-pill bg-gold-bright px-6 text-heading-3 text-on-gold motion-safe:transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-muted disabled:hover:brightness-100"
                >
                  {STAGE_TEXT[stage]}
                </button>
                <p role="status" className="sr-only">
                  {busy ? STAGE_TEXT[stage] : ''}
                </p>
              </aside>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
