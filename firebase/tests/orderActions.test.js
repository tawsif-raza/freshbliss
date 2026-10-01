'use strict';

// Tests for staff cancelling an order and marking its refund done.
// Run: npm run test:orders   (uses the real Firestore emulator)

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');

// Use the SAME firebase-admin copy the functions use (two copies cannot share FieldValue).
const fromFunctions = createRequire(path.join(__dirname, '..', 'functions', 'package.json'));
const { initializeApp, getApps } = fromFunctions('firebase-admin/app');
const { getFirestore } = fromFunctions('firebase-admin/firestore');
const { advanceOrder } = require('../functions/updateOrderStatus');
const { cancelOrderTx } = require('../functions/cancelOrder');
const { refundOrderTx } = require('../functions/processRefund');

const RIDER = { name: 'Ravi', phone: '+91 98765 43210', vehicle: 'Bike KA-01' };

let db;
before(() => {
  process.env.GCLOUD_PROJECT = 'demo-freshbliss';
  if (getApps().length === 0) initializeApp({ projectId: 'demo-freshbliss' });
  db = getFirestore();
});

let n = 0;
let id; // the order under test
let pid; // the product it contains
beforeEach(async () => {
  n += 1;
  const t = `${Date.now()}-${n}`;
  id = `act-${t}`;
  pid = `prod-${t}`;
  await db.doc(`products/${pid}`).set({ name: 'Box', price: 149, stock: 5, active: true });
  // The customer paid for 2 boxes (one regular, one large), so the stock was already taken.
  await db.doc(`orders/${id}`).set({
    uid: 'alice',
    status: 'PAYMENT_CONFIRMED',
    paymentStatus: 'PAID',
    items: [
      { productId: pid, name: 'Box', size: 'regular', qty: 1, unitPrice: 149, lineTotal: 149 },
      { productId: pid, name: 'Box', size: 'large', qty: 1, unitPrice: 199, lineTotal: 199 },
    ],
    timestamps: { PAYMENT_CONFIRMED: new Date() },
  });
});

const get = async () => (await db.doc(`orders/${id}`).get()).data();
const stockOf = async () => (await db.doc(`products/${pid}`).get()).get('stock');
const advance = (status, rider) => advanceOrder(db, { orderId: id, status, rider, staffUid: 'staff1' });
const cancel = (over = {}) => cancelOrderTx(db, { orderId: id, reason: 'Customer called to cancel', staffUid: 'staff1', ...over });
const refund = (over = {}) => refundOrderTx(db, { orderId: id, note: '', staffUid: 'staff1', ...over });

