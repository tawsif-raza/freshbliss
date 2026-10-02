// The checkout flow, start to finish. This file is the glue; the UI lives in
// pages/cart/index.js.
//
//   1. sign in (anonymously, for now)                       lib/auth.js
//   2. save the cart to Firestore so the SERVER can read it  carts/{uid}
//   3. createCheckout  (Cloud Function): prices the cart on the server, checks
//      stock, creates the Razorpay order and returns its id
//   4. open the Razorpay payment window with that order id
//   5. verifyPayment   (Cloud Function): checks Razorpay's signature, then
//      creates the order and takes the stock
//
// What we never send to the server: prices, totals, fees or a zone. It works
// all of those out itself. The only things the customer chooses are the lines
// in their cart, a pincode, a delivery address, a note, a rider tip and a promo code.

import { httpsCallable } from 'firebase/functions';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, functions } from './firebaseClient';
import { ensureSignedIn } from './auth';
import { friendlyError } from './errors';

const RAZORPAY_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

// Server error codes that are worth trying again (a hiccup, not a "no").
const RETRYABLE = new Set(['functions/unavailable', 'functions/internal', 'functions/deadline-exceeded', 'functions/unknown']);

// An error with a code the page can react to:
//   'dismissed'      the customer closed the payment window
//   'verify-failed'  they PAID but we could not confirm yet (`pending` has the details to retry)
export class CheckoutError extends Error {
  constructor(code, message, pending = null) {
    super(message);
    this.name = 'CheckoutError';
    this.code = code;
    this.pending = pending;
  }
}

// friendlyError() turns any error into a customer-safe message (see lib/errors.js).
export { friendlyError };

// ---------- 1. load the Razorpay script ----------

let scriptPromise = null;

// Adds Razorpay's checkout script to the page the first time it is needed and
// returns the global `Razorpay` constructor. Calling it again reuses the same
// script. If loading fails, the next call tries afresh.
export function loadRazorpay() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Razorpay can only load in the browser.'));
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = RAZORPAY_SRC;
    script.async = true;
    const giveUp = () => {
      scriptPromise = null; // allow a retry
      script.remove();
      reject(new CheckoutError('script', 'We could not load the payment window. Check your connection and try again.'));
    };
    script.onload = () => (window.Razorpay ? resolve(window.Razorpay) : giveUp());
    script.onerror = giveUp;
    document.body.appendChild(script);
  });
  return scriptPromise;
}

// ---------- 2. save the cart where the server can read it ----------

// Writes carts/{uid} in exactly the shape the security rules allow. The
// guest's localStorage cart is the source of truth, so this REPLACES whatever
// was saved before. Only productId / size / qty go up, never prices.
async function saveCart(uid, lines, { note, pincode, tip = 0, promoCode = null }) {
  await setDoc(doc(db, 'carts', uid), {
    items: lines.map(({ productId, size, qty }) => ({ productId, size, qty })),
    note,
    tip, // 0, 10, 20 or 30: the rules and the server both check
    promoCode: promoCode || null, // only ever a code the customer typed; the server validates it
    pincode,
    updatedAt: serverTimestamp(),
  });
}

// ---------- a price quote, before anyone pays ----------

// Asks the server (previewCheckout) what this cart would cost: the delivery fee for the pincode, the
// discount for a promo code and the total. It charges nothing and saves nothing. Resolves with
//   { items, pricing: { subtotal, discount, deliveryFee, tip, total }, zone, promo }
// or rejects with a server error (use friendlyError() to show it, for example "Only 2 left of ...").
export async function previewPricing({ lines, pincode, tip = 0, promoCode = null }) {
  await ensureSignedIn(); // the server only answers signed-in visitors
  const items = lines.map(({ productId, size, qty }) => ({ productId, size, qty }));
  const { data } = await httpsCallable(functions, 'previewCheckout')({ items, pincode, tip, promoCode });
  return data;
}

