'use strict';

// Tests for createMockOrder (the emulator-only "checkout without Razorpay"). Run: npm run test:unit
// A fake database that records what is written, so we can check exactly what a test order looks like.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildMockOrder } = require('../functions/createMockOrder');

const SIZES = [{ id: 'regular', label: 'Regular', extra: 0 }, { id: 'large', label: 'Large', extra: 50 }];

function fakeDb() {
  const docs = new Map([
    ['products/classic-fresh-mix', { name: 'Classic Fresh Mix', price: 149, stock: 25, active: true, sizes: SIZES }],
    ['products/mango', { name: 'Mango Box', price: 229, stock: 0, active: true, sizes: SIZES }],
    ['promoCodes/WELCOME10', { type: 'percent', value: 10, min: 199, active: true, expiresAt: null }],
  ]);
  const zones = [
    { id: 'A', name: 'Zone A', fee: 0, etaMin: 30, etaMax: 45, match: { regex: '^5600\\d{2}$' }, priority: 1, active: true },
    { id: 'B', name: 'Zone B', fee: 30, etaMin: 45, etaMax: 60, match: { regex: '^560\\d{3}$' }, priority: 2, active: true },
  ];
  const written = [];
  const snap = (path) => ({ id: path.split('/').pop(), exists: docs.has(path), data: () => docs.get(path), get: (f) => docs.get(path)?.[f] });
  return {
    written,
    docs,
    doc: (path) => ({ path, get: async () => snap(path) }),
    getAll: async (...refs) => refs.map((r) => snap(r.path)),
    collection: (name) => {
      if (name === 'orders') return { doc: () => ({ id: 'order123', create: async (data) => void written.push({ path: 'orders/order123', data }) }) };
      return { where: () => ({ get: async () => ({ docs: zones.map((z) => ({ id: z.id, data: () => z })) }) }) };
    },
  };
}

const user = { uid: 'u1', token: {} };
const cart = (over = {}) => ({
  items: [{ productId: 'classic-fresh-mix', size: 'regular', qty: 2 }],
  pincode: '560103',
  tip: 10,
  promoCode: null,
  address: '12 MG Road, Indiranagar',
  note: 'Ring twice',
  ...over,
});
const make = (data, { emulator = true, auth = user, db = fakeDb() } = {}) => buildMockOrder({ auth, data }, { db, emulator }).then((result) => ({ result, db }));
const rejects = (promise, code, message) =>
  assert.rejects(promise, (err) => {
    assert.equal(err.code, code);
    if (message) assert.match(err.message, message);
    return true;
  });

