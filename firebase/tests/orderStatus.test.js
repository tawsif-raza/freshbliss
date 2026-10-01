'use strict';

// Tests for moving an order through its delivery steps. Run: npm run test:orders
// Uses the real Firestore emulator.

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');

// Use the SAME firebase-admin copy the functions use (two copies cannot share FieldValue).
const fromFunctions = createRequire(path.join(__dirname, '..', 'functions', 'package.json'));
const { initializeApp, getApps } = fromFunctions('firebase-admin/app');
const { getFirestore } = fromFunctions('firebase-admin/firestore');
const { advanceOrder } = require('../functions/updateOrderStatus');
const { nextStatus, cleanRider, ORDER_FLOW } = require('../functions/shared/orderStatus');

let db;
before(() => {
  process.env.GCLOUD_PROJECT = 'demo-freshbliss';
  if (getApps().length === 0) initializeApp({ projectId: 'demo-freshbliss' });
  db = getFirestore();
});

let n = 0;
let id;
beforeEach(async () => {
  n += 1;
  id = `ord-${Date.now()}-${n}`;
  await db.doc(`orders/${id}`).set({ uid: 'alice', status: 'PAYMENT_CONFIRMED', paymentStatus: 'PAID', timestamps: { PAYMENT_CONFIRMED: new Date() } });
});

const get = async () => (await db.doc(`orders/${id}`).get()).data();
const advance = (status, rider) => advanceOrder(db, { orderId: id, status, rider, staffUid: 'staff1' });
const RIDER = { name: 'Ravi', phone: '+91 98765 43210', vehicle: 'Bike KA-01' };

describe('order flow helpers', () => {
  it('knows the next step, and that there is none after DELIVERED or for CANCELLED', () => {
    assert.deepEqual(ORDER_FLOW, ['PAYMENT_CONFIRMED', 'PREPARING', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED']);
    assert.equal(nextStatus('PAYMENT_CONFIRMED'), 'PREPARING');
    assert.equal(nextStatus('OUT_FOR_DELIVERY'), 'DELIVERED');
    assert.equal(nextStatus('DELIVERED'), null);
    assert.equal(nextStatus('CANCELLED'), null);
    assert.equal(nextStatus('nonsense'), null);
  });

  it('cleans rider details and rejects bad ones', () => {
    assert.deepEqual(cleanRider({ name: '  Ravi ', phone: ' +91 98765 43210 ', vehicle: '' }), { name: 'Ravi', phone: '+91 98765 43210', vehicle: null });
    assert.throws(() => cleanRider({}), /rider name/);
    assert.throws(() => cleanRider(undefined), /rider name/);
    assert.throws(() => cleanRider({ name: 'x'.repeat(61) }), /rider name/);
    assert.throws(() => cleanRider({ name: 'Ravi', phone: 'call me' }), /phone/);
    assert.throws(() => cleanRider({ name: 'Ravi', phone: '1'.repeat(21) }), /phone/);
    assert.throws(() => cleanRider({ name: 'Ravi', vehicle: 'v'.repeat(41) }), /vehicle/);
  });
});

describe('advanceOrder', () => {
  it('walks an order through every step, stamping each one', async () => {
    await advance('PREPARING');
    await advance('PACKED');
    const out = await advance('OUT_FOR_DELIVERY', RIDER);
    assert.equal(out.replay, false);
    await advance('DELIVERED');

    const o = await get();
    assert.equal(o.status, 'DELIVERED');
    for (const s of ORDER_FLOW) assert.ok(o.timestamps[s], `timestamp for ${s}`);
    assert.equal(o.updatedBy, 'staff1');
    assert.equal(o.paymentStatus, 'PAID', 'payment fields are untouched');
  });

  it('sets a 4-digit delivery code and the rider when going out for delivery', async () => {
    await advance('PREPARING');
    await advance('PACKED');
    await advance('OUT_FOR_DELIVERY', RIDER);
    const o = await get();
    assert.match(o.pin, /^[0-9]{4}$/);
    assert.deepEqual(o.rider, RIDER);
  });

  it('will not go out for delivery without a rider name, and changes nothing', async () => {
    await advance('PREPARING');
    await advance('PACKED');
    await assert.rejects(() => advance('OUT_FOR_DELIVERY'), /rider name/);
    const o = await get();
    assert.equal(o.status, 'PACKED');
    assert.equal(o.pin, undefined);
  });

  it('refuses to skip a step', async () => {
    await assert.rejects(() => advance('PACKED'), /next step is PREPARING/);
    await assert.rejects(() => advance('DELIVERED'), /next step is PREPARING/);
    assert.equal((await get()).status, 'PAYMENT_CONFIRMED');
  });

  it('refuses to go backwards', async () => {
    await advance('PREPARING');
    await advance('PACKED');
    await assert.rejects(() => advance('PREPARING'), /next step is OUT_FOR_DELIVERY/);
    assert.equal((await get()).status, 'PACKED');
  });

  it('treats asking for the current status as a harmless repeat', async () => {
    await advance('PREPARING');
    const again = await advance('PREPARING');
    assert.equal(again.replay, true);
    assert.equal((await get()).status, 'PREPARING');
  });

  it('keeps the same delivery code if "out for delivery" is clicked twice', async () => {
    await advance('PREPARING');
    await advance('PACKED');
    await advance('OUT_FOR_DELIVERY', RIDER);
    const pin = (await get()).pin;
    await advance('OUT_FOR_DELIVERY', { name: 'Someone else' });
    const o = await get();
    assert.equal(o.pin, pin);
    assert.equal(o.rider.name, 'Ravi');
  });

  it('is safe when two staff click the same button at the same moment', async () => {
    await advance('PREPARING');
    const results = await Promise.all([advance('PACKED'), advance('PACKED'), advance('PACKED')]);
    assert.equal(results.filter((r) => !r.replay).length, 1, 'exactly one click did the work');
    assert.equal((await get()).status, 'PACKED');
  });

  it('cannot move a delivered, cancelled or missing order', async () => {
    await db.doc(`orders/${id}`).update({ status: 'DELIVERED' });
    await assert.rejects(() => advance('PREPARING'), /cannot be moved/);

    await db.doc(`orders/${id}`).update({ status: 'CANCELLED', paymentStatus: 'REFUND_PENDING' });
    await assert.rejects(() => advance('PREPARING'), /cannot be moved/);
    assert.equal((await get()).status, 'CANCELLED');

    await assert.rejects(() => advanceOrder(db, { orderId: 'does-not-exist', status: 'PREPARING', staffUid: 's' }), /could not find/);
  });
});
