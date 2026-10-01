'use strict';

// createCheckout
// Turns the signed-in customer's saved cart into a priced quote and a Razorpay
// order. Everything that touches money is computed HERE, from data the server
// reads itself. The client sends only a delivery address; it never sends prices,
// totals, fees or a zone.
//
// Flow:
//   1. read the cart from Firestore (not from the request)
//   2. read live products, the delivery zone and the promo code
//   3. check stock, then price every line from the product doc
//   4. create the Razorpay order (amount in paise)
//   5. save a server-only `checkouts` doc; return what the payment sheet needs
//
// Stock is only CHECKED here, not reserved. It is decremented in one
// transaction when the payment is verified (a later step).

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const { defineSecret, defineString } = require('firebase-functions/params');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const Razorpay = require('razorpay');

// Test key id is a normal param; the key secret is a secret.
// Local: functions/.env.local and functions/.secret.local (both git-ignored).
const RAZORPAY_KEY_ID = defineString('RAZORPAY_KEY_ID');
const RAZORPAY_KEY_SECRET = defineSecret('RAZORPAY_KEY_SECRET');

const MAX_LINES = 30;
const MAX_QTY_PER_LINE = 20;
const MAX_ADDRESS_LENGTH = 200;
const ALLOWED_TIPS = [0, 10, 20, 30];
const SAFE_ID = /^[A-Za-z0-9_-]{1,100}$/; // blocks "/" so ids cannot escape a path
const PROMO_CODE = /^[A-Z0-9_-]{1,32}$/;
const PINCODE = /^[0-9]{6}$/;
const DEFAULT_SIZES = [{ id: 'regular', label: 'Regular', extra: 0 }];

// Short helper so errors read clearly. The message is shown to the customer.
const fail = (code, message, details) => new HttpsError(code, message, details);

// ---------- pure helpers (no database, easy to test) ----------

// Clean up the cart lines: check each one, and merge duplicates of the same
// box + size into one line.
function normaliseLines(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw fail('failed-precondition', 'Your cart is empty.');
  }
  if (items.length > MAX_LINES) {
    throw fail('invalid-argument', 'Your cart has too many items.');
  }

  const lines = new Map();
  for (const raw of items) {
    const productId = raw && raw.productId;
    const size = raw && raw.size !== undefined ? raw.size : 'regular';
    const qty = raw && raw.qty;

    const readable =
      typeof productId === 'string' && SAFE_ID.test(productId) &&
      typeof size === 'string' && SAFE_ID.test(size) &&
      Number.isInteger(qty) && qty >= 1;
    if (!readable) {
      throw fail('invalid-argument', 'An item in your cart could not be read. Please refresh and try again.');
    }

    const key = `${productId}|${size}`;
    const line = lines.get(key) || { productId, size, qty: 0 };
    line.qty += qty;
    if (line.qty > MAX_QTY_PER_LINE) {
      throw fail('invalid-argument', `You can order at most ${MAX_QTY_PER_LINE} of one box.`);
    }
    lines.set(key, line);
  }
  return [...lines.values()];
}

// Discount in whole rupees. Percent rounds down, flat never exceeds the subtotal.
function computeDiscount(promo, subtotal) {
  if (promo.min && subtotal < promo.min) {
    throw fail('failed-precondition', `Add ₹${promo.min - subtotal} more to use ${promo.code}.`);
  }
  if (promo.type === 'percent' && Number.isInteger(promo.value) && promo.value >= 1 && promo.value <= 100) {
    return Math.floor((subtotal * promo.value) / 100);
  }
  if (promo.type === 'flat' && Number.isInteger(promo.value) && promo.value >= 1) {
    return Math.min(promo.value, subtotal);
  }
  throw fail('failed-precondition', 'That promo code is not valid.');
}

