'use strict';

// Tests for previewCheckout (the read-only price quote). Run: npm run test:unit   (no emulator, no network)
//
// The database is a tiny in-memory fake that can ONLY READ. If the function ever tried to write
// (save a cart, make an order, touch stock) it would throw, so "it changes nothing" is tested too.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { quoteCart } = require('../functions/previewCheckout');
const { priceCart } = require('../functions/createCheckout');

const SIZES = [
  { id: 'regular', label: 'Regular', extra: 0 },
  { id: 'large', label: 'Large', extra: 50 },
];

// A read-only database: products, zones and promos.
function fakeDb({ products = {}, zones = [], promos = {} } = {}) {
  const docs = new Map();
  for (const [id, p] of Object.entries(products)) docs.set(`products/${id}`, p);
  for (const [code, p] of Object.entries(promos)) docs.set(`promoCodes/${code}`, p);
  const snap = (path) => {
    const d = docs.get(path);
    return { id: path.split('/').pop(), exists: d !== undefined, data: () => d, get: (f) => d?.[f] };
  };
  const ref = (path) => ({ path, get: async () => snap(path) });
  return {
    doc: ref,
    getAll: async (...refs) => refs.map((r) => snap(r.path)),
    collection: (name) => {
      assert.equal(name, 'deliveryZones', 'only the zones are listed');
      return { where: () => ({ get: async () => ({ docs: zones.map((z) => ({ id: z.id, data: () => z })) }) }) };
    },
    // Anything that would WRITE is missing on purpose.
  };
}

const world = (over = {}) =>
  fakeDb({
    products: {
      'classic-fresh-mix': { name: 'Classic Fresh Mix', price: 149, stock: 25, active: true, sizes: SIZES },
      'gym-fuel-pack': { name: 'Gym Fuel Pack', price: 159, stock: 4, active: true, sizes: SIZES },
      'mango-box': { name: 'Mango Season Box', price: 229, stock: 0, active: true, sizes: SIZES },
      retired: { name: 'Retired Box', price: 100, stock: 9, active: false, sizes: SIZES },
    },
    zones: [
      { id: 'B', name: 'Zone B', fee: 30, etaMin: 45, etaMax: 60, match: { regex: '^560\\d{3}$' }, priority: 2, active: true },
      { id: 'A', name: 'Zone A', fee: 0, etaMin: 30, etaMax: 45, match: { regex: '^5600\\d{2}$' }, priority: 1, active: true },
    ],
    promos: {
      WELCOME10: { type: 'percent', value: 10, min: 199, active: true, expiresAt: null },
      FLAT50: { type: 'flat', value: 50, min: 0, active: true, expiresAt: null },
      OLD: { type: 'percent', value: 50, min: 0, active: true, expiresAt: { toMillis: () => Date.now() - 1000 } },
      OFF: { type: 'percent', value: 50, min: 0, active: false, expiresAt: null },
    },
    ...over,
  });

const staff = { uid: 'u1', token: {} };
const ask = (data, db = world()) => quoteCart({ auth: staff, data }, { db });
const cart = (over = {}) => ({ items: [{ productId: 'classic-fresh-mix', size: 'regular', qty: 2 }], pincode: '560103', tip: 0, promoCode: null, ...over });
const rejects = (promise, code, message) =>
  assert.rejects(promise, (err) => {
    assert.equal(err.code, code);
    if (message) assert.match(err.message, message);
    return true;
  });

