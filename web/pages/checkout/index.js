// Checkout: /checkout
// Where the customer says where to deliver (pincode, house/flat, road/area, an optional landmark and a
// Home/Work/Other tag, with a "Use Current Location" button), applies a promo code, picks a rider tip, sees the full
// itemised total, and pays. The cart page only holds the cart.
//
// Every figure is checked by the SERVER before it is shown as final (previewCheckout) and again when
// the customer pays (createCheckout). The page shows its own quick estimate while that is on the way.
//
//   zone fee  live from Firestore: the pincode is checked against the delivery zones as they type
//   promo     applied only once the server has accepted the code
//   total     the server's price, shown before Razorpay opens

import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import Callout from '@/components/Callout';
import CartSkeleton from '@/components/CartSkeleton';
import { Field, inputClass } from '@/components/Field';
import SummaryRow from '@/components/SummaryRow';
import ZoneStatus, { zoneOutcome } from '@/components/ZoneStatus';
import AddressFields from '@/components/checkout/AddressFields';
import CheckoutSummary from '@/components/checkout/CheckoutSummary';
import LocationButton from '@/components/checkout/LocationButton';
import OrderResult from '@/components/checkout/OrderResult';
import PromoCode from '@/components/checkout/PromoCode';
import SlotPicker from '@/components/checkout/SlotPicker';
import TipSelector from '@/components/checkout/TipSelector';
import { useCart } from '@/context/CartContext';
import { ADDRESS_LIMITS, DEFAULT_ADDRESS_TYPE, addressErrors, formatAddress } from '@/lib/address';
import { isPromoLimitError } from '@/lib/errors';
import { usingEmulators } from '@/lib/firebaseClient';
import { previewTotals } from '@/lib/pricing';
import { slotChoice } from '@/lib/slots';
import { CheckoutError, friendlyError, loadRazorpay, previewPricing, runCheckout, runMockCheckout, verifyPayment } from '@/lib/razorpayCheckout';
import { PINCODE, deliveryFeeFor, feeLabel, useSavedPincode, useZones } from '@/lib/zones';

// What the button says at each step of the payment.
const STAGE_TEXT = {
  preparing: 'Preparing your order...',
  paying: 'Waiting for payment...',
  confirming: 'Confirming your payment...',
};

// ---------- the page ----------