// ============================================================
describe('the order a test checkout creates', () => {
  it('is a real order, priced by the real pricing code, marked as a mock payment and already PREPARING', async () => {
    const { result, db } = await make(cart());
    assert.deepEqual([result.orderId, result.status, result.paymentStatus], ['order123', 'PREPARING', 'PAID_MOCK']);
    assert.equal(db.written.length, 1);
    const order = db.written[0].data;
    assert.deepEqual([order.status, order.paymentStatus], ['PREPARING', 'PAID_MOCK']);
    assert.deepEqual(order.pricing, { subtotal: 298, discount: 0, deliveryFee: 30, tip: 10, total: 338 });
    assert.deepEqual(order.items, [{ productId: 'classic-fresh-mix', name: 'Classic Fresh Mix', size: 'regular', qty: 2, unitPrice: 149, lineTotal: 298 }]);
  });

  it('has every field the tracking page, account page, receipt and staff dashboard read', async () => {
    const { db } = await make(cart());
    const o = db.written[0].data;
    assert.equal(o.id, 'order123');
    assert.equal(o.uid, 'u1');
    assert.equal(o.address, '12 MG Road, Indiranagar');
    assert.equal(o.pincode, '560103');
    assert.equal(o.note, 'Ring twice');
    assert.deepEqual(o.zone, { id: 'B', name: 'Zone B', fee: 30, etaMin: 45, etaMax: 60 });
    assert.equal(o.etaMinutes, 60);
    assert.deepEqual(Object.keys(o.timestamps).sort(), ['PAYMENT_CONFIRMED', 'PREPARING'], 'the timeline can show both steps');
    assert.ok(o.createdAt && o.updatedAt);
    assert.equal(o.payment.amountPaise, 33800);
    assert.equal(o.payment.mock, true);
    assert.equal(o.payment.razorpayPaymentId, null, 'no payment was made, so there is no payment reference');
  });

  it('applies a promo code and a zone the same way the real checkout does', async () => {
    const { db } = await make(cart({ promoCode: 'welcome10', pincode: '560012', tip: 0 }));
    const o = db.written[0].data;
    assert.deepEqual(o.pricing, { subtotal: 298, discount: 29, deliveryFee: 0, tip: 0, total: 269 });
    assert.deepEqual(o.promo, { code: 'WELCOME10', type: 'percent', value: 10 });
    assert.equal(o.zone.id, 'A');
  });

  it('does not touch stock', async () => {
    const { db } = await make(cart());
    assert.equal(db.docs.get('products/classic-fresh-mix').stock, 25);
  });

  it('can never be a PAID order (so staff cannot cancel it into the refund queue)', async () => {
    const { db } = await make(cart());
    assert.notEqual(db.written[0].data.paymentStatus, 'PAID');
  });
});

// ============================================================
describe('the guards', () => {
  it('REFUSES to run outside the emulator, and writes nothing', async () => {
    const db = fakeDb();
    await rejects(make(cart(), { emulator: false, db }), 'failed-precondition', /only .* in the local emulator/);
    assert.equal(db.written.length, 0);
  });

  it('decides "outside the emulator" from the environment when not told', async () => {
    const before = process.env.FUNCTIONS_EMULATOR;
    try {
      delete process.env.FUNCTIONS_EMULATOR;
      await rejects(buildMockOrder({ auth: user, data: cart() }, { db: fakeDb() }), 'failed-precondition', /local emulator/);
      process.env.FUNCTIONS_EMULATOR = 'true';
      assert.equal((await buildMockOrder({ auth: user, data: cart() }, { db: fakeDb() })).paymentStatus, 'PAID_MOCK');
    } finally {
      if (before === undefined) delete process.env.FUNCTIONS_EMULATOR;
      else process.env.FUNCTIONS_EMULATOR = before;
    }
  });

  it('wants a signed-in caller', async () => {
    await rejects(make(cart(), { auth: null }), 'unauthenticated');
  });

  it('still runs every real check: empty cart, bad pincode, outside the area, sold out, bad tip, bad promo', async () => {
    await rejects(make(cart({ items: [] })), 'failed-precondition', /empty/);
    await rejects(make(cart({ pincode: '12' })), 'failed-precondition', /pincode/);
    await rejects(make(cart({ pincode: '110001' })), 'failed-precondition', /don't deliver/);
    await rejects(make(cart({ items: [{ productId: 'mango', size: 'regular', qty: 1 }] })), 'failed-precondition', /out of stock/);
    await rejects(make(cart({ tip: 15 })), 'invalid-argument', /tip/);
    await rejects(make(cart({ promoCode: 'NOPE' })), 'failed-precondition', /not valid/);
  });

  it('wants a delivery address of a sensible length, and trims a long note', async () => {
    await rejects(make(cart({ address: '   ' })), 'invalid-argument', /address/);
    await rejects(make(cart({ address: 'x'.repeat(201) })), 'invalid-argument', /address/);
    const { db } = await make(cart({ note: 'n'.repeat(500) }));
    assert.equal(db.written[0].data.note.length, 200);
  });

  it('writes nothing when any check fails', async () => {
    const db = fakeDb();
    await assert.rejects(make(cart({ tip: 15 }), { db }));
    assert.equal(db.written.length, 0);
  });
});
