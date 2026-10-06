'use strict';

// Tests for the Razorpay refund automation (functions/shared/refunds.js, autoRefund.js, processRefund.js).
// Run: npm run test:orders   (uses the real Firestore emulator; Razorpay is a fake that records what it was asked)
//
// What they prove: a cancelled order is refunded in full exactly once however many times it is triggered; the refund id and
// status are stored; the order ends REFUNDED or PARTIALLY_REFUNDED; a failed or unreachable Razorpay never loses or
// duplicates money; and a refund made by hand in the Razorpay dashboard is noticed.

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');

const fromFunctions = createRequire(path.join(__dirname, '..', 'functions', 'package.json'));
const { initializeApp, getApps } = fromFunctions('firebase-admin/app');
const { getFirestore } = fromFunctions('firebase-admin/firestore');
const { requestRefund, applyRefundEntity, createRazorpayClient } = require('../functions/shared/refunds');
const { refundIfNeeded, startsRefund } = require('../functions/autoRefund');
const { processRefundFor } = require('../functions/processRefund');
const { cancelOrderTx } = require('../functions/cancelOrder');

const TOTAL = 34800; // paise: Rs 348

let db;
before(() => {
  process.env.GCLOUD_PROJECT = 'demo-freshbliss';
  if (getApps().length === 0) initializeApp({ projectId: 'demo-freshbliss' });
  db = getFirestore();
});

let n = 0;
let id;
let payId;
beforeEach(() => {
  n += 1;
  id = `rf${Date.now()}x${n}`;
  payId = `pay_${id}`;
});

const orderDoc = (over = {}) => ({
  uid: 'alice',
  status: 'CANCELLED',
  paymentStatus: 'REFUND_PENDING',
  cancelReason: 'Customer: Changed my mind',
  items: [],
  payment: { razorpayOrderId: `order_${id}`, razorpayPaymentId: payId, amountPaise: TOTAL, currency: 'INR' },
  ...over,
});
const makeOrder = (over) => db.doc(`orders/${id}`).set(orderDoc(over));
const order = async () => (await db.doc(`orders/${id}`).get()).data();
const refundDoc = async (key) => (await db.doc(`refunds/${key}`).get()).data();

// A stand-in for Razorpay. Like the real one it remembers refunds by idempotency key, so a repeat returns the original.
function fakeRazorpay({ status = 'pending', failWith = null, listed = [] } = {}) {
  const byKey = new Map();
  const calls = [];
  return {
    calls,
    created: byKey,
    createRefund: async (paymentId, { amountPaise, notes }, key) => {
      calls.push({ paymentId, amountPaise, notes, key });
      if (failWith) throw failWith;
      if (!byKey.has(key)) {
        byKey.set(key, { id: `rfnd_${key.replace(/-/g, '')}`, payment_id: paymentId, amount: amountPaise, status, notes, speed_requested: 'normal' });
      }
      return byKey.get(key);
    },
    listRefunds: async () => [...listed, ...byKey.values()],
  };
}
const unreachable = () => Object.assign(new Error('Could not reach Razorpay.'), { retryable: true });
const refused = (message) => Object.assign(new Error(message), { retryable: false, statusCode: 400 });
const refundPlan = (client, over = {}) => requestRefund(db, client, { orderId: id, requestedBy: 'system', ...over });