// ============================================================
describe('previewCheckout: the numbers', () => {
  it('prices a cart: items, delivery fee for the zone, and the total', async () => {
    const r = await ask(cart());
    assert.deepEqual(r.pricing, { subtotal: 298, discount: 0, deliveryFee: 30, tip: 0, total: 328 });
    assert.deepEqual(r.items, [{ productId: 'classic-fresh-mix', name: 'Classic Fresh Mix', size: 'regular', qty: 2, unitPrice: 149, lineTotal: 298 }]);
  });

  it('uses the first matching zone by priority (Zone A beats the wider Zone B), and reports the estimate', async () => {
    const a = await ask(cart({ pincode: '560012' }));
    assert.deepEqual([a.zone.id, a.pricing.deliveryFee, a.zone.etaMin, a.zone.etaMax], ['A', 0, 30, 45]);
    const b = await ask(cart({ pincode: '560103' }));
    assert.deepEqual([b.zone.id, b.pricing.deliveryFee], ['B', 30]);
  });

  it('adds the size price difference', async () => {
    const r = await ask(cart({ items: [{ productId: 'classic-fresh-mix', size: 'large', qty: 1 }] }));
    assert.equal(r.items[0].unitPrice, 199);
    assert.equal(r.pricing.subtotal, 199);
  });

  it('applies a percent promo (rounded down), the tip, and adds it all up', async () => {
    const r = await ask(cart({ promoCode: 'welcome10', tip: 10, pincode: '560012' }));
    assert.deepEqual(r.pricing, { subtotal: 298, discount: 29, deliveryFee: 0, tip: 10, total: 279 });
    assert.deepEqual(r.promo, { code: 'WELCOME10', type: 'percent', value: 10 });
  });

  it('applies a flat promo, never more than the subtotal', async () => {
    assert.equal((await ask(cart({ promoCode: 'FLAT50' }))).pricing.discount, 50);
    const tiny = await ask(cart({ items: [{ productId: 'classic-fresh-mix', size: 'regular', qty: 1 }], promoCode: 'FLAT50' }));
    assert.equal(tiny.pricing.discount, 50);
    assert.ok(tiny.pricing.total >= 0);
  });

  it('returns exactly what createCheckout would charge (it uses the same pricing code)', async () => {
    const db = world();
    const r = await ask(cart({ promoCode: 'WELCOME10', tip: 20 }), db);
    const products = new Map([['classic-fresh-mix', { name: 'Classic Fresh Mix', price: 149, stock: 25, active: true, sizes: SIZES }]]);
    const zone = { id: 'B', name: 'Zone B', fee: 30, match: { regex: '^560\\d{3}$' } };
    const direct = priceCart({ lines: [{ productId: 'classic-fresh-mix', size: 'regular', qty: 2 }], products, zone, promo: { code: 'WELCOME10', type: 'percent', value: 10, min: 199 }, tip: 20 });
    assert.deepEqual(r.pricing, direct.pricing);
  });

  it('merges the same box and size listed twice', async () => {
    const r = await ask(cart({ items: [{ productId: 'classic-fresh-mix', size: 'regular', qty: 1 }, { productId: 'classic-fresh-mix', size: 'regular', qty: 2 }] }));
    assert.equal(r.items.length, 1);
    assert.equal(r.items[0].qty, 3);
  });
});