export default function CheckoutPage() {
  const router = useRouter();
  const { items, lines, subtotal, hydrated, catalogStatus, clearCart } = useCart();
  const { zones, status: zonesStatus } = useZones();
  const { pincode: savedPincode, setPincode: savePincode } = useSavedPincode();

  const [typedPincode, setTypedPincode] = useState(null); // null until they type: then the remembered one shows
  const [form, setForm] = useState({ flat: '', area: '', landmark: '', note: '' });
  const [addressType, setAddressType] = useState(DEFAULT_ADDRESS_TYPE); // home | work | other
  const [tip, setTip] = useState(0);
  const [slot, setSlot] = useState(null); // null = as soon as possible, else a slot from lib/slots.js
  const [promoCode, setPromoCode] = useState(null); // only a code the server has accepted
  const [promoNote, setPromoNote] = useState(''); // why a code was refused
  const [promoBusy, setPromoBusy] = useState(false);

  const [showErrors, setShowErrors] = useState(false);
  const [stage, setStage] = useState('idle'); // idle | preparing | paying | confirming
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [outcome, setOutcome] = useState(null); // the finished order: { result, quote }
  const [unconfirmed, setUnconfirmed] = useState(null); // paid, but not yet confirmed: { pending, quote }
  const [settled, setSettled] = useState(null); // the server's last answer: { key, data, error, promoError }
  const pincodeRef = useRef(null);
  const flatRef = useRef(null);
  const areaRef = useRef(null);

  // Start with the pincode remembered from the product page or an earlier visit, until they type their own.
  const pincode = typedPincode ?? savedPincode;

  // Load the payment script in the background so it is ready when they press Pay. (Not when testing locally:
  // that path never opens Razorpay.)
  useEffect(() => {
    if (usingEmulators) return;
    loadRazorpay().catch(() => {}); // a failure is reported properly when they press Pay
  }, []);

  const busy = stage !== 'idle';
  const loaded = hydrated && catalogStatus === 'ready';
  const problems = items.filter((i) => !i.available || !i.inStock);
  const area = zoneOutcome(pincode, zones, zonesStatus); // empty | typing | checking | unknown | outside | ok

  // ----- ask the server what this costs -----
  // We can ask once the cart is sound and the pincode is one we deliver to (or we could not load the zones,
  // in which case the server is the judge). The answer is stored WITH the inputs it was for; anything that
  // changes the inputs makes the stored answer stale, so a stale price is never shown as final.
  const canQuote = loaded && items.length > 0 && problems.length === 0 && (area.kind === 'ok' || area.kind === 'unknown');
  const inputKey = canQuote ? JSON.stringify([lines, pincode, tip, promoCode, slotChoice(slot)]) : null;

  useEffect(() => {
    if (!inputKey) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const data = await previewPricing({ lines, pincode, tip, promoCode, slot: slotChoice(slot) });
        if (!cancelled) setSettled({ key: inputKey, data, error: '', promoError: '' });
      } catch (err) {
        // A code that has been used up (or already used by this customer) since it was applied: drop it and say so,
        // so the customer can simply pay the normal price.
        if (promoCode && isPromoLimitError(err)) {
          if (!cancelled) {
            setPromoNote(friendlyError(err));
            setPromoCode(null);
          }
          return;
        }
        let promoError = '';
        let data = null;
        if (promoCode) {
          // Is the code the problem, or the cart? Ask again without it.
          try {
            data = await previewPricing({ lines, pincode, tip, promoCode: null, slot: slotChoice(slot) });
            promoError = friendlyError(err);
          } catch {
            data = null;
          }
        }
        if (!cancelled) setSettled({ key: inputKey, data, error: data ? '' : friendlyError(err), promoError });
      }
    }, 400); // wait for them to stop typing
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [inputKey, lines, pincode, tip, promoCode, slot]);

  const current = settled && settled.key === inputKey ? settled : null; // the answer for what is on screen now
  const quoting = Boolean(inputKey) && !current;
  const serverPricing = current?.data?.pricing ?? null;

  // What to show: the server's price when we have it, otherwise our own quick estimate.
  const zoneFee = area.kind === 'ok' ? deliveryFeeFor(area.zone, subtotal) : null;
  const estimate = area.kind === 'ok' ? previewTotals({ subtotal, deliveryFee: zoneFee, tip }) : null;
  const pricing = serverPricing ?? estimate;

  // The promo box.
  let promoStatus = 'none';
  let promoMessage = promoNote;
  if (promoNote) promoStatus = 'error';
  else if (promoBusy) promoStatus = 'checking';
  else if (promoCode) {
    if (!current) promoStatus = quoting ? 'checking' : 'pending';
    else if (current.promoError) {
      promoStatus = 'error';
      promoMessage = current.promoError;
    } else if (current.data?.promo) {
      promoStatus = 'applied';
      promoMessage = `${current.data.promo.code} applied. You save ₹${current.data.pricing.discount}.`;
    }
  }

  const fieldErrors = {
    pincode: !PINCODE.test(pincode) ? 'Enter your 6-digit pincode.' : area.kind === 'outside' ? 'We do not deliver here yet.' : null,
    ...addressErrors(form), // flat and area
  };

  // The one line the order stores, for example "Home: Flat 4B, MG Road, near Metro. Pincode: 560041".
  const address = formatAddress({ type: addressType, flat: form.flat, area: form.area, landmark: form.landmark, pincode });

  // A code that was refused must not stop the customer paying: only an APPLIED code that has gone bad does (they can Remove it).
  const promoBlocks = Boolean(promoCode) && promoStatus === 'error';
  const canPay = loaded && items.length > 0 && problems.length === 0 && !busy && !promoBusy && !quoting && !current?.error && !promoBlocks && area.kind !== 'outside';

  function handlePincode(value) {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    setTypedPincode(digits);
    if (PINCODE.test(digits)) savePincode(digits);
  }

  // "Use Current Location" found something: fill the pincode and the road/area (never the house or flat number).
  function handleLocation({ pincode: foundPincode, area: foundArea }) {
    if (foundPincode) handlePincode(foundPincode);
    if (foundArea) setForm((f) => ({ ...f, area: foundArea.slice(0, ADDRESS_LIMITS.area) }));
  }

  // Apply a promo code: only keep it if the server accepts it.
  async function handleApplyPromo(code) {
    setPromoNote('');
    if (area.kind !== 'ok' && area.kind !== 'unknown') {
      setPromoNote('Enter a pincode we deliver to first, so we can check this code.');
      return;
    }
    setPromoBusy(true);
    try {
      await previewPricing({ lines, pincode, tip, promoCode: code, slot: slotChoice(slot) });
      setPromoCode(code);
    } catch (err) {
      setPromoNote(friendlyError(err));
    } finally {
      setPromoBusy(false);
    }
  }

  function handleRemovePromo() {
    setPromoCode(null);
    setPromoNote('');
  }

  // Payment worked (or the order was cancelled for stock): show the result.
  function finish(result, quote) {
    // The server already emptied its copy of the cart. Empty ours too, unless
    // the order was cancelled for stock (the customer keeps their cart then).
    if (result.status !== 'CANCELLED') clearCart();
    setUnconfirmed(null);
    setOutcome({ result, quote });
  }

  async function handlePay() {
    if (busy || !canPay) return;
    setError(null);
    setNotice(null);

    if (fieldErrors.pincode || fieldErrors.flat || fieldErrors.area) {
      setShowErrors(true);
      (fieldErrors.pincode ? pincodeRef : fieldErrors.flat ? flatRef : areaRef).current?.focus();
      return;
    }

    // LOCAL TESTING ONLY (the storefront is talking to the emulators; never true in a production build):
    // no Razorpay. The button spins for 1.5 seconds, a test order is created on the server, the cart is
    // emptied, and the customer lands on the live tracking page. See lib/razorpayCheckout.js (runMockCheckout).
    if (usingEmulators) {
      setStage('paying');
      try {
        const order = await runMockCheckout({ lines, details: { pincode, address, note: form.note.trim(), tip, promoCode, slot: slotChoice(slot) } });
        await router.push(`/orders/${order.orderId}`);
        clearCart(); // after leaving: emptying it first would flash "Your cart is empty" on this page for a moment
      } catch (err) {
        if (isPromoLimitError(err)) {
          setPromoNote(friendlyError(err));
          setPromoCode(null);
        } else setError(friendlyError(err));
        setStage('idle');
      }
      return; // on success we have left this page: nothing more to reset here
    }

    try {
      const { result, quote } = await runCheckout({
        lines,
        details: { pincode, address, note: form.note.trim(), tip, promoCode, slot: slotChoice(slot) },
        hooks: { onStage: setStage, onPaymentFailed: (message) => setNotice(`${message} You can try again in the payment window.`) },
      });
      finish(result, quote);
    } catch (err) {
      if (err instanceof CheckoutError && err.code === 'dismissed') setNotice(err.message);
      else if (err instanceof CheckoutError && err.code === 'verify-failed') setUnconfirmed(err.pending);
      else if (isPromoLimitError(err)) {
        // The code was used up between "Apply" and "Pay". Nothing was charged. Drop it and let them pay the normal price.
        setPromoNote(friendlyError(err));
        setPromoCode(null);
        setNotice('We took the promo code off your order. Your total has changed: check it, then press Pay again.');
      } else setError(friendlyError(err));
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
      <title>Checkout | FreshBliss</title>
      <meta name="robots" content="noindex" />
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
              Your payment went through, but we could not confirm your order yet. Please do not pay again. We will confirm it automatically, or you can check
              again now.
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

  // ----- checkout -----
  return (
    <>
      {head}
      <div className="fb-container py-14.5">
        <p className="text-label text-gold">Nearly there</p>
        <h1 className="mt-2 text-heading-2 text-brand-text">Checkout</h1>

        <div className="mt-8.5">
          {!loaded && catalogStatus !== 'error' && <CartSkeleton label="Loading your checkout" />}

          {catalogStatus === 'error' && (
            <Callout tone="danger" title="We could not load your cart prices.">
              Check your connection and try again.
              <div>
                <Link href="/cart" className="mt-3 inline-grid min-h-11 place-items-center rounded-pill bg-brand px-5 text-nav-link text-on-brand hover:brightness-110">
                  Back to cart
                </Link>
              </div>
            </Callout>
          )}

          {loaded && items.length === 0 && (
            <div className="rounded-xl border border-line bg-surface-card p-8 shadow-card">
              <h2 className="text-heading-3 text-ink">Your cart is empty</h2>
              <p className="mt-1 text-body text-ink-muted">Add a fresh box, then come back to check out.</p>
              <Link href="/products" className="mt-4 inline-grid min-h-11 place-items-center rounded-pill bg-gold-bright px-6 text-nav-link text-on-gold hover:brightness-95">
                Shop Now
              </Link>
            </div>
          )}

          {loaded && items.length > 0 && (
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
              {/* Left: where, tip, promo */}
              <div className="flex flex-col gap-6">
                <section aria-labelledby="delivery-title" className="rounded-xl border border-line bg-surface-card p-6 shadow-card">
                  <h2 id="delivery-title" className="text-heading-3 text-ink">
                    Delivery details
                  </h2>
                  <div className="mt-4 flex flex-col gap-4">
                    <Field label="Delivery pincode" error={showErrors ? fieldErrors.pincode : null}>
                      {({ id, invalid, describedBy }) => (
                        <input
                          ref={pincodeRef}
                          id={id}
                          value={pincode}
                          onChange={(e) => handlePincode(e.target.value)}
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
                    <ZoneStatus pincode={pincode} zones={zones} zonesStatus={zonesStatus} subtotal={subtotal} />

                    <LocationButton onFound={handleLocation} disabled={busy} />

                    <AddressFields
                      value={{ ...form, addressType }}
                      onChange={({ addressType: nextType, ...rest }) => {
                        if (nextType) setAddressType(nextType);
                        if (Object.keys(rest).length > 0) setForm((f) => ({ ...f, ...rest }));
                      }}
                      errors={showErrors ? fieldErrors : {}}
                      flatRef={flatRef}
                      areaRef={areaRef}
                      disabled={busy}
                    />

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
                </section>

                <section aria-labelledby="slot-title" className="rounded-xl border border-line bg-surface-card p-6 shadow-card">
                  <h2 id="slot-title" className="sr-only">
                    Delivery time
                  </h2>
                  <SlotPicker
                    value={slot}
                    onChange={setSlot}
                    disabled={busy}
                    etaText={area.kind === 'ok' && area.zone?.etaMin && area.zone?.etaMax ? `about ${area.zone.etaMin} to ${area.zone.etaMax} min` : ''}
                  />
                </section>

                <section aria-labelledby="extras-title" className="rounded-xl border border-line bg-surface-card p-6 shadow-card">
                  <h2 id="extras-title" className="text-heading-3 text-ink">
                    Tip and promo
                  </h2>
                  <div className="mt-4 flex flex-col gap-6">
                    <TipSelector value={tip} onChange={setTip} disabled={busy} />
                    <PromoCode applied={promoCode} status={promoStatus} message={promoMessage} onApply={handleApplyPromo} onRemove={handleRemovePromo} disabled={busy || promoBusy} />
                  </div>
                </section>
              </div>

              {/* Right: the order summary and the Pay button */}
              <aside aria-labelledby="summary-title" className="rounded-xl border border-line bg-surface-card p-6 shadow-card lg:sticky lg:top-24">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 id="summary-title" className="text-heading-3 text-ink">
                    Order summary
                  </h2>
                  <Link href="/cart" className="text-small font-bold text-brand-text underline">
                    Edit cart
                  </Link>
                </div>

                <div className="mt-4">
                  <CheckoutSummary items={items} pricing={pricing} estimated={!serverPricing && Boolean(inputKey)} promoCode={current?.data?.promo?.code ?? null} />
                </div>

                {problems.length > 0 && (
                  <Callout tone="danger" className="mt-5">
                    Some items need your attention. <Link href="/cart" className="font-bold underline">Fix them in your cart.</Link>
                  </Callout>
                )}
                {current?.error && (
                  <Callout tone="danger" className="mt-5">
                    {current.error}
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
                  onClick={handlePay}
                  disabled={!canPay}
                  aria-busy={busy}
                  className="mt-5 min-h-13 w-full rounded-pill bg-gold-bright px-6 text-heading-3 text-on-gold motion-safe:transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-muted disabled:hover:brightness-100"
                >
                  {busy && <Loader2 size={22} aria-hidden="true" className="mr-2 inline-block align-[-4px] motion-safe:animate-spin" />}
                  {busy && !usingEmulators ? STAGE_TEXT[stage] : serverPricing ? `Pay ₹${serverPricing.total}` : 'Pay securely'}
                </button>
                {usingEmulators ? (
                  <p className="mt-2 text-small text-ink-muted">Local test mode: no payment is taken, and the order is created straight away.</p>
                ) : (
                  <p className="mt-2 text-small text-ink-muted">You pay in Razorpay&apos;s secure window. Your total is confirmed before it opens.</p>
                )}
                <p className="mt-2 text-small text-ink-muted">
                  By paying you agree to our{' '}
                  <Link href="/terms" className="font-bold text-brand-text underline">
                    Terms
                  </Link>{' '}
                  and{' '}
                  <Link href="/refunds" className="font-bold text-brand-text underline">
                    Cancellation &amp; Refunds
                  </Link>
                  .
                </p>
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