// ============================================================
describe('a cancelled order is refunded through Razorpay', () => {
  it('sends the FULL amount once, normal speed, and stores the Razorpay refund id', async () => {
    await makeOrder();
    const rp = fakeRazorpay();
    const r = await refundPlan(rp);

    assert.equal(rp.calls.length, 1);
    assert.deepEqual([rp.calls[0].paymentId, rp.calls[0].amountPaise, rp.calls[0].key], [payId, TOTAL, `${id}_full_1`]);
    assert.equal(rp.calls[0].notes.refundKey, `${id}_full_1`);
    assert.deepEqual([r.refundStatus, r.replay], ['PENDING', false]);

    const o = await order();
    assert.equal(o.paymentStatus, 'REFUND_PENDING', 'still pending until Razorpay says processed');
    assert.equal(o.refundPendingPaise, TOTAL);
    assert.deepEqual(o.refundIds, [r.refundId]);
    const doc = await refundDoc(`${id}_full_1`);
    assert.deepEqual([doc.status, doc.kind, doc.amountPaise, doc.razorpayRefundId, doc.requestedBy], ['PENDING', 'full', TOTAL, r.refundId, 'system']);
  });

  it('a refund Razorpay has already processed ends REFUNDED straight away', async () => {
    await makeOrder();
    const r = await refundPlan(fakeRazorpay({ status: 'processed' }));
    assert.equal(r.paymentStatus, 'REFUNDED');
    const o = await order();
    assert.deepEqual([o.paymentStatus, o.refundedPaise, o.refundPendingPaise], ['REFUNDED', TOTAL, 0]);
    assert.ok(o.refundedAt);
  });

  it('refund.processed later finishes it: REFUND_PENDING -> REFUNDED, counted once even if sent twice', async () => {
    await makeOrder();
    const rp = fakeRazorpay();
    const r = await refundPlan(rp);
    const entity = { ...rp.created.get(`${id}_full_1`), status: 'processed' };
    await applyRefundEntity(db, entity);
    await applyRefundEntity(db, entity);
    const o = await order();
    assert.deepEqual([o.paymentStatus, o.refundedPaise, o.refundPendingPaise], ['REFUNDED', TOTAL, 0]);
    assert.deepEqual(o.refundIds, [r.refundId]);
    assert.equal((await refundDoc(`${id}_full_1`)).status, 'PROCESSED');
  });

  it('survives the webhook arriving BEFORE Razorpay\'s reply: still one refund, still REFUNDED', async () => {
    await makeOrder();
    const rp = fakeRazorpay();
    const original = rp.createRefund;
    rp.createRefund = async (...args) => {
      const entity = await original(...args);
      await applyRefundEntity(db, { ...entity, status: 'processed' }); // the webhook wins the race
      return entity; // the reply still says pending
    };
    await refundPlan(rp);
    const o = await order();
    assert.deepEqual([o.paymentStatus, o.refundedPaise, o.refundPendingPaise], ['REFUNDED', TOTAL, 0]);
    assert.equal((await refundDoc(`${id}_full_1`)).status, 'PROCESSED', 'a late "pending" does not undo "processed"');
  });

  it('three simultaneous triggers make ONE refund at Razorpay and reserve the amount once', async () => {
    await makeOrder();
    const rp = fakeRazorpay();
    await Promise.all([refundPlan(rp), refundPlan(rp), refundPlan(rp)].map((p) => p.catch((e) => e)));
    assert.equal(rp.created.size, 1, 'Razorpay holds a single refund');
    const o = await order();
    assert.equal(o.refundPendingPaise, TOTAL, 'reserved once, not three times');
    assert.equal(o.refundIds.length, 1);
    const again = await refundPlan(rp);
    assert.equal(again.replay, true);
    assert.equal(rp.created.size, 1);
  });

  it('works end to end for a customer cancel: cancelMyOrder -> autoRefund -> REFUNDED', async () => {
    const pid = `prod-${id}`;
    await db.doc(`products/${pid}`).set({ name: 'Box', price: 149, stock: 5, active: true });
    await makeOrder({ status: 'PAYMENT_CONFIRMED', paymentStatus: 'PAID', items: [{ productId: pid, name: 'Box', size: 'regular', qty: 1 }] });
    await cancelOrderTx(db, { orderId: id, reason: 'Customer: Changed my mind', customerUid: 'alice' });
    const after = await order();
    assert.deepEqual([after.status, after.paymentStatus], ['CANCELLED', 'REFUND_PENDING']);

    const rp = fakeRazorpay({ status: 'processed' });
    const r = await refundIfNeeded(db, rp, { orderId: id, before: { status: 'PAYMENT_CONFIRMED', paymentStatus: 'PAID' }, after });
    assert.equal(r.paymentStatus, 'REFUNDED');
    assert.equal((await order()).paymentStatus, 'REFUNDED');
  });
});