// ============================================================
describe('previewCheckout: what it refuses', () => {
  it('wants a signed-in caller', async () => {
    await rejects(quoteCart({ data: cart() }, { db: world() }), 'unauthenticated');
  });

  it('refuses an empty cart, an unreadable item and an oversized line', async () => {
    await rejects(ask(cart({ items: [] })), 'failed-precondition', /empty/);
    await rejects(ask(cart({ items: [{ productId: '../x', size: 'regular', qty: 1 }] })), 'invalid-argument', /could not be read/);
    await rejects(ask(cart({ items: [{ productId: 'classic-fresh-mix', size: 'regular', qty: 21 }] })), 'invalid-argument', /at most 20/);
  });

  it('refuses a tip that is not on the list', async () => {
    await rejects(ask(cart({ tip: 15 })), 'invalid-argument', /tip/);
    await rejects(ask(cart({ tip: '10' })), 'invalid-argument', /tip/);
  });

  it('wants a six-digit pincode, and says plainly when it does not deliver there', async () => {
    for (const pincode of [undefined, '', '5600', '56000a', 560001]) await rejects(ask(cart({ pincode })), 'failed-precondition', /pincode/);
    await rejects(ask(cart({ pincode: '110001' })), 'failed-precondition', /don't deliver/);
  });

  it('says so for a box that is out of stock, too few left, gone, or in a size it does not have', async () => {
    await rejects(ask(cart({ items: [{ productId: 'mango-box', size: 'regular', qty: 1 }] })), 'failed-precondition', /out of stock/);
    await rejects(ask(cart({ items: [{ productId: 'gym-fuel-pack', size: 'regular', qty: 5 }] })), 'failed-precondition', /Only 4 left/);
    await rejects(ask(cart({ items: [{ productId: 'retired', size: 'regular', qty: 1 }] })), 'failed-precondition', /no longer available/);
    await rejects(ask(cart({ items: [{ productId: 'nope', size: 'regular', qty: 1 }] })), 'failed-precondition', /no longer available/);
    await rejects(ask(cart({ items: [{ productId: 'classic-fresh-mix', size: 'huge', qty: 1 }] })), 'failed-precondition', /not available in that size/);
  });

  it('counts stock across sizes of the same box', async () => {
    await rejects(
      ask(cart({ items: [{ productId: 'gym-fuel-pack', size: 'regular', qty: 3 }, { productId: 'gym-fuel-pack', size: 'large', qty: 2 }] })),
      'failed-precondition',
      /Only 4 left/,
    );
  });
});

// ============================================================
describe('previewCheckout: promo codes', () => {
  it('gives ONE answer for a wrong, switched-off or expired code, so codes cannot be probed', async () => {
    const answers = [];
    for (const promoCode of ['NOPE', 'OFF', 'OLD', 'has spaces!', 'x'.repeat(40)]) {
      await assert.rejects(ask(cart({ promoCode })), (err) => {
        answers.push([err.code, err.message]);
        return true;
      });
    }
    assert.equal(new Set(answers.map((a) => a.join('|'))).size, 1, 'identical code and message every time');
    assert.deepEqual(answers[0], ['failed-precondition', 'That promo code is not valid.']);
  });

  it('tells a real customer how much more to add when a valid code needs a bigger order', async () => {
    await rejects(ask(cart({ items: [{ productId: 'classic-fresh-mix', size: 'regular', qty: 1 }], promoCode: 'WELCOME10' })), 'failed-precondition', /Add ₹50 more to use WELCOME10/);
  });

  it('treats an empty or missing code as "no promo"', async () => {
    for (const promoCode of [undefined, null, '']) assert.equal((await ask(cart({ promoCode }))).promo, null);
  });
});

// ============================================================
describe('previewCheckout: it changes nothing', () => {
  it('only reads: the fake database has no way to write and the call still succeeds', async () => {
    const db = world();
    assert.equal(typeof db.set, 'undefined');
    assert.equal(typeof db.batch, 'undefined');
    assert.equal(typeof db.runTransaction, 'undefined');
    await ask(cart({ promoCode: 'WELCOME10' }), db);
  });
});

// ============================================================
describe('previewCheckout: wrong promo codes are reported to the rate limiter', () => {
  const guess = async (promoCode) => {
    let wrong = 0;
    const result = await quoteCart({ auth: staff, data: cart({ promoCode }) }, { db: world(), onBadPromo: () => (wrong += 1) }).catch((e) => e);
    return { wrong, result };
  };

  it('counts a made-up, switched-off, expired or malformed code as one wrong guess each', async () => {
    for (const code of ['NOPE', 'OFF', 'OLD', 'has spaces!']) assert.equal((await guess(code)).wrong, 1, code);
  });

  it('does not count a right code, no code, or a right code that needs a bigger order', async () => {
    assert.equal((await guess('WELCOME10')).wrong, 0);
    assert.equal((await guess(null)).wrong, 0);
    const small = await quoteCart({ auth: staff, data: cart({ items: [{ productId: 'classic-fresh-mix', size: 'regular', qty: 1 }], promoCode: 'WELCOME10' }) }, { db: world(), onBadPromo: () => assert.fail('a valid code is not a wrong guess') }).catch((e) => e);
    assert.match(small.message, /Add ₹50 more/);
  });
});
