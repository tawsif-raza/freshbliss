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
const { loadPromo } = require('../functions/createCheckout');

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
function webhookRequest({ event = 'order.paid', razorpayOrderId, paymentId, amount, eventId = 'evt_default', secret = WEBHOOK_SECRET, captured, refund }) {
  const payment = { entity: { id: paymentId, order_id: razorpayOrderId, amount, currency: 'INR', status: event === 'order.paid' ? 'captured' : 'authorized' } };
  if (captured !== undefined) payment.entity.captured = captured;
  let payload;
  if (event.startsWith('refund.')) payload = { refund: { entity: refund }, payment };
  else if (event === 'order.paid') payload = { order: { entity: { id: razorpayOrderId, amount, amount_paid: amount, status: 'paid' } }, payment };
  else payload = { payment };
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
  it('copies the chosen delivery slot onto the order (and null when there is none)', async () => {
    await product(ids('p'), 5);
    const slot = { date: '2026-10-05', id: '1900-2100', label: '7 pm to 9 pm', startsAt: '2026-10-05T13:30:00.000Z' };
    await db.doc(`checkouts/${ids('c')}`).set(checkout('alice', ids('p'), 1, 'order_slot', { slot }));
    await finalizeCheckout(db, { checkoutId: ids('c'), razorpayPaymentId: 'pay_slot', uid: 'alice' });
    assert.deepEqual((await db.doc(`orders/${ids('c')}`).get()).get('slot'), slot);

    await db.doc(`checkouts/${ids('d')}`).set(checkout('alice', ids('p'), 1, 'order_noslot'));
    await finalizeCheckout(db, { checkoutId: ids('d'), razorpayPaymentId: 'pay_noslot', uid: 'alice' });
    assert.equal((await db.doc(`orders/${ids('d')}`).get()).get('slot'), null);
  });

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

  it('payment.authorized does NOT create an order: only a captured payment (order.paid) does', async () => {
    const { amount } = await setup();
    const out = await handleWebhook(db, req({ amount, event: 'payment.authorized' }));
    assert.deepEqual([out.status, out.body], [200, 'Ignored']);
    assert.equal(await stockOf(ids('p')), 3);
    assert.equal(await exists(`orders/${ids('c')}`), false);
  });

  it('refuses an order.paid whose payment says captured:false (manual capture, money not taken)', async () => {
    const { amount } = await setup();
    const out = await handleWebhook(db, req({ amount, captured: false }));
    assert.deepEqual([out.status, out.body], [200, 'Not captured']);
    assert.equal(await stockOf(ids('p')), 3);
    assert.equal(await exists(`orders/${ids('c')}`), false);
    assert.equal((await db.doc(`paymentEvents/${ids('evt')}`).get()).get('outcome'), 'NOT_CAPTURED');
  });

  it('accepts an order.paid whose payment says captured:true', async () => {
    const { amount } = await setup();
    assert.equal((await handleWebhook(db, req({ amount, captured: true }))).body, 'Processed');
  });

  it('a repeated delivery of the same event is answered from the ledger and changes nothing', async () => {
    const { amount } = await setup();
    await handleWebhook(db, req({ amount }));
    const again = await handleWebhook(db, req({ amount }));
    assert.deepEqual([again.status, again.body], [200, 'Duplicate']);
    assert.equal(await stockOf(ids('p')), 1);
  });

  it('two DIFFERENT order.paid events for the same payment (a re-sent event gets a new id) still decrement once', async () => {
    const { amount } = await setup();
    await handleWebhook(db, req({ amount, eventId: ids('e1') }));
    const second = await handleWebhook(db, req({ amount, eventId: ids('e2') }));
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

// ============================================================
describe('razorpayWebhook: refund events', () => {
  const PAY = 'pay_refundtest';
  const TOTAL = 34800;
  let orderId;
  beforeEach(async () => {
    orderId = ids('o');
    await db.doc(`orders/${orderId}`).set({
      uid: 'alice',
      status: 'CANCELLED',
      paymentStatus: 'REFUND_PENDING',
      payment: { razorpayOrderId: 'order_x', razorpayPaymentId: `${PAY}${n}`, amountPaise: TOTAL },
    });
  });
  const refundEvent = (event, over = {}) =>
    webhookRequest({
      event,
      paymentId: `${PAY}${n}`,
      eventId: ids(`evt-${event.replace('.', '-')}`), // event ids may not contain dots
      refund: { id: `rfnd_${rz('r')}`, payment_id: `${PAY}${n}`, amount: TOTAL, status: event === 'refund.processed' ? 'processed' : event === 'refund.failed' ? 'failed' : 'pending', ...over },
    });
  const order = async () => (await db.doc(`orders/${orderId}`).get()).data();

  it('refund.processed (a refund made in the Razorpay dashboard) marks the order REFUNDED and keeps the refund id', async () => {
    const out = await handleWebhook(db, refundEvent('refund.processed'));
    assert.deepEqual([out.status, out.body], [200, 'Refund recorded']);
    const o = await order();
    assert.equal(o.paymentStatus, 'REFUNDED');
    assert.equal(o.refundedPaise, TOTAL);
    assert.deepEqual(o.refundIds, [`rfnd_${rz('r')}`]);
    const doc = (await db.doc(`refunds/rp_rfnd_${rz('r')}`).get()).data();
    assert.deepEqual([doc.status, doc.kind, doc.amountPaise], ['PROCESSED', 'dashboard', TOTAL]);
  });

  it('refund.created then refund.processed: pending first, REFUNDED after, counted once', async () => {
    await handleWebhook(db, refundEvent('refund.created'));
    let o = await order();
    assert.deepEqual([o.paymentStatus, o.refundPendingPaise, o.refundedPaise ?? 0], ['REFUND_PENDING', TOTAL, 0]);
    await handleWebhook(db, refundEvent('refund.processed'));
    await handleWebhook(db, { ...refundEvent('refund.processed'), eventId: ids('again') }); // re-sent under a new event id
    o = await order();
    assert.deepEqual([o.paymentStatus, o.refundPendingPaise, o.refundedPaise], ['REFUNDED', 0, TOTAL]);
  });

  it('refund.failed keeps the order in the refund queue and records why', async () => {
    await handleWebhook(db, refundEvent('refund.failed', { failure_reason: 'Bank account closed' }));
    const o = await order();
    assert.equal(o.paymentStatus, 'REFUND_PENDING');
    assert.equal(o.refundError, 'Bank account closed');
  });

  it('a partial refund on a cancelled order leaves it pending; on a delivered order it is PARTIALLY_REFUNDED', async () => {
    await handleWebhook(db, refundEvent('refund.processed', { amount: 10000 }));
    assert.deepEqual(((o) => [o.paymentStatus, o.refundedPaise])(await order()), ['REFUND_PENDING', 10000]);

    await db.doc(`orders/${orderId}`).update({ status: 'DELIVERED', paymentStatus: 'PAID', refundedPaise: 0 });
    await handleWebhook(db, { ...refundEvent('refund.processed', { id: `rfnd_${rz('r2')}`, amount: 5000 }), eventId: ids('evt-second') });
    assert.deepEqual(((o) => [o.paymentStatus, o.refundedPaise])(await order()), ['PARTIALLY_REFUNDED', 5000]);
  });

  it('flags a full refund of an order that is still being fulfilled', async () => {
    await db.doc(`orders/${orderId}`).update({ status: 'PREPARING', paymentStatus: 'PAID' });
    await handleWebhook(db, refundEvent('refund.processed'));
    const o = await order();
    assert.equal(o.paymentStatus, 'REFUNDED');
    assert.match(o.refundAlert, /not cancelled/);
  });

  it('answers 200 and records an unknown payment instead of failing', async () => {
    const out = await handleWebhook(db, refundEvent('refund.processed', { payment_id: 'pay_nobody' }));
    assert.deepEqual([out.status, out.body], [200, 'Unknown payment']);
  });

  it('rejects a bad signature, and a repeated event id is a no-op', async () => {
    const good = refundEvent('refund.processed');
    assert.equal((await handleWebhook(db, { ...good, signature: 'a'.repeat(64) })).status, 400);
    assert.equal((await order()).paymentStatus, 'REFUND_PENDING');
    assert.equal((await handleWebhook(db, good)).body, 'Refund recorded');
    assert.equal((await handleWebhook(db, good)).body, 'Duplicate');
  });
});

// ============================================================
describe('promo usage limits: enforced and counted when the order is confirmed', () => {
  let code; // a fresh promo code per test (codes are uppercase letters, digits, - and _)
  beforeEach(() => {
    code = `LIM${Date.now()}X${n}`.toUpperCase();
  });

  const promoRef = () => db.doc(`promoCodes/${code}`);
  const usesRef = (uid) => db.doc(`promoCodes/${code}/uses/${uid}`);
  const makePromo = (limits = {}) => promoRef().set({ type: 'percent', value: 10, min: 0, active: true, expiresAt: null, usedCount: 0, ...limits });
  const usedCount = async () => (await promoRef().get()).get('usedCount');
  const userCount = async (uid) => (await usesRef(uid).get()).get('count') ?? 0;
  const orderOf = async (checkoutName) => (await db.doc(`orders/${ids(checkoutName)}`).get()).data();

  // A checkout for `uid` using the code. Each buyer has their own checkout id, product stock is plentiful.
  async function buyer(uid, name, { qty = 1 } = {}) {
    await db.doc(`checkouts/${ids(name)}`).set(checkout(uid, ids('p'), qty, `order_${name}`, { promo: { code, type: 'percent', value: 10 } }));
    return name;
  }
  const pay = (uid, name) => finalizeCheckout(db, { checkoutId: ids(name), razorpayPaymentId: `pay_${name}`, uid });
  const settle = (results) => ({
    confirmed: results.filter((r) => r.status === 'PAYMENT_CONFIRMED').length,
    cancelled: results.filter((r) => r.status === 'CANCELLED').length,
  });

  beforeEach(async () => {
    await product(ids('p'), 100);
  });

  it('counts one use for the code and one for the customer, and records which order used it', async () => {
    await makePromo({ globalMaxUses: 5, maxUsesPerUser: 2 });
    await buyer('alice', 'a');
    assert.equal((await pay('alice', 'a')).status, 'PAYMENT_CONFIRMED');
    assert.equal(await usedCount(), 1);
    const use = (await usesRef('alice').get()).data();
    assert.deepEqual([use.uid, use.code, use.count, use.orderIds], ['alice', code, 1, [ids('a')]]);
    assert.ok(use.lastUsedAt);
  });

  it('counts a code with no limits too (so a limit added later starts from the truth), and never blocks it', async () => {
    await makePromo();
    for (const [i, uid] of ['a1', 'a2', 'a3'].entries()) {
      await buyer(uid, `n${i}`);
      assert.equal((await pay(uid, `n${i}`)).status, 'PAYMENT_CONFIRMED');
    }
    assert.equal(await usedCount(), 3);
  });

  it('counts a use ONCE even when the browser callback and the webhook confirm the same payment at the same instant', async () => {
    await makePromo({ globalMaxUses: 5, maxUsesPerUser: 1 });
    await buyer('alice', 'a');
    const results = await Promise.all([pay('alice', 'a'), pay('alice', 'a'), pay('alice', 'a')]);
    assert.equal(results.filter((r) => !r.replay).length, 1);
    assert.equal(await usedCount(), 1);
    assert.equal(await userCount('alice'), 1);
    assert.equal((await orderOf('a')).status, 'PAYMENT_CONFIRMED', 'the replays did not cancel the order');
  });

  it('never goes over the total limit: 8 customers racing for 3 uses give 3 orders and 5 refunds', async () => {
    await makePromo({ globalMaxUses: 3 });
    const names = Array.from({ length: 8 }, (_, i) => `r${i}`);
    for (const nm of names) await buyer(`user-${nm}`, nm);
    const results = await Promise.all(names.map((nm) => pay(`user-${nm}`, nm)));
    assert.deepEqual(settle(results), { confirmed: 3, cancelled: 5 });
    assert.equal(await usedCount(), 3, 'exactly the limit, never more');
    assert.equal(await stockOf(ids('p')), 97, 'stock was taken for the 3 real orders only');
  });

  it('a customer who pays twice with a one-use code (double click) gets one order and one refund', async () => {
    await makePromo({ maxUsesPerUser: 1 });
    await buyer('alice', 'first');
    await buyer('alice', 'second'); // a second checkout made by the second click
    const results = await Promise.all([pay('alice', 'first'), pay('alice', 'second')]);
    assert.deepEqual(settle(results), { confirmed: 1, cancelled: 1 });
    assert.equal(await userCount('alice'), 1);
    assert.equal(await usedCount(), 1);
    assert.equal(await stockOf(ids('p')), 99);
  });

  it('allows exactly maxUsesPerUser uses, and refuses the next one', async () => {
    await makePromo({ maxUsesPerUser: 2 });
    for (const nm of ['u1', 'u2', 'u3']) await buyer('alice', nm);
    assert.equal((await pay('alice', 'u1')).status, 'PAYMENT_CONFIRMED');
    assert.equal((await pay('alice', 'u2')).status, 'PAYMENT_CONFIRMED');
    assert.equal((await pay('alice', 'u3')).status, 'CANCELLED');
    assert.equal(await userCount('alice'), 2);
  });

  it('counts each customer separately: three different customers can each use a one-use code', async () => {
    await makePromo({ maxUsesPerUser: 1 });
    for (const uid of ['p1', 'p2', 'p3']) await buyer(uid, uid);
    const results = await Promise.all(['p1', 'p2', 'p3'].map((uid) => pay(uid, uid)));
    assert.deepEqual(settle(results), { confirmed: 3, cancelled: 0 });
    assert.equal(await usedCount(), 3);
  });

  it('the refused order is a clean cancellation: refund pending, reason says why, no stock taken, no use counted, cart kept', async () => {
    await makePromo({ globalMaxUses: 1 });
    await buyer('alice', 'win');
    await buyer('bob', 'lose');
    await db.doc('carts/bob').set({ items: [{ productId: ids('p'), size: 'regular', qty: 1 }] });
    await pay('alice', 'win');
    const r = await pay('bob', 'lose');

    assert.deepEqual([r.status, r.paymentStatus], ['CANCELLED', 'REFUND_PENDING']);
    const o = await orderOf('lose');
    assert.deepEqual([o.status, o.paymentStatus, o.cancelledBy], ['CANCELLED', 'REFUND_PENDING', 'system']);
    assert.match(o.cancelReason, /^Promo code limit: This promo code has reached its usage limit\.$/);
    assert.equal(r.cancelReason, o.cancelReason);
    assert.equal(o.payment.razorpayPaymentId, 'pay_lose', 'the payment is recorded, so it can be refunded');
    assert.equal(await stockOf(ids('p')), 99);
    assert.equal(await usedCount(), 1);
    assert.equal(await userCount('bob'), 0);
    assert.equal((await db.doc(`checkouts/${ids('lose')}`).get()).get('outcome'), 'PROMO_LIMIT');
    assert.equal(await exists('carts/bob'), true, 'bob keeps his cart and can order again without the code');
  });

  it('says "already used" for a per-customer refusal', async () => {
    await makePromo({ maxUsesPerUser: 1 });
    await buyer('alice', 'x1');
    await buyer('alice', 'x2');
    await pay('alice', 'x1');
    assert.match((await pay('alice', 'x2')).cancelReason, new RegExp(`already used the code ${code}`));
  });

  it('a replay of a refused payment reports the same reason (a late webhook after the browser callback)', async () => {
    await makePromo({ globalMaxUses: 0 });
    await buyer('alice', 'z');
    const first = await pay('alice', 'z');
    const again = await pay('alice', 'z');
    assert.equal(again.replay, true);
    assert.equal(again.cancelReason, first.cancelReason);
  });

  it('out of stock still wins, and a cancelled order uses up nothing', async () => {
    await makePromo({ maxUsesPerUser: 1 });
    await buyer('alice', 'big', { qty: 500 }); // more boxes than exist
    const r = await pay('alice', 'big');
    assert.equal(r.status, 'CANCELLED');
    assert.match(r.cancelReason, /^Out of stock/);
    assert.equal(await usedCount(), 0);
    assert.equal(await userCount('alice'), 0);
  });

  it('honours an order quoted with a code that was deleted since (the customer already paid the quoted price)', async () => {
    await makePromo({ globalMaxUses: 1 });
    await buyer('alice', 'del');
    await promoRef().delete();
    assert.equal((await pay('alice', 'del')).status, 'PAYMENT_CONFIRMED');
    assert.equal(await exists(`promoCodes/${code}`), false, 'the claim did not resurrect the deleted code');
  });

  it('honours an order whose code had its limit mistyped after the quote (config problems never cancel a paid order)', async () => {
    await makePromo({ globalMaxUses: 'ten' });
    await buyer('alice', 'typo');
    assert.equal((await pay('alice', 'typo')).status, 'PAYMENT_CONFIRMED');
  });
});

// ============================================================
describe('promo usage limits: the early check before payment (createCheckout / previewCheckout use loadPromo)', () => {
  let code;
  beforeEach(() => {
    code = `EARLY${Date.now()}X${n}`.toUpperCase();
  });
  const guest = { uid: 'alice', anonymous: false };

  it('lets a first-time customer through, then politely refuses once they have used a one-use code', async () => {
    await db.doc(`promoCodes/${code}`).set({ type: 'percent', value: 10, active: true, expiresAt: null, maxUsesPerUser: 1 });
    assert.equal((await loadPromo(db, code, guest)).code, code);

    await db.doc(`promoCodes/${code}/uses/alice`).set({ uid: 'alice', code, count: 1 });
    await assert.rejects(loadPromo(db, code, guest), (err) => err.code === 'failed-precondition' && err.message === `You have already used the code ${code}.` && err.details.promoLimit === true);
    assert.equal((await loadPromo(db, code, { uid: 'bob', anonymous: false })).code, code, 'someone else is unaffected');
  });

  it('refuses a code whose total is used up, reading the server-kept counter', async () => {
    await db.doc(`promoCodes/${code}`).set({ type: 'percent', value: 10, active: true, expiresAt: null, globalMaxUses: 2, usedCount: 2 });
    await assert.rejects(loadPromo(db, code, guest), /reached its usage limit/);
    await db.doc(`promoCodes/${code}`).update({ usedCount: 1 });
    assert.equal((await loadPromo(db, code, guest)).code, code);
  });

  it('the early check and the confirmation agree: the counter the confirmation writes is the one the early check reads', async () => {
    await db.doc(`promoCodes/${code}`).set({ type: 'percent', value: 10, active: true, expiresAt: null, globalMaxUses: 1, usedCount: 0 });
    await product(ids('p'), 10);
    await db.doc(`checkouts/${ids('c')}`).set(checkout('alice', ids('p'), 1, 'order_c', { promo: { code, type: 'percent', value: 10 } }));
    assert.equal((await loadPromo(db, code, guest)).code, code);
    await finalizeCheckout(db, { checkoutId: ids('c'), razorpayPaymentId: 'pay_c', uid: 'alice' });
    await assert.rejects(loadPromo(db, code, { uid: 'bob', anonymous: false }), /reached its usage limit/);
  });

  it('asks a guest to sign in for a members-only code', async () => {
    await db.doc(`promoCodes/${code}`).set({ type: 'percent', value: 10, active: true, expiresAt: null, requiresSignIn: true });
    await assert.rejects(loadPromo(db, code, { uid: 'g', anonymous: true }), /Sign in to use this promo code/);
    assert.equal((await loadPromo(db, code, guest)).code, code);
  });
});