// Check stock, then price every line using the PRODUCT doc's price.
// `products` is a Map of productId -> product data read by the server.
function priceCart({ lines, products, zone, promo, tip }) {
  // Stock is checked per product, adding up all sizes of the same box.
  const wanted = new Map();
  for (const l of lines) wanted.set(l.productId, (wanted.get(l.productId) || 0) + l.qty);

  for (const [productId, qty] of wanted) {
    const p = products.get(productId);
    if (!p || p.active !== true) {
      throw fail('failed-precondition', 'An item in your cart is no longer available.', { productId });
    }
    const stock = Number.isInteger(p.stock) ? p.stock : 0;
    if (stock <= 0) {
      throw fail('failed-precondition', `${p.name} is out of stock.`, { productId, available: 0 });
    }
    if (qty > stock) {
      throw fail('failed-precondition', `Only ${stock} left of ${p.name}.`, { productId, available: stock });
    }
  }

  const items = lines.map((l) => {
    const p = products.get(l.productId);
    const sizes = Array.isArray(p.sizes) && p.sizes.length > 0 ? p.sizes : DEFAULT_SIZES;
    const size = sizes.find((s) => s.id === l.size);
    if (!size) {
      throw fail('failed-precondition', `${p.name} is not available in that size.`, { productId: l.productId });
    }
    const extra = size.extra || 0;
    if (!Number.isInteger(p.price) || p.price < 0 || !Number.isInteger(extra)) {
      logger.error('Bad price data on product', { productId: l.productId });
      throw fail('internal', 'Something went wrong. Please try again.');
    }
    const unitPrice = p.price + extra;
    return {
      productId: l.productId,
      name: p.name,
      size: l.size,
      qty: l.qty,
      unitPrice,
      lineTotal: unitPrice * l.qty,
    };
  });

  const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
  const discount = promo ? computeDiscount(promo, subtotal) : 0;

  // Zone fee, unless the zone has a free-delivery threshold the subtotal meets
  // (the cart's progress bar also measures against the subtotal).
  if (!Number.isInteger(zone.fee) || zone.fee < 0) {
    logger.error('Bad fee on delivery zone', { zoneId: zone.id });
    throw fail('internal', 'Something went wrong. Please try again.');
  }
  const freeFrom = Number.isInteger(zone.freeDeliveryFrom) ? zone.freeDeliveryFrom : null;
  const deliveryFee = freeFrom !== null && subtotal >= freeFrom ? 0 : zone.fee;

  const total = subtotal - discount + deliveryFee + tip;

  // Razorpay wants paise (1 rupee = 100 paise), always a whole number.
  return {
    items,
    pricing: { subtotal, discount, deliveryFee, tip, total },
    amountPaise: total * 100,
  };
}

// ---------- database helpers ----------

// Find the first active zone (lowest priority number) whose pincode pattern matches.
async function findZone(db, pincode) {
  const snap = await db.collection('deliveryZones').where('active', '==', true).get();
  const zones = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));
  const zone = zones.find(
    (z) => z.match && typeof z.match.regex === 'string' && new RegExp(z.match.regex).test(pincode),
  );
  if (!zone) throw fail('failed-precondition', "We don't deliver to this pincode yet.");
  return zone;
}

// Look up a promo code. Returns null when the customer did not use one.
async function loadPromo(db, rawCode) {
  if (rawCode === null || rawCode === undefined || rawCode === '') return null;
  const code = String(rawCode).trim().toUpperCase();
  if (!PROMO_CODE.test(code)) throw fail('failed-precondition', 'That promo code is not valid.');

  const snap = await db.doc(`promoCodes/${code}`).get();
  if (!snap.exists || snap.get('active') !== true) {
    throw fail('failed-precondition', 'That promo code is not valid.');
  }
  const expiresAt = snap.get('expiresAt');
  if (expiresAt && expiresAt.toMillis() < Date.now()) {
    throw fail('failed-precondition', 'That promo code has expired.');
  }
  return { code, ...snap.data() };
}

// Read the live product docs for every box in the cart.
async function loadProducts(db, lines) {
  const ids = [...new Set(lines.map((l) => l.productId))];
  const snaps = await db.getAll(...ids.map((id) => db.doc(`products/${id}`)));
  const products = new Map();
  for (const s of snaps) if (s.exists) products.set(s.id, s.data());
  return products;
}

function readAddress(data) {
  const address = data && typeof data.address === 'string' ? data.address.trim() : '';
  if (!address || address.length > MAX_ADDRESS_LENGTH) {
    throw fail('invalid-argument', `Enter a delivery address (up to ${MAX_ADDRESS_LENGTH} characters).`);
  }
  return address;
}