// ---------- 4. the payment window ----------

// The payment window follows the shop's brand colour, read from the theme.
function brandColour() {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--fb-brand').trim();
  return value || '#173f2a';
}

// Opens Razorpay and waits. Resolves with Razorpay's success response
// ({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) or rejects
// with a 'dismissed' CheckoutError if the customer closes the window.
function openPaymentWindow(Razorpay, quote, onPaymentFailed) {
  return new Promise((resolve, reject) => {
    const rzp = new Razorpay({
      key: quote.keyId, // public key id; the secret never leaves the server
      order_id: quote.razorpayOrderId, // ties this payment to the order the server priced
      amount: quote.amountPaise,
      currency: quote.currency,
      name: 'FreshBliss',
      description: 'Fresh fruit box order',
      theme: { color: brandColour() },
      handler: (response) => resolve(response), // payment succeeded
      modal: {
        confirm_close: true, // "are you sure?" before an accidental close
        ondismiss: () => reject(new CheckoutError('dismissed', 'The payment window was closed. Your cart is saved.')),
      },
    });
    // A failed attempt does not close the window: the customer can retry inside it.
    rzp.on('payment.failed', (event) => onPaymentFailed?.(event?.error?.description || 'The payment did not go through.'));
    rzp.open();
  });
}

// ---------- 5. confirm the payment ----------

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Tells the server "this payment happened" and gets the final order status.
// Safe to repeat: the server confirms a payment only once. Retries a couple of
// times on network hiccups. Also used by the "Check again" button.
export async function verifyPayment(pending) {
  const call = httpsCallable(functions, 'verifyPayment');
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { data } = await call(pending);
      return data; // { orderId, status, paymentStatus, message }
    } catch (err) {
      lastError = err;
      const retryable = !err.code || RETRYABLE.has(err.code); // no code = the network itself failed
      if (!retryable || attempt === 3) break;
      await wait(800 * attempt);
    }
  }
  throw lastError;
}

// ---------- the whole flow ----------

// Runs checkout. Resolves with:
//   { result: { orderId, status, paymentStatus, message }, quote }
// where `quote` is what the server priced (items and pricing) for the receipt.
//
// Throws a CheckoutError('dismissed') if the window is closed,
// a CheckoutError('verify-failed', ..., pending) if the customer paid but we
// could not confirm yet, or a server error (use friendlyError() to show it).
//
//   lines    the cart lines [{ productId, size, qty }]
//   details  { pincode, address, note, tip, promoCode }
//   hooks    onStage('preparing' | 'paying' | 'confirming'), onPaymentFailed(message)
export async function runCheckout({ lines, details, hooks = {} }) {
  const { onStage, onPaymentFailed } = hooks;

  onStage?.('preparing');
  const user = await ensureSignedIn();
  await saveCart(user.uid, lines, { note: details.note, pincode: details.pincode, tip: details.tip ?? 0, promoCode: details.promoCode ?? null });

  const { data: quote } = await httpsCallable(functions, 'createCheckout')({ address: details.address });
  const Razorpay = await loadRazorpay();

  onStage?.('paying');
  const response = await openPaymentWindow(Razorpay, quote, onPaymentFailed);

  // The customer has now PAID. From here on, a failure must never read as
  // "payment failed". The webhook will still confirm the order on its own.
  onStage?.('confirming');
  const pending = {
    checkoutId: quote.checkoutId,
    razorpay_order_id: response.razorpay_order_id,
    razorpay_payment_id: response.razorpay_payment_id,
    razorpay_signature: response.razorpay_signature,
  };
  try {
    const result = await verifyPayment(pending);
    return { result, quote };
  } catch (err) {
    console.error('verifyPayment failed after a successful payment:', err);
    throw new CheckoutError(
      'verify-failed',
      'Your payment went through, but we could not confirm your order yet. Please do not pay again. We will confirm it automatically, or you can check again now.',
      { pending, quote },
    );
  }
}
