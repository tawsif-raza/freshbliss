'use strict';

// Tests for payment confirmation and the Razorpay webhook, run against the REAL
// Firestore emulator:   npm run test:payments
//
// What they prove: stock is decremented exactly once, one order per checkout,
// bad signatures are rejected, and the browser callback and the webhook can
// arrive at the same instant without double-counting.

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { createRequire } = require('node:module');

// Load the SAME firebase-admin copy the functions use. Two copies cannot share
// FieldValue sentinels, so tests must not use a second one.
const fromFunctions = createRequire(path.join(__dirname, '..', 'functions', 'package.json'));
const { initializeApp } = fromFunctions('firebase-admin/app');
const { getFirestore, FieldValue } = fromFunctions('firebase-admin/firestore');
const { finalizeCheckout, confirmPayment, hmacMatches } = require('../functions/shared/payments');
const { handleWebhook } = require('../functions/razorpayWebhook');

const WEBHOOK_SECRET = 'whsec_test_secret';
const SIZES = [{ id: 'regular', label: 'Regular', extra: 0 }, { id: 'large', label: 'Large', extra: 50 }];

let db;
before(() => {
  process.env.GCLOUD_PROJECT = 'demo-freshbliss';
  initializeApp({ projectId: 'demo-freshbliss' });
  db = getFirestore();
});

// Every test uses fresh ids, so tests never touch each other's data.
let n = 0;
let ids;
beforeEach(() => {
  n += 1;
  const t = `${Date.now()}-${n}`;
  ids = (name) => `t${t}-${name}`;
});

// ---------- helpers ----------

const product = (id, stock) => db.doc(`products/${id}`).set({ name: id, price: 149, stock, active: true, sizes: SIZES });
const stockOf = async (id) => (await db.doc(`products/${id}`).get()).get('stock');
// Razorpay ids are letters, digits and underscores only (no hyphens), so tests must use the same shape.
const rz = (name) => ids(name).replace(/-/g, "");
const exists = async (p) => (await db.doc(p).get()).exists;

const checkout = (uid, productId, qty, razorpayOrderId, over = {}) => ({
  uid,
  status: 'CREATED',
  items: [{ productId, name: productId, size: 'regular', qty, unitPrice: 149, lineTotal: 149 * qty }],
  pricing: { subtotal: 149 * qty, discount: 0, deliveryFee: 30, tip: 0, total: 149 * qty + 30 },
  promo: null,
  zone: { id: 'B', name: 'Zone B', fee: 30, etaMin: 45, etaMax: 60 },
  pincode: '560100',
  address: '12 MG Road',
  note: '',
  payment: { razorpayOrderId, amountPaise: (149 * qty + 30) * 100, currency: 'INR' },
  createdAt: FieldValue.serverTimestamp(),
  ...over,
});

// Build a signed webhook request the way Razorpay would send it.
function webhookRequest({ event = 'order.paid', razorpayOrderId, paymentId, amount, eventId = 'evt_default', secret = WEBHOOK_SECRET }) {
  const payment = { entity: { id: paymentId, order_id: razorpayOrderId, amount, currency: 'INR', status: event === 'order.paid' ? 'captured' : 'authorized' } };
  const payload = event === 'order.paid'
    ? { order: { entity: { id: razorpayOrderId, amount, amount_paid: amount, status: 'paid' } }, payment }
    : { payment };
  const rawBody = Buffer.from(JSON.stringify({ entity: 'event', event, payload }));
  const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return { rawBody, signature, eventId, secret: WEBHOOK_SECRET };
}

// ============================================================
describe('hmacMatches', () => {
  const sig = crypto.createHmac('sha256', 's3cret').update('order_1|pay_1').digest('hex');
  it('accepts the right signature and rejects every wrong one', () => {
    assert.equal(hmacMatches('s3cret', 'order_1|pay_1', sig), true);
    assert.equal(hmacMatches('s3cret', 'order_1|pay_2', sig), false);
    assert.equal(hmacMatches('other', 'order_1|pay_1', sig), false);
    for (const bad of ['', 'abc', 'z'.repeat(64), sig.slice(0, 63), `${sig}0`, undefined, null]) {
      assert.equal(hmacMatches('s3cret', 'order_1|pay_1', bad), false);
    }
  });
  it('works on raw bytes as well as strings', () => {
    const body = Buffer.from('{"a":1}');
    const s = crypto.createHmac('sha256', 'k').update(body).digest('hex');
    assert.equal(hmacMatches('k', body, s), true);
  });
});

