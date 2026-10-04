'use strict';

// verifyPayment
// Called by the browser after the customer pays in the Razorpay sheet. Razorpay
// hands the browser three values: order id, payment id and a signature. The
// signature is Razorpay's proof that the payment really happened, so we check it
// here with the secret key, which only the server has.
//
// Flow:
//   1. check the caller owns the checkout
//   2. verify the Razorpay signature (HMAC-SHA256, timing-safe compare)
//   3. finalizeCheckout (shared/payments.js): ONE Firestore transaction for
//      stock + checkout + order, then clear the cart
//
// The webhook (razorpayWebhook.js) runs the same finalizeCheckout, so whichever
// of the two arrives first wins and the other is a harmless no-op.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { callableOptions } = require('./shared/hardening');
const { logger } = require('firebase-functions');
const { defineSecret } = require('firebase-functions/params');
const { getFirestore } = require('firebase-admin/firestore');
const { finalizeCheckout, hmacMatches } = require('./shared/payments');

// Same secret createCheckout uses. Declaring a param twice with the same name is fine.
// Local: put it in functions/.secret.local  (RAZORPAY_KEY_SECRET=...)
const RAZORPAY_KEY_SECRET = defineSecret('RAZORPAY_KEY_SECRET');

const SAFE_ID = /^[A-Za-z0-9_-]{1,100}$/; // no "/" so ids cannot escape a path
const RAZORPAY_ID = /^[A-Za-z0-9_]{1,60}$/; // e.g. order_Abc123 / pay_Abc123

const fail = (code, message, details) => new HttpsError(code, message, details);

function readInput(data) {
  const d = data || {};
  const checkoutId = d.checkoutId;
  const orderId = d.razorpay_order_id;
  const paymentId = d.razorpay_payment_id;
  const signature = d.razorpay_signature;
  const ok =
    typeof checkoutId === 'string' && SAFE_ID.test(checkoutId) &&
    typeof orderId === 'string' && RAZORPAY_ID.test(orderId) &&
    typeof paymentId === 'string' && RAZORPAY_ID.test(paymentId) &&
    typeof signature === 'string';
  if (!ok) throw fail('invalid-argument', 'Missing or invalid payment details.');
  return { checkoutId, orderId, paymentId, signature };
}

exports.verifyPayment = onCall(
  callableOptions({ secrets: [RAZORPAY_KEY_SECRET] }),
  async (request) => {
    if (!request.auth) throw fail('unauthenticated', 'Please sign in.');
    const uid = request.auth.uid;
    const input = readInput(request.data);
    const db = getFirestore();

    // Step 1: load the checkout the SERVER created, and check it is theirs.
    // "Not found" is used for both missing and someone else's, so ids cannot be probed.
    const checkoutSnap = await db.doc(`checkouts/${input.checkoutId}`).get();
    if (!checkoutSnap.exists || checkoutSnap.get('uid') !== uid) {
      throw fail('not-found', 'We could not find that checkout.');
    }

    // The Razorpay order id must be the one WE stored. We never trust the
    // browser's copy to decide what was paid for.
    const storedOrderId = checkoutSnap.get('payment.razorpayOrderId');
    if (input.orderId !== storedOrderId) {
      throw fail('invalid-argument', 'This payment does not match the checkout.');
    }

    // Step 2: prove the payment is genuine. Razorpay signs "<order_id>|<payment_id>".
    const genuine = hmacMatches(RAZORPAY_KEY_SECRET.value(), `${storedOrderId}|${input.paymentId}`, input.signature);
    if (!genuine) {
      logger.warn('Razorpay signature mismatch', { checkoutId: input.checkoutId, uid });
      throw fail('permission-denied', 'We could not verify this payment.');
    }

    // Step 3: stock, checkout state, order and cart cleanup (shared with the webhook).
    const result = await finalizeCheckout(db, {
      checkoutId: input.checkoutId,
      razorpayPaymentId: input.paymentId,
      uid,
    });

    return {
      orderId: result.orderId,
      status: result.status,
      paymentStatus: result.paymentStatus,
      message:
        result.status === 'CANCELLED'
          ? 'Sorry, an item sold out while you were paying. Your payment will be refunded.'
          : 'Payment confirmed.',
    };
  },
);