// ============================================================
describe('when Razorpay does not cooperate', () => {
  it('an unreachable Razorpay keeps the amount reserved; trying again reuses the SAME key (no double refund)', async () => {
    await makeOrder();
    const down = fakeRazorpay({ failWith: unreachable() });
    await assert.rejects(() => refundPlan(down), /could not reach Razorpay/i);
    let o = await order();
    assert.equal(o.refundPendingPaise, TOTAL, 'still reserved: we cannot know Razorpay did nothing');
    assert.equal((await refundDoc(`${id}_full_1`)).status, 'REQUESTED');
    assert.match((await refundDoc(`${id}_full_1`)).lastError, /Razorpay/);

    const up = fakeRazorpay();
    const r = await refundPlan(up);
    assert.equal(up.calls[0].key, `${id}_full_1`, 'same idempotency key as the failed attempt');
    assert.equal(r.refundStatus, 'PENDING');
    o = await order();
    assert.equal(o.refundPendingPaise, TOTAL, 'reserved once');
  });

  it('a refusal releases the reservation, records why, and a retry starts a fresh refund', async () => {
    await makeOrder();
    await assert.rejects(() => refundPlan(fakeRazorpay({ failWith: refused('The payment has already been fully refunded.') })), /did not accept the refund: The payment has already/);
    let o = await order();
    assert.deepEqual([o.paymentStatus, o.refundPendingPaise], ['REFUND_PENDING', 0]);
    assert.match(o.refundError, /already been fully refunded/);
    const failed = await refundDoc(`${id}_full_1`);
    assert.equal(failed.status, 'FAILED');
    assert.equal(failed.razorpayRefundId, undefined, 'no refund was ever created, so no id is invented');

    const rp = fakeRazorpay({ status: 'processed' });
    await refundPlan(rp);
    assert.equal(rp.calls[0].key, `${id}_full_2`, 'a new key, because Razorpay would replay the old failed refund for the old one');
    o = await order();
    assert.deepEqual([o.paymentStatus, o.refundError], ['REFUNDED', undefined]);
  });

  it('refund.failed from Razorpay later also releases the reservation and keeps the order in the queue', async () => {
    await makeOrder();
    const rp = fakeRazorpay();
    await refundPlan(rp);
    await applyRefundEntity(db, { ...rp.created.get(`${id}_full_1`), status: 'failed', failure_reason: 'Customer bank rejected it' });
    const o = await order();
    assert.deepEqual([o.paymentStatus, o.refundPendingPaise, o.refundError], ['REFUND_PENDING', 0, 'Customer bank rejected it']);
  });

  it('autoRefund never throws: a failure is stored on the order for staff to see', async () => {
    await makeOrder();
    const after = await order();
    const out = await refundIfNeeded(db, fakeRazorpay({ failWith: refused('Bad request') }), { orderId: id, before: { status: 'PAYMENT_CONFIRMED', paymentStatus: 'PAID' }, after });
    assert.match(out.error, /Bad request/);
    assert.match((await order()).refundError, /Bad request/);
  });
});

// ============================================================
describe('what is and is not refunded', () => {
  it('only acts on the CHANGE into "cancelled, refund pending"', () => {
    const pending = { status: 'CANCELLED', paymentStatus: 'REFUND_PENDING' };
    assert.equal(startsRefund({ status: 'PREPARING', paymentStatus: 'PAID' }, pending), true);
    assert.equal(startsRefund(undefined, pending), true, 'an order created already cancelled (sold out while paying)');
    assert.equal(startsRefund(pending, { ...pending, refundError: 'x' }), false, 'a later edit does not retry');
    assert.equal(startsRefund(pending, { ...pending, paymentStatus: 'REFUNDED' }), false);
    assert.equal(startsRefund({ status: 'PREPARING' }, { status: 'PACKED', paymentStatus: 'PAID' }), false);
  });

  it('refuses test (mock) orders and orders with no payment', async () => {
    await makeOrder({ payment: { razorpayPaymentId: null, amountPaise: TOTAL, mock: true } });
    const rp = fakeRazorpay();
    await assert.rejects(() => refundPlan(rp), /no Razorpay payment/);
    assert.equal(rp.calls.length, 0);
    assert.deepEqual(await refundIfNeeded(db, rp, { orderId: id, before: {}, after: await order() }), { skipped: 'no real payment' });
  });

  it('refuses an active order for a full refund, and an unknown order', async () => {
    await makeOrder({ status: 'PREPARING', paymentStatus: 'PAID' });
    await assert.rejects(() => refundPlan(fakeRazorpay()), /Only a cancelled order/);
    await assert.rejects(() => requestRefund(db, fakeRazorpay(), { orderId: 'nope-nope-nope', requestedBy: 's' }), /could not find/);
  });

  it('an order that is already REFUNDED is a harmless repeat', async () => {
    await makeOrder({ paymentStatus: 'REFUNDED' });
    const rp = fakeRazorpay();
    assert.equal((await refundPlan(rp)).replay, true);
    assert.equal(rp.calls.length, 0);
  });
});