// ============================================================
describe('cancelOrderTx (staff cancel, starts the refund workflow)', () => {
  it('cancels, flags the refund, stamps it, and returns the boxes to stock (not packed yet)', async () => {
    const r = await cancel();
    assert.deepEqual([r.status, r.paymentStatus, r.restocked, r.replay], ['CANCELLED', 'REFUND_PENDING', true, false]);
    const o = await get();
    assert.equal(o.status, 'CANCELLED');
    assert.equal(o.paymentStatus, 'REFUND_PENDING');
    assert.equal(o.cancelReason, 'Customer called to cancel');
    assert.equal(o.cancelledBy, 'staff');
    assert.equal(o.updatedBy, 'staff1');
    assert.ok(o.timestamps.CANCELLED);
    assert.ok(o.timestamps.PAYMENT_CONFIRMED, 'earlier timestamps are kept');
    assert.equal(await stockOf(), 7, 'both sizes go back: 5 + 2');
  });

  it('also returns stock while the order is only being prepared', async () => {
    await advance('PREPARING');
    assert.equal((await cancel()).restocked, true);
    assert.equal(await stockOf(), 7);
  });

  it('does NOT return stock by default once the boxes are packed', async () => {
    await advance('PREPARING');
    await advance('PACKED');
    const r = await cancel();
    assert.equal(r.restocked, false);
    assert.equal(await stockOf(), 5);
  });

  it('lets staff override: return packed boxes to stock, or keep unpacked ones out', async () => {
    await advance('PREPARING');
    await advance('PACKED');
    assert.equal((await cancel({ restock: true })).restocked, true);
    assert.equal(await stockOf(), 7);

    // reset to an unpacked, paid order, then cancel with "do not restock"
    await db.doc(`orders/${id}`).update({ status: 'PAYMENT_CONFIRMED', paymentStatus: 'PAID' });
    assert.equal((await cancel({ restock: false })).restocked, false);
    assert.equal(await stockOf(), 7);
  });

  it('can cancel an order that is already out for delivery', async () => {
    await advance('PREPARING');
    await advance('PACKED');
    await advance('OUT_FOR_DELIVERY', RIDER);
    const r = await cancel();
    assert.equal(r.status, 'CANCELLED');
    assert.equal((await get()).paymentStatus, 'REFUND_PENDING');
  });

  it('cannot cancel a delivered order, and changes nothing', async () => {
    await db.doc(`orders/${id}`).update({ status: 'DELIVERED' });
    await assert.rejects(() => cancel(), /delivered order cannot be cancelled/);
    assert.equal((await get()).status, 'DELIVERED');
    assert.equal(await stockOf(), 5);
  });

  it('cancelling twice, even at the same moment, returns stock only once', async () => {
    const results = await Promise.all([cancel(), cancel(), cancel()]);
    assert.equal(results.filter((r) => !r.replay).length, 1, 'exactly one did the work');
    assert.equal(await stockOf(), 7, 'not 9 or 11');
    assert.equal((await cancel()).replay, true);
    assert.equal(await stockOf(), 7);
  });

  it('leaves an order the system already cancelled alone (its stock was never taken)', async () => {
    await db.doc(`orders/${id}`).update({ status: 'CANCELLED', paymentStatus: 'REFUND_PENDING', cancelledBy: 'system' });
    const r = await cancel();
    assert.equal(r.replay, true);
    assert.equal((await get()).cancelledBy, 'system');
    assert.equal(await stockOf(), 5);
  });

  it('refuses an unpaid or missing order', async () => {
    await db.doc(`orders/${id}`).update({ paymentStatus: 'REFUNDED' });
    await assert.rejects(() => cancel(), /Only a paid order/);
    await assert.rejects(() => cancelOrderTx(db, { orderId: 'nope', reason: 'x y z', staffUid: 's' }), /could not find/);
  });

  it('skips a product that was deleted from the catalogue instead of failing', async () => {
    await db.doc(`products/${pid}`).delete();
    assert.equal((await cancel()).status, 'CANCELLED');
  });
});

// ============================================================
describe('refundOrderTx (marks the refund as done)', () => {
  const makeCancelled = () => db.doc(`orders/${id}`).update({ status: 'CANCELLED', paymentStatus: 'REFUND_PENDING' });

  it('moves REFUND_PENDING to REFUNDED and records who and when', async () => {
    await makeCancelled();
    const r = await refund({ note: 'Refunded in Razorpay dashboard' });
    assert.deepEqual([r.paymentStatus, r.replay], ['REFUNDED', false]);
    const o = await get();
    assert.equal(o.paymentStatus, 'REFUNDED');
    assert.equal(o.status, 'CANCELLED', 'status is untouched');
    assert.equal(o.refundedBy, 'staff1');
    assert.equal(o.refundNote, 'Refunded in Razorpay dashboard');
    assert.ok(o.refundedAt);
  });

  it('works on orders the system cancelled for stock too', async () => {
    await db.doc(`orders/${id}`).update({ status: 'CANCELLED', paymentStatus: 'REFUND_PENDING', cancelledBy: 'system' });
    assert.equal((await refund()).paymentStatus, 'REFUNDED');
  });

  it('refuses an order that is not waiting for a refund', async () => {
    await assert.rejects(() => refund(), /pending refund/); // still PAID and active
    await db.doc(`orders/${id}`).update({ status: 'CANCELLED', paymentStatus: 'PAID' });
    await assert.rejects(() => refund(), /pending refund/);
    await assert.rejects(() => refundOrderTx(db, { orderId: 'nope', staffUid: 's' }), /could not find/);
  });

  it('is a harmless repeat the second time, even simultaneously', async () => {
    await makeCancelled();
    const results = await Promise.all([refund(), refund(), refund()]);
    assert.equal(results.filter((r) => !r.replay).length, 1);
    assert.equal((await refund()).replay, true);
    assert.equal((await get()).paymentStatus, 'REFUNDED');
  });
});