// ---------- the callable function ----------

exports.createCheckout = onCall(
  // Mumbai is the closest region to Bengaluru. The client must call the same region.
  { region: 'asia-south1', secrets: [RAZORPAY_KEY_SECRET] },
  async (request) => {
    // Only signed-in customers can check out. We trust request.auth, nothing else.
    if (!request.auth) throw fail('unauthenticated', 'Please sign in to check out.');
    const uid = request.auth.uid;
    const address = readAddress(request.data);
    const db = getFirestore();

    // Safety guard: refuse to run with anything but a Razorpay TEST key.
    const keyId = RAZORPAY_KEY_ID.value();
    if (!keyId.startsWith('rzp_test_')) {
      logger.error('RAZORPAY_KEY_ID is not a test key; refusing to create an order.');
      throw fail('internal', 'Payments are not available right now.');
    }

    // 1. Read the cart from the database. The client cannot send its own.
    const cartSnap = await db.doc(`carts/${uid}`).get();
    const cart = cartSnap.exists ? cartSnap.data() : null;
    const lines = normaliseLines(cart && cart.items);

    // The cart holds the customer's choices. We re-check every one of them.
    const tip = cart.tip === undefined || cart.tip === null ? 0 : cart.tip;
    if (!ALLOWED_TIPS.includes(tip)) throw fail('invalid-argument', 'That tip amount is not available.');
    const pincode = cart.pincode;
    if (typeof pincode !== 'string' || !PINCODE.test(pincode)) {
      throw fail('failed-precondition', 'Enter your delivery pincode first.');
    }
    const note = typeof cart.note === 'string' ? cart.note.slice(0, 200) : '';

    // 2. Read live data: products (with stock), zone for the pincode, promo.
    const [products, zone, promo] = await Promise.all([
      loadProducts(db, lines),
      findZone(db, pincode),
      loadPromo(db, cart.promoCode),
    ]);

    // 3. Check stock and calculate the total from BACKEND prices.
    const { items, pricing, amountPaise } = priceCart({ lines, products, zone, promo, tip });

    // 4. Create the Razorpay order. The checkout id doubles as the receipt.
    const checkoutRef = db.collection('checkouts').doc();
    const checkoutId = checkoutRef.id;
    let razorpayOrder;
    try {
      const razorpay = new Razorpay({ key_id: keyId, key_secret: RAZORPAY_KEY_SECRET.value() });
      razorpayOrder = await razorpay.orders.create({
        amount: amountPaise,
        currency: 'INR',
        receipt: checkoutId,
        notes: { uid, checkoutId },
      });
    } catch (err) {
      logger.error('Razorpay order creation failed', {
        checkoutId,
        detail: (err && err.error && err.error.description) || (err && err.message),
      });
      throw fail('unavailable', 'We could not start the payment. Please try again.');
    }

    // 5. Save the quote. Clients cannot read or write `checkouts`; the payment
    // verification step reads this doc to create the real order.
    await checkoutRef.create({
      uid,
      status: 'CREATED',
      items,
      pricing,
      promo: promo ? { code: promo.code, type: promo.type, value: promo.value } : null,
      zone: {
        id: zone.id,
        name: zone.name ?? null,
        fee: pricing.deliveryFee, // the fee actually charged
        etaMin: zone.etaMin ?? null,
        etaMax: zone.etaMax ?? null,
      },
      pincode,
      address,
      note,
      payment: {
        razorpayOrderId: razorpayOrder.id,
        amountPaise,
        currency: 'INR',
      },
      createdAt: FieldValue.serverTimestamp(),
    });

    // The client needs these to open the Razorpay payment sheet. The key id is
    // public by design; the key secret never leaves the server.
    return {
      checkoutId,
      razorpayOrderId: razorpayOrder.id,
      keyId,
      amountPaise,
      currency: 'INR',
      pricing,
      items,
    };
  },
);

// Exported only so the pricing rules can be unit tested without Firebase.
exports.normaliseLines = normaliseLines;
exports.priceCart = priceCart;