// ============================================================
describe('finalizeCheckout (shared by verifyPayment and the webhook)', () => {
  it('confirms a paid order: decrements stock, marks the checkout PAID, creates the order, clears the cart', async () => {
    await product(ids('p'), 3);
    await db.doc(`checkouts/${ids('c')}`).set(checkout('alice', ids('p'), 2, 'order_1'));
    await db.doc('carts/alice').set({ items: [{ productId: ids('p'), size: 'regular', qty: 2 }] });

    const r = await finalizeCheckout(db, { checkoutId: ids('c'), razorpayPaymentId: 'pay_1', uid: 'alice' });
    assert.deepEqual([r.status, r.paymentStatus, r.replay], ['PAYMENT_CONFIRMED', 'PAID', false]);
    assert.equal(await stockOf(ids('p')), 1);

    const order = (await db.doc(`orders/${ids('c')}`).get()).data();
    assert.equal(order.status, 'PAYMENT_CONFIRMED');
    assert.equal(order.uid, 'alice');
    assert.equal(order.pricing.total, 328);
    assert.equal(order.payment.razorpayPaymentId, 'pay_1');
    assert.equal(order.payment.razorpayOrderId, 'order_1');
    assert.equal(order.etaMinutes, 60);
    assert.ok(order.timestamps.PAYMENT_CONFIRMED);

    const co = (await db.doc(`checkouts/${ids('c')}`).get()).data();
    assert.equal(co.status, 'PAID');
    assert.equal(co.payment.razorpayOrderId, 'order_1', 'sibling payment fields survive the update');
    assert.equal(await exists('carts/alice'), false, 'cart cleared');
  });

  it('is idempotent: repeat and simultaneous calls change nothing after the first', async () => {
    await product(ids('p'), 3);
    await db.doc(`checkouts/${ids('c')}`).set(checkout('alice', ids('p'), 2, 'order_1'));
    const call = () => finalizeCheckout(db, { checkoutId: ids('c'), razorpayPaymentId: 'pay_1', uid: 'alice' });
    const results = await Promise.all([call(), call(), call()]);
    assert.equal(results.filter((r) => !r.replay).length, 1, 'exactly one call did the work');
    assert.equal(await stockOf(ids('p')), 1, 'stock decremented once');
    assert.equal((await call()).replay, true);
    assert.equal(await stockOf(ids('p')), 1);
  });

  it("refuses someone else's checkout and a checkout that does not exist", async () => {
    await product(ids('p'), 3);
    await db.doc(`checkouts/${ids('c')}`).set(checkout('alice', ids('p'), 1, 'order_1'));
    await assert.rejects(() => finalizeCheckout(db, { checkoutId: ids('c'), razorpayPaymentId: 'pay_1', uid: 'mallory' }), /could not find/);
    await assert.rejects(() => finalizeCheckout(db, { checkoutId: 'nope', razorpayPaymentId: 'pay_1', uid: 'alice' }), /could not find/);
    assert.equal(await stockOf(ids('p')), 3);
  });

  it('refuses a checkout that is no longer payable', async () => {
    await product(ids('p'), 3);
    await db.doc(`checkouts/${ids('c')}`).set(checkout('alice', ids('p'), 1, 'order_1', { status: 'EXPIRED' }));
    await assert.rejects(() => finalizeCheckout(db, { checkoutId: ids('c'), razorpayPaymentId: 'pay_1', uid: 'alice' }), /no longer be paid/);
  });

  it('adds up every size of one box against its stock', async () => {
    await product(ids('p'), 3);
    await db.doc(`checkouts/${ids('c')}`).set(checkout('alice', ids('p'), 2, 'order_1', {
      items: [
        { productId: ids('p'), name: 'x', size: 'regular', qty: 2, unitPrice: 149, lineTotal: 298 },
        { productId: ids('p'), name: 'x', size: 'large', qty: 1, unitPrice: 199, lineTotal: 199 },
      ],
    }));
    const r = await finalizeCheckout(db, { checkoutId: ids('c'), razorpayPaymentId: 'pay_1', uid: 'alice' });
    assert.equal(r.status, 'PAYMENT_CONFIRMED');
    assert.equal(await stockOf(ids('p')), 0);
  });

  it('cancels with REFUND_PENDING when stock ran out, leaves stock alone and keeps the cart', async () => {
    await product(ids('p'), 1);
    await db.doc(`checkouts/${ids('c')}`).set(checkout('alice', ids('p'), 2, 'order_1'));
    await db.doc('carts/alice').set({ items: [{ productId: ids('p'), size: 'regular', qty: 2 }] });

    const r = await finalizeCheckout(db, { checkoutId: ids('c'), razorpayPaymentId: 'pay_1', uid: 'alice' });
    assert.deepEqual([r.status, r.paymentStatus], ['CANCELLED', 'REFUND_PENDING']);
    assert.equal(await stockOf(ids('p')), 1);
    const order = (await db.doc(`orders/${ids('c')}`).get()).data();
    assert.equal(order.cancelledBy, 'system');
    assert.match(order.cancelReason, /sold out/);
    assert.equal((await db.doc(`checkouts/${ids('c')}`).get()).get('status'), 'PAID');
    assert.equal(await exists('carts/alice'), true, 'cart kept after an out-of-stock cancel');
  });

  it('is all-or-nothing: one short line cancels the whole order and decrements nothing', async () => {
    await product(ids('a'), 5);
    await product(ids('b'), 1);
    await db.doc(`checkouts/${ids('c')}`).set(checkout('alice', ids('a'), 1, 'order_1', {
      items: [
        { productId: ids('a'), name: 'a', size: 'regular', qty: 1, unitPrice: 149, lineTotal: 149 },
        { productId: ids('b'), name: 'b', size: 'regular', qty: 2, unitPrice: 149, lineTotal: 298 },
      ],
    }));
    const r = await finalizeCheckout(db, { checkoutId: ids('c'), razorpayPaymentId: 'pay_1', uid: 'alice' });
    assert.equal(r.status, 'CANCELLED');
    assert.equal(await stockOf(ids('a')), 5);
    assert.equal(await stockOf(ids('b')), 1);
  });

  it('treats an inactive product as out of stock', async () => {
    await db.doc(`products/${ids('p')}`).set({ name: 'x', price: 149, stock: 9, active: false, sizes: SIZES });
    await db.doc(`checkouts/${ids('c')}`).set(checkout('alice', ids('p'), 1, 'order_1'));
    assert.equal((await finalizeCheckout(db, { checkoutId: ids('c'), razorpayPaymentId: 'pay_1', uid: 'alice' })).status, 'CANCELLED');
  });

  it('never oversells: 8 buyers racing for 3 boxes gives 3 orders, 5 cancellations, stock 0', async () => {
    await product(ids('p'), 3);
    const buyers = Array.from({ length: 8 }, (_, i) => i);
    for (const i of buyers) await db.doc(`checkouts/${ids('c' + i)}`).set(checkout(`u${i}`, ids('p'), 1, `order_${i}`));
    const results = await Promise.all(buyers.map((i) => finalizeCheckout(db, { checkoutId: ids('c' + i), razorpayPaymentId: `pay_${i}`, uid: `u${i}` })));
    assert.equal(results.filter((r) => r.status === 'PAYMENT_CONFIRMED').length, 3);
    assert.equal(results.filter((r) => r.status === 'CANCELLED').length, 5);
    assert.equal(await stockOf(ids('p')), 0, 'stock exactly 0, never negative');
  });
});