// ============================================================
describe('staff: partial refunds (a delivered order, one bad box)', () => {
  const delivered = () => makeOrder({ status: 'DELIVERED', paymentStatus: 'PAID' });
  const staff = (rp, over = {}) => processRefundFor(db, rp, { orderId: id, amountRupees: 100, requestId: 'req1', note: 'Bruised mango', staffUid: 'staff1', ...over });

  it('refunds part of the payment and ends PARTIALLY_REFUNDED, with the staff member and reason on record', async () => {
    await delivered();
    const rp = fakeRazorpay({ status: 'processed' });
    const r = await staff(rp);
    assert.equal(rp.calls[0].amountPaise, 10000);
    assert.equal(r.paymentStatus, 'PARTIALLY_REFUNDED');
    const o = await order();
    assert.deepEqual([o.status, o.paymentStatus, o.refundedPaise, o.refundPendingPaise], ['DELIVERED', 'PARTIALLY_REFUNDED', 10000, 0]);
    const doc = await refundDoc(`${id}_p_req1`);
    assert.deepEqual([doc.kind, doc.requestedBy, doc.reason], ['partial', 'staff1', 'Bruised mango']);
  });

  it('refunding the rest ends REFUNDED; asking for more than is left is refused', async () => {
    await delivered();
    const rp = fakeRazorpay({ status: 'processed' });
    await staff(rp);
    await assert.rejects(() => staff(rp, { requestId: 'req2', amountRupees: 249 }), /more than is left/);
    const r = await staff(rp, { requestId: 'req2', amountRupees: 248 });
    assert.equal(r.paymentStatus, 'REFUNDED');
    assert.equal((await order()).refundedPaise, TOTAL);
  });

  it('pressing the button twice with the same request id is one refund', async () => {
    await delivered();
    const rp = fakeRazorpay();
    await Promise.all([staff(rp), staff(rp)].map((p) => p.catch((e) => e)));
    assert.equal(rp.created.size, 1);
    assert.equal((await order()).refundPendingPaise, 10000);
  });

  it('two refunds in flight together cannot exceed the payment', async () => {
    await delivered();
    const rp = fakeRazorpay();
    await staff(rp, { requestId: 'a', amountRupees: 200 });
    await assert.rejects(() => staff(rp, { requestId: 'b', amountRupees: 200 }), /more than is left/);
  });

  it('is not allowed on a cancelled order (that is refunded in full)', async () => {
    await makeOrder();
    await assert.rejects(() => staff(fakeRazorpay()), /refunded in full/);
  });

  it('needs a whole rupee amount and a request id', async () => {
    await delivered();
    await assert.rejects(() => requestRefund(db, fakeRazorpay(), { orderId: id, amountPaise: 50, requestId: 'r', requestedBy: 's' }), /at least/);
    await assert.rejects(() => requestRefund(db, fakeRazorpay(), { orderId: id, amountPaise: 10000, requestedBy: 's' }), /request id/);
  });
});

