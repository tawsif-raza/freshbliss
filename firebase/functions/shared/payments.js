'use strict';

// Payment confirmation, shared by BOTH ways a payment can reach us:
//   - verifyPayment   (the browser calls it after Razorpay's success callback)
//   - razorpayWebhook (Razorpay's servers call it, even if the browser is gone)
// One copy of this code means the two paths cannot drift apart.
//
// Exports:
//   hmacMatches     check an HMAC-SHA256 signature (used for both kinds of signature)
//   confirmPayment  the Firestore transaction (stock, checkout, order)
//   finalizeCheckout  confirmPayment + clearing the cart; what callers should use

const crypto = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const { FieldValue } = require('firebase-admin/firestore');

const SIGNATURE_HEX = /^[0-9a-fA-F]{64}$/; // SHA-256 as hex

const fail = (code, message, details) => new HttpsError(code, message, details);

// ---------- signatures ----------

// Does `signature` equal HMAC-SHA256(secret, message)? `message` can be a string
// or the raw request bytes. timingSafeEqual avoids leaking, through timing, how
// many leading characters matched.
function hmacMatches(secret, message, signature) {
  if (typeof signature !== 'string' || !SIGNATURE_HEX.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(message).digest();
  const given = Buffer.from(signature, 'hex');
  return given.length === expected.length && crypto.timingSafeEqual(expected, given);
}

// ---------- stock ----------

// Add up what the order needs per product (all sizes together) and compare it
// with the live stock. Returns a short reason string, or null if all is fine.
// `snaps` are the product documents read inside the transaction.
function findShortage(items, snaps) {
  const wanted = new Map();
  for (const i of items) wanted.set(i.productId, (wanted.get(i.productId) || 0) + i.qty);

  const byId = new Map(snaps.map((s) => [s.id, s]));
  for (const [productId, qty] of wanted) {
    const snap = byId.get(productId);
    if (!snap || !snap.exists || snap.get('active') !== true) return `${productId} is no longer available`;
    const stock = Number.isInteger(snap.get('stock')) ? snap.get('stock') : 0;
    if (qty > stock) return `${snap.get('name') || productId} sold out`;
  }
  return null;
}

// ---------- the transaction ----------

// Confirms a payment that has ALREADY been proven genuine (the caller checked a
// signature). Safe to run any number of times, even at the same moment, for the
// same checkout: the first run does the work and every other run sees the
// checkout already PAID and returns the same order without changing anything.
//   `uid` is optional: verifyPayment passes it to enforce ownership; the webhook
//   has no signed-in user and leaves it out (it found the checkout by order id).
async function confirmPayment(db, { checkoutId, razorpayPaymentId, uid }) {
  const checkoutRef = db.doc(`checkouts/${checkoutId}`);
  const orderRef = db.doc(`orders/${checkoutId}`); // order id === checkout id

  // Firestore may re-run this function if another request touches the same
  // documents at the same moment. So it must have no side effects except the
  // writes below (no logging that matters, no network calls).
  return db.runTransaction(async (tx) => {
    // ===== READS (a transaction must read everything before it writes) =====
    const checkoutSnap = await tx.get(checkoutRef);
    if (!checkoutSnap.exists) throw fail('not-found', 'We could not find that checkout.');
    const checkout = checkoutSnap.data();
    if (uid && checkout.uid !== uid) throw fail('not-found', 'We could not find that checkout.');

    // Already processed? Return the existing order and change nothing.
    // This is what makes a duplicate call (or a duplicate webhook) harmless.
    if (checkout.status === 'PAID') {
      const existing = await tx.get(orderRef);
      return {
        orderId: checkoutId,
        uid: checkout.uid,
        status: existing.get('status'),
        paymentStatus: existing.get('paymentStatus'),
        replay: true,
      };
    }
    if (checkout.status !== 'CREATED') {
      throw fail('failed-precondition', 'This checkout can no longer be paid.');
    }

    // Read every product in the order, in the same transaction, so the stock we
    // check is the stock we change.
    const productIds = [...new Set(checkout.items.map((i) => i.productId))];
    const productRefs = productIds.map((id) => db.doc(`products/${id}`));
    const productSnaps = await tx.getAll(...productRefs);

    const shortage = findShortage(checkout.items, productSnaps);

    // ===== WRITES =====
    const now = FieldValue.serverTimestamp();

    // Fields every order gets. Prices come from the checkout the SERVER made.
    const orderBase = {
      id: checkoutId,
      uid: checkout.uid,
      items: checkout.items,
      pricing: checkout.pricing,
      promo: checkout.promo,
      zone: checkout.zone,
      pincode: checkout.pincode,
      address: checkout.address,
      note: checkout.note,
      payment: { ...checkout.payment, razorpayPaymentId },
      createdAt: now,
      updatedAt: now,
    };

    if (shortage) {
      // Someone else bought the last box while this customer was paying. We
      // already have their money, so we cancel the order, leave stock alone,
      // and flag it for refund (the refund itself is a later step).
      tx.create(orderRef, {
        ...orderBase,
        status: 'CANCELLED',
        paymentStatus: 'REFUND_PENDING',
        cancelReason: `Out of stock: ${shortage}`,
        cancelledBy: 'system',
        etaMinutes: null,
        etaTotal: null,
        timestamps: { CANCELLED: now },
      });
      tx.update(checkoutRef, {
        status: 'PAID',
        orderId: checkoutId,
        outcome: 'OUT_OF_STOCK',
        'payment.razorpayPaymentId': razorpayPaymentId,
        paidAt: now,
      });
      return { orderId: checkoutId, uid: checkout.uid, status: 'CANCELLED', paymentStatus: 'REFUND_PENDING', replay: false };
    }

    // Happy path 1: take the stock. We just read these exact docs inside this
    // transaction, so "stock - qty" cannot go below zero or lose a concurrent sale.
    const wanted = new Map();
    for (const i of checkout.items) wanted.set(i.productId, (wanted.get(i.productId) || 0) + i.qty);
    for (const snap of productSnaps) {
      tx.update(snap.ref, { stock: snap.get('stock') - wanted.get(snap.id), updatedAt: now });
    }

    // Happy path 2: mark the checkout as paid so a repeat call does nothing.
    tx.update(checkoutRef, {
      status: 'PAID',
      orderId: checkoutId,
      outcome: 'CONFIRMED',
      'payment.razorpayPaymentId': razorpayPaymentId,
      paidAt: now,
    });

    // Happy path 3: create the official order. create() fails if it already
    // exists, a second guard against duplicates.
    tx.create(orderRef, {
      ...orderBase,
      status: 'PAYMENT_CONFIRMED',
      paymentStatus: 'PAID',
      etaMinutes: checkout.zone.etaMax ?? null,
      etaTotal: checkout.zone.etaMax ?? null,
      timestamps: { PAYMENT_CONFIRMED: now },
    });

    return { orderId: checkoutId, uid: checkout.uid, status: 'PAYMENT_CONFIRMED', paymentStatus: 'PAID', replay: false };
  });
}

// ---------- cart cleanup ----------

// Clearing the cart is cleanup. The payment is already safe, so if it fails we
// log it and carry on instead of reporting the payment as failed. Deleting a
// cart that is already gone is harmless, so running this twice is fine.
async function clearCart(db, uid) {
  try {
    await db.doc(`carts/${uid}`).delete();
  } catch (err) {
    logger.error('Could not clear cart after payment', { uid, detail: err && err.message });
  }
}

// What both callers should use: run the transaction, then (only for an order
// that really went through) clear the customer's cart. If the order was
// cancelled for stock, the customer keeps their cart so they can try again.
async function finalizeCheckout(db, { checkoutId, razorpayPaymentId, uid }) {
  const result = await confirmPayment(db, { checkoutId, razorpayPaymentId, uid });
  if (result.status !== 'CANCELLED') await clearCart(db, result.uid);
  return result;
}

module.exports = { hmacMatches, findShortage, confirmPayment, clearCart, finalizeCheckout };