// ============================================================
describe('razorpayWebhook handler', () => {
  async function setup(stock = 3, qty = 2) {
    await product(ids('p'), stock);
    await db.doc(`checkouts/${ids('c')}`).set(checkout('alice', ids('p'), qty, rz('order')));
    await db.doc('carts/alice').set({ items: [{ productId: ids('p'), size: 'regular', qty }] });
    return { amount: (149 * qty + 30) * 100 };
  }
  const req = (over) => webhookRequest({ razorpayOrderId: rz('order'), paymentId: 'pay_1', eventId: ids('evt'), ...over });

  it('rejects a bad signature, a missing signature and the wrong secret, and changes nothing', async () => {
    const { amount } = await setup();
    const good = req({ amount });
    for (const bad of [
      { ...good, signature: 'a'.repeat(64) },
      { ...good, signature: undefined },
      { ...good, signature: '' },
      { ...good, rawBody: Buffer.from(good.rawBody.toString().replace('pay_1', 'pay_9')) }, // tampered body
      req({ amount, secret: 'wrong-secret' }),
      { ...good, rawBody: undefined },
    ]) {
      assert.equal((await handleWebhook(db, bad)).status, 400);
    }
    assert.equal(await stockOf(ids('p')), 3);
    assert.equal(await exists(`orders/${ids('c')}`), false);
  });

  it('order.paid creates the order, decrements stock and clears the cart', async () => {
    const { amount } = await setup();
    const out = await handleWebhook(db, req({ amount }));
    assert.deepEqual([out.status, out.body], [200, 'Processed']);
    assert.equal(await stockOf(ids('p')), 1);
    const order = (await db.doc(`orders/${ids('c')}`).get()).data();
    assert.equal(order.status, 'PAYMENT_CONFIRMED');
    assert.equal(order.payment.razorpayPaymentId, 'pay_1');
    assert.equal(await exists('carts/alice'), false);
    assert.equal((await db.doc(`paymentEvents/${ids('evt')}`).get()).get('outcome'), 'PAYMENT_CONFIRMED');
  });

  it('payment.authorized is handled the same way', async () => {
    const { amount } = await setup();
    const out = await handleWebhook(db, req({ amount, event: 'payment.authorized' }));
    assert.deepEqual([out.status, out.body], [200, 'Processed']);
    assert.equal(await stockOf(ids('p')), 1);
  });

  it('a repeated delivery of the same event is answered from the ledger and changes nothing', async () => {
    const { amount } = await setup();
    await handleWebhook(db, req({ amount }));
    const again = await handleWebhook(db, req({ amount }));
    assert.deepEqual([again.status, again.body], [200, 'Duplicate']);
    assert.equal(await stockOf(ids('p')), 1);
  });

  it('two DIFFERENT events for the same payment (authorized then paid) still decrement once', async () => {
    const { amount } = await setup();
    await handleWebhook(db, req({ amount, event: 'payment.authorized', eventId: ids('e1') }));
    const second = await handleWebhook(db, req({ amount, event: 'order.paid', eventId: ids('e2') }));
    assert.equal(second.body, 'Already processed');
    assert.equal(await stockOf(ids('p')), 1);
  });

  it('ignores events it does not act on (for example payment.failed) with a 200', async () => {
    const { amount } = await setup();
    const out = await handleWebhook(db, req({ amount, event: 'payment.failed' }));
    assert.deepEqual([out.status, out.body], [200, 'Ignored']);
    assert.equal(await stockOf(ids('p')), 3);
    assert.equal(await exists(`orders/${ids('c')}`), false);
  });

  it('acknowledges an order it does not know, so Razorpay stops retrying', async () => {
    const { amount } = await setup();
    const out = await handleWebhook(db, req({ amount, razorpayOrderId: 'order_not_ours' }));
    assert.deepEqual([out.status, out.body], [200, 'Unknown order']);
    assert.equal(await exists(`orders/${ids('c')}`), false);
  });

  it('refuses to confirm when the paid amount does not match, and flags it', async () => {
    await setup();
    const out = await handleWebhook(db, req({ amount: 100 })); // far too small
    assert.deepEqual([out.status, out.body], [200, 'Amount mismatch']);
    assert.equal(await stockOf(ids('p')), 3);
    assert.equal(await exists(`orders/${ids('c')}`), false);
    assert.equal((await db.doc(`paymentEvents/${ids('evt')}`).get()).get('outcome'), 'AMOUNT_MISMATCH');
  });

  it('cancels with REFUND_PENDING through the webhook when stock ran out, keeping the cart', async () => {
    const { amount } = await setup(1, 2);
    const out = await handleWebhook(db, req({ amount }));
    assert.equal(out.status, 200);
    const order = (await db.doc(`orders/${ids('c')}`).get()).data();
    assert.deepEqual([order.status, order.paymentStatus], ['CANCELLED', 'REFUND_PENDING']);
    assert.equal(await stockOf(ids('p')), 1);
    assert.equal(await exists('carts/alice'), true);
  });

  it('RACE: the browser callback and the webhook at the same instant produce one order and one decrement', async () => {
    await setup();
    // Fire both together, many times over, across fresh checkouts, to shake out ordering luck.
    for (let round = 0; round < 5; round++) {
      const cid = ids(`race${round}`);
      const orderId = rz(`rorder${round}`);
      await db.doc(`checkouts/${cid}`).set(checkout('alice', ids('p'), 1, orderId));
      await db.doc(`products/${ids('p')}`).update({ stock: 3 });
      const hook = webhookRequest({ razorpayOrderId: orderId, paymentId: `pay_r${round}`, amount: (149 + 30) * 100, eventId: ids(`re${round}`) });
      const [fromBrowser, fromWebhook] = await Promise.all([
        finalizeCheckout(db, { checkoutId: cid, razorpayPaymentId: `pay_r${round}`, uid: 'alice' }),
        handleWebhook(db, hook),
      ]);
      assert.equal(fromWebhook.status, 200);
      assert.equal(fromBrowser.status, 'PAYMENT_CONFIRMED');
      assert.equal(await stockOf(ids('p')), 2, `round ${round}: stock went 3 -> 2, exactly once`);
      assert.equal(await exists(`orders/${cid}`), true);
    }
  });

  it('RACE: two webhook deliveries of the same event at the same instant also decrement once', async () => {
    const { amount } = await setup();
    const hook = req({ amount });
    const out = await Promise.all([handleWebhook(db, hook), handleWebhook(db, hook), handleWebhook(db, hook)]);
    assert.ok(out.every((o) => o.status === 200));
    assert.equal(await stockOf(ids('p')), 1);
  });
});

void confirmPayment; // exported for completeness; finalizeCheckout wraps it
