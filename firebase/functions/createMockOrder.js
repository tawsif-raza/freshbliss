'use strict';

// createMockOrder  (LOCAL EMULATOR ONLY)
// Lets the whole customer journey be tried end to end WITHOUT Razorpay: the checkout page calls this
// instead of opening the payment window, and it creates a real order that goes through the tracking page,
// the staff dashboard and the account page like any other.
//
// WHY A FUNCTION, AND NOT THE BROWSER WRITING THE ORDER ITSELF
// The security rules forbid every browser from writing to `orders`. That rule is what stops anyone giving
// themselves a free "paid" order, so it must never be loosened, not even for testing. A function writes
// with the Admin SDK instead, and it prices the cart with the SAME code the real checkout uses.
//
// HOW IT IS KEPT OUT OF PRODUCTION (three separate guards)
//   1. functions/index.js exports it only when FUNCTIONS_EMULATOR is "true", so `firebase deploy` never
//      publishes it (the same way devGrantStaff is kept out).
//   2. The function itself refuses to run outside the emulator, in case it is ever exported by mistake.
//   3. The checkout page only calls it when the storefront is talking to the emulators (lib/firebaseClient.js
//      switches that off in every production build).
//   tests/regions.test.js and tests/mockOrder.test.js check the first two.
//
// WHAT THE ORDER LOOKS LIKE
//   status PREPARING, paymentStatus PAID_MOCK (never PAID), so a test order can never be mistaken for a real
//   sale, and cancelOrder (which needs PAID) refuses it, so it can never land in the refund queue.
//   Stock is NOT taken (it is a test: reseed to reset anyway) and no Razorpay payment is made.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { quoteCart } = require('./previewCheckout');
const { readPromoClaim, writePromoClaim } = require('./shared/promoLimits');

const MAX_ADDRESS_LENGTH = 200;
const fail = (code, message) => new HttpsError(code, message);

// The work, apart from Firebase, so it can be tested.
//   request  { auth, data: { items, pincode, tip, promoCode, address, note } }
//   deps     { db, emulator } so tests can use a fake database and pretend to be inside or outside the emulator
async function buildMockOrder(request, deps = {}) {
  const inEmulator = deps.emulator ?? process.env.FUNCTIONS_EMULATOR === 'true';
  if (!inEmulator) throw fail('failed-precondition', 'Test orders can only be created in the local emulator.');

  // Signed in, a readable cart, a good pincode, a valid tip and promo, stock and the price: all the real checks.
  const quote = await quoteCart(request, deps);

  const data = request.data || {};
  const address = typeof data.address === 'string' ? data.address.trim() : '';
  if (!address || address.length > MAX_ADDRESS_LENGTH) throw fail('invalid-argument', `Enter a delivery address (up to ${MAX_ADDRESS_LENGTH} characters).`);
  const note = typeof data.note === 'string' ? data.note.slice(0, 200) : '';

  const db = deps.db || getFirestore();
  const ref = db.collection('orders').doc();
  const now = FieldValue.serverTimestamp();
  const { pricing, zone } = quote;

  const order = {
    id: ref.id,
    uid: request.auth.uid,
    items: quote.items,
    pricing,
    promo: quote.promo,
    zone: { id: zone.id, name: zone.name, fee: pricing.deliveryFee, etaMin: zone.etaMin, etaMax: zone.etaMax },
    pincode: data.pincode,
    address,
    note,
    slot: quote.slot,
    payment: { razorpayOrderId: null, razorpayPaymentId: null, amountPaise: pricing.total * 100, currency: 'INR', mock: true },
    status: 'PREPARING',
    paymentStatus: 'PAID_MOCK',
    etaMinutes: zone.etaMax ?? null,
    etaTotal: zone.etaMax ?? null,
    timestamps: { PAYMENT_CONFIRMED: now, PREPARING: now },
    createdAt: now,
    updatedAt: now,
  };

  if (!quote.promo) {
    await ref.create(order);
  } else {
    // A test order counts a use of its promo code exactly like a real one (same limits, same transaction), so the
    // "already used" and "usage limit" messages can be tried on a laptop.
    await db.runTransaction(async (tx) => {
      const claim = await readPromoClaim(tx, db, quote.promo.code, request.auth.uid);
      if (claim?.problem) throw fail('failed-precondition', claim.problem.message, { promoLimit: true });
      tx.create(ref, order);
      if (claim) writePromoClaim(tx, claim, { uid: request.auth.uid, orderId: ref.id });
    });
  }

  return { orderId: ref.id, status: 'PREPARING', paymentStatus: 'PAID_MOCK', pricing };
}

exports.createMockOrder = onCall({ region: 'asia-south1' }, (request) => buildMockOrder(request));

// Exported for the tests.
exports.buildMockOrder = buildMockOrder;
