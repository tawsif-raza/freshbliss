'use strict';

// previewCheckout
// Prices a cart WITHOUT charging anyone: the checkout page calls it to show the real delivery fee,
// the real discount for a promo code, and the real total before the customer pays. It is the
// read-only twin of createCheckout and uses the very same functions (normaliseLines, findZone,
// loadPromo, loadProducts, priceCart), so what is shown can never differ from what is charged.
//
// Why a function at all: promo codes are readable only by the server (so customers cannot list
// them), and the delivery fee depends on zones and thresholds the server owns. The browser sends
// only choices (items, pincode, tip, promo code); the server decides every figure.
//
// It changes nothing: no cart is saved, no Razorpay order is made, no stock is touched.
//
// Promo codes: a code that is wrong, switched off or expired all get the SAME answer ("not valid"),
// so this cannot be used to find out which codes exist or used to exist. (A valid code under its
// minimum spend still says how much more to add: a real customer needs to hear that.)

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');
const { normaliseLines, priceCart, findZone, loadPromo, loadProducts, ALLOWED_TIPS, PINCODE } = require('./createCheckout');
const { callableOptions } = require('./shared/hardening');
const { enforce, assertNotBlocked, recordFailure } = require('./shared/rateLimit');

const fail = (code, message) => new HttpsError(code, message);

// The work, apart from Firebase, so it can be tested.
//   request  { auth, data: { items, pincode, tip, promoCode } }
//   deps     { db } so tests can use a fake database; { onBadPromo } is called when a promo code is not usable
async function quoteCart(request, deps = {}) {
  if (!request.auth) throw fail('unauthenticated', 'Please sign in to check out.');
  const data = request.data || {};

  const lines = normaliseLines(data.items); // "Your cart is empty." and friends
  const tip = data.tip === undefined || data.tip === null ? 0 : data.tip;
  if (!ALLOWED_TIPS.includes(tip)) throw fail('invalid-argument', 'That tip amount is not available.');
  if (typeof data.pincode !== 'string' || !PINCODE.test(data.pincode)) {
    throw fail('failed-precondition', 'Enter your delivery pincode first.');
  }

  const db = deps.db || getFirestore();
  const [products, zone, promo] = await Promise.all([
    loadProducts(db, lines),
    findZone(db, data.pincode), // "We don't deliver to this pincode yet."
    loadPromoQuietly(db, data.promoCode, deps.onBadPromo),
  ]);

  const { items, pricing } = priceCart({ lines, products, zone, promo, tip });
  return {
    items,
    pricing,
    zone: { id: zone.id, name: zone.name ?? null, etaMin: zone.etaMin ?? null, etaMax: zone.etaMax ?? null },
    promo: promo ? { code: promo.code, type: promo.type, value: promo.value } : null,
  };
}

// loadPromo, but every way of being "not a usable code" gives the same answer.
async function loadPromoQuietly(db, rawCode, onBadPromo) {
  try {
    return await loadPromo(db, rawCode);
  } catch (err) {
    if (err instanceof HttpsError && err.code === 'failed-precondition') {
      await onBadPromo?.(); // a wrong, switched-off or expired code all count as a wrong guess
      throw fail('failed-precondition', 'That promo code is not valid.');
    }
    throw err;
  }
}

// Wrapped in rate limits (shared/rateLimit.js): a normal checkout is far under them, a script trying promo codes is not.
// Wrong codes are counted separately, and once a caller has used up their wrong guesses even a right code waits.
exports.previewCheckout = onCall(callableOptions(), async (request) => {
  if (request.auth) {
    const db = getFirestore();
    await enforce(db, request, 'previewCheckout');
    if (request.data?.promoCode) await assertNotBlocked(db, request, 'badPromo');
    return quoteCart(request, { db, onBadPromo: () => recordFailure(db, request, 'badPromo') });
  }
  return quoteCart(request); // signed out: refused inside quoteCart
});

// Exported for the tests.
exports.quoteCart = quoteCart;