// ============================================================
describe('staff: retry and check (processRefundFor)', () => {
  const staff = (rp, over = {}) => processRefundFor(db, rp, { orderId: id, note: '', staffUid: 'staff1', ...over });

  it('notices a refund made by hand in the Razorpay dashboard instead of paying twice', async () => {
    await makeOrder();
    const rp = fakeRazorpay({ listed: [{ id: 'rfnd_dash1', payment_id: payId, amount: TOTAL, status: 'processed', notes: [] }] });
    const r = await staff(rp);
    assert.equal(rp.calls.length, 0, 'no second refund was sent');
    assert.equal(r.paymentStatus, 'REFUNDED');
    const o = await order();
    assert.deepEqual([o.paymentStatus, o.refundedPaise, o.refundIds], ['REFUNDED', TOTAL, ['rfnd_dash1']]);
    assert.equal((await refundDoc('rp_rfnd_dash1')).kind, 'dashboard');
  });

  it('a part-refund made by hand is counted, and only the REST is sent', async () => {
    await makeOrder();
    const rp = fakeRazorpay({ listed: [{ id: 'rfnd_dash2', payment_id: payId, amount: 10000, status: 'processed', notes: [] }] });
    await staff(rp);
    assert.equal(rp.calls[0].amountPaise, TOTAL - 10000);
  });

  it('a retry after a failure sends a new refund; a refund still pending is just reported', async () => {
    await makeOrder();
    await assert.rejects(() => staff(fakeRazorpay({ failWith: refused('nope') })), /did not accept/);
    const rp = fakeRazorpay();
    assert.equal((await staff(rp)).refundStatus, 'PENDING');
    const again = await staff(rp);
    assert.deepEqual([again.replay, again.refundStatus], [true, 'PENDING']);
    assert.equal(rp.created.size, 1);
  });

  it('says so if Razorpay cannot be reached while checking, and changes nothing', async () => {
    await makeOrder();
    const rp = fakeRazorpay();
    rp.listRefunds = async () => {
      throw unreachable();
    };
    await assert.rejects(() => staff(rp), /could not reach Razorpay/i);
    assert.equal((await order()).refundPendingPaise, undefined);
  });

  it('refuses a missing order', async () => {
    await assert.rejects(() => processRefundFor(db, fakeRazorpay(), { orderId: 'missing-order-x', staffUid: 's' }), /could not find/);
  });
});

// ============================================================
describe('createRazorpayClient (the real HTTP shapes, with a fake fetch)', () => {
  const reply = (status, body) => async () => ({ ok: status < 400, status, json: async () => body });

  it('sends the refund with Basic auth, the idempotency header, normal speed and the notes', async () => {
    let seen;
    const client = createRazorpayClient({
      keyId: 'rzp_test_abc',
      keySecret: 'sec',
      fetchImpl: async (url, init) => {
        seen = { url, init };
        return { ok: true, status: 200, json: async () => ({ id: 'rfnd_1', status: 'pending' }) };
      },
    });
    const out = await client.createRefund('pay_1', { amountPaise: 5000, notes: { refundKey: 'k' } }, 'order1_full_1');
    assert.equal(out.id, 'rfnd_1');
    assert.equal(seen.url, 'https://api.razorpay.com/v1/payments/pay_1/refund');
    assert.equal(seen.init.method, 'POST');
    assert.equal(seen.init.headers['X-Refund-Idempotency'], 'order1_full_1');
    assert.equal(seen.init.headers.Authorization, `Basic ${Buffer.from('rzp_test_abc:sec').toString('base64')}`);
    assert.deepEqual(JSON.parse(seen.init.body), { amount: 5000, speed: 'normal', notes: { refundKey: 'k' } });
  });

  it('marks network errors, 5xx and 429 as retryable, and 4xx as final with Razorpay\'s own words', async () => {
    const make = (fetchImpl) => createRazorpayClient({ keyId: 'k', keySecret: 's', fetchImpl });
    const ask = (client) => client.createRefund('pay_1', { amountPaise: 100, notes: {} }, 'key-0123456789');

    await assert.rejects(() => ask(make(async () => { throw new TypeError('fetch failed'); })), (e) => e.retryable === true);
    await assert.rejects(() => ask(make(reply(502, {}))), (e) => e.retryable === true);
    await assert.rejects(() => ask(make(reply(429, {}))), (e) => e.retryable === true);
    await assert.rejects(
      () => ask(make(reply(400, { error: { description: 'The refund amount provided is greater than amount captured' } }))),
      (e) => e.retryable === false && /greater than amount captured/.test(e.message),
    );
    await assert.rejects(() => ask(make(reply(409, { error: { description: 'Different request with the same idempotency key' } }))), (e) => e.retryable === false);
  });

  it('lists a payment\'s refunds', async () => {
    const client = createRazorpayClient({ keyId: 'k', keySecret: 's', fetchImpl: reply(200, { items: [{ id: 'rfnd_1' }] }) });
    assert.deepEqual(await client.listRefunds('pay_1'), [{ id: 'rfnd_1' }]);
  });
});
