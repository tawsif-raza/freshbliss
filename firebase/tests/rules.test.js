'use strict';

// Security rules tests for FreshBliss.
// Run with:  npm run test:rules   (starts the Firestore emulator for you)
//
// Pattern used everywhere: for every thing a client must NOT do, we also prove
// the nearby thing it MAY do. That way a green run cannot simply mean
// "everything is blocked because the rules are broken".

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require('@firebase/rules-unit-testing');
const {
  doc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} = require('firebase/firestore');

let testEnv;

// ---------- setup ----------

before(async () => {
  // `firebase emulators:exec` sets FIRESTORE_EMULATOR_HOST for us.
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-freshbliss',
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8'),
      host,
      port: Number(port),
    },
  });
});

after(async () => {
  await testEnv.cleanup();
});

// Fresh data before each test. Seeding bypasses the rules (like the Admin SDK).
beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'products/classic-fresh-mix'), {
      name: 'Classic Fresh Mix', price: 149, stock: 25, active: true,
    });
    await setDoc(doc(db, 'products/draft-box'), {
      name: 'Draft Box', price: 99, stock: 5, active: false,
    });
    await setDoc(doc(db, 'deliveryZones/A'), { name: 'Zone A', fee: 0, active: true });
    await setDoc(doc(db, 'checkouts/c1'), { uid: 'alice', status: 'CREATED' });
    await setDoc(doc(db, 'promoCodes/WELCOME'), { type: 'percent', value: 10, active: true });
    await setDoc(doc(db, 'paymentEvents/evt1'), { processedAt: 1 });
    await setDoc(doc(db, 'rateLimits/createCheckout__uid__alice'), { count: 1, windowStart: 1 });
    await setDoc(doc(db, 'orders/order-alice'), orderFor('alice', 'PREPARING'));
    await setDoc(doc(db, 'orders/order-alice-delivered'), orderFor('alice', 'DELIVERED'));
    await setDoc(doc(db, 'orders/order-bob'), orderFor('bob', 'DELIVERED'));
  });
});

// ---------- helpers ----------

function orderFor(uid, status) {
  return {
    uid,
    status,
    paymentStatus: 'PAID',
    pricing: { subtotal: 149, discount: 0, deliveryFee: 30, tip: 0, total: 179 },
    createdAt: new Date('2026-10-01T10:00:00Z'), // real orders always have one (the My orders query sorts on it)
  };
}

const anon = () => testEnv.unauthenticatedContext().firestore();
const asUser = (uid) => testEnv.authenticatedContext(uid).firestore();
const asStaff = () => testEnv.authenticatedContext('staff1', { staff: true }).firestore();

// Read a doc straight from the database, ignoring the rules.
async function rawRead(docPath) {
  let data;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    data = (await getDoc(doc(ctx.firestore(), docPath))).data();
  });
  return data;
}

const validFeedback = (orderId, over = {}) => ({
  orderId,
  uid: 'alice',
  overall: 5,
  packaging: 4,
  delivery: null,
  comment: 'Fresh and on time.',
  createdAt: serverTimestamp(),
  ...over,
});

const validCart = (over = {}) => ({
  items: [{ productId: 'classic-fresh-mix', size: 'regular', qty: 2 }],
  note: 'Ring the bell',
  tip: 10,
  promoCode: null,
  pincode: '560001',
  updatedAt: serverTimestamp(),
  ...over,
});

const validWishlist = (over = {}) => ({
  productIds: ['classic-fresh-mix'],
  updatedAt: serverTimestamp(),
  ...over,
});

// ============================================================
// PROOF 1: a client is denied from writing everything by default
// ============================================================
describe('default deny', () => {
  const blockedWrites = [
    'products/new-box',
    'deliveryZones/C',
    'orders/new-order',
    'checkouts/c2',
    'promoCodes/FREE100',
    'paymentEvents/evt2',
    'rateLimits/createCheckout__uid__alice', // the rate-limit counters: a customer must not be able to reset their own
    'excelSync/order-1', // the Excel copy ledger
    'some-unknown-collection/x', // a collection the rules never mention
  ];

  for (const p of blockedWrites) {
    it(`blocks anonymous, customer and staff writes to ${p}`, async () => {
      await assertFails(setDoc(doc(anon(), p), { x: 1 }));
      await assertFails(setDoc(doc(asUser('alice'), p), { x: 1 }));
      await assertFails(setDoc(doc(asStaff(), p), { x: 1 }));
    });
  }

  it('blocks all reads of server-only data, even for staff', async () => {
    for (const p of ['checkouts/c1', 'promoCodes/WELCOME', 'paymentEvents/evt1', 'rateLimits/createCheckout__uid__alice', 'excelSync/order-1', 'some-unknown-collection/x']) {
      await assertFails(getDoc(doc(asUser('alice'), p)));
      await assertFails(getDoc(doc(asStaff(), p)));
    }
  });

  it('blocks a customer from listing promo codes', async () => {
    await assertFails(getDocs(collection(asUser('alice'), 'promoCodes')));
  });

  it('control: the same client can still read public catalogue data', async () => {
    await assertSucceeds(getDoc(doc(asUser('alice'), 'products/classic-fresh-mix')));
  });
});

// ============================================================
// PROOF 2: a client cannot change product prices or stock
// ============================================================
describe('products and delivery zones', () => {
  it('blocks a customer from updating price or stock', async () => {
    const ref = doc(asUser('alice'), 'products/classic-fresh-mix');
    await assertFails(updateDoc(ref, { price: 1 }));
    await assertFails(updateDoc(ref, { stock: 9999 }));
    await assertFails(updateDoc(ref, { price: 1, stock: 9999 }));
  });

  it('blocks overwriting, deleting and creating products', async () => {
    const db = asUser('alice');
    await assertFails(setDoc(doc(db, 'products/classic-fresh-mix'), { name: 'x', price: 1, stock: 99, active: true }));
    await assertFails(deleteDoc(doc(db, 'products/classic-fresh-mix')));
    await assertFails(setDoc(doc(db, 'products/free-box'), { name: 'Free', price: 0, stock: 99, active: true }));
  });

  it('blocks anonymous users and staff too (catalogue is changed by the server only)', async () => {
    await assertFails(updateDoc(doc(anon(), 'products/classic-fresh-mix'), { price: 1 }));
    await assertFails(updateDoc(doc(asStaff(), 'products/classic-fresh-mix'), { stock: 9999 }));
  });

  it('leaves the real price and stock untouched after all those attempts', async () => {
    const ref = doc(asUser('alice'), 'products/classic-fresh-mix');
    await assertFails(updateDoc(ref, { price: 1, stock: 9999 }));
    const p = await rawRead('products/classic-fresh-mix');
    assert.equal(p.price, 149);
    assert.equal(p.stock, 25);
  });

  it('control: anyone can read an active product', async () => {
    const snap = await assertSucceeds(getDoc(doc(anon(), 'products/classic-fresh-mix')));
    assert.equal(snap.data().price, 149);
  });

  it('hides inactive (draft) products from the public but not from staff', async () => {
    await assertFails(getDoc(doc(anon(), 'products/draft-box')));
    await assertFails(getDoc(doc(asUser('alice'), 'products/draft-box')));
    await assertSucceeds(getDoc(doc(asStaff(), 'products/draft-box')));
  });

  it('lets anyone read delivery zones but not change them', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'deliveryZones/A')));
    await assertFails(updateDoc(doc(asUser('alice'), 'deliveryZones/A'), { fee: 0 }));
  });
});

// ============================================================
// PROOF 3: a client cannot change status, paymentStatus or fees
// ============================================================
describe('orders cannot be changed by clients', () => {
  it('blocks the owner from setting their own order to DELIVERED', async () => {
    const ref = doc(asUser('alice'), 'orders/order-alice');
    await assertFails(updateDoc(ref, { status: 'DELIVERED' }));
  });

  it('blocks the owner from changing any other status (cancel goes through a function)', async () => {
    const ref = doc(asUser('alice'), 'orders/order-alice');
    await assertFails(updateDoc(ref, { status: 'CANCELLED' }));
    await assertFails(updateDoc(ref, { status: 'OUT_FOR_DELIVERY' }));
  });

  it('blocks the owner from changing paymentStatus', async () => {
    const ref = doc(asUser('alice'), 'orders/order-alice');
    await assertFails(updateDoc(ref, { paymentStatus: 'REFUNDED' }));
    await assertFails(updateDoc(ref, { paymentStatus: 'REFUND_PENDING' }));
  });

  it('blocks the owner from changing delivery fee, tip, discount or total', async () => {
    const ref = doc(asUser('alice'), 'orders/order-alice');
    await assertFails(updateDoc(ref, { 'pricing.deliveryFee': 0 }));
    await assertFails(updateDoc(ref, { 'pricing.discount': 149 }));
    await assertFails(updateDoc(ref, { 'pricing.total': 1 }));
    await assertFails(updateDoc(ref, { pricing: { subtotal: 1, discount: 0, deliveryFee: 0, tip: 0, total: 1 } }));
  });

  it('blocks creating, overwriting and deleting orders', async () => {
    const db = asUser('alice');
    await assertFails(setDoc(doc(db, 'orders/fake'), orderFor('alice', 'DELIVERED')));
    await assertFails(setDoc(doc(db, 'orders/order-alice'), orderFor('alice', 'DELIVERED')));
    await assertFails(deleteDoc(doc(db, 'orders/order-alice')));
  });

  it('blocks staff from writing orders directly too', async () => {
    await assertFails(updateDoc(doc(asStaff(), 'orders/order-alice'), { status: 'DELIVERED' }));
  });

  it('leaves the real order untouched after all those attempts', async () => {
    const ref = doc(asUser('alice'), 'orders/order-alice');
    await assertFails(updateDoc(ref, { status: 'DELIVERED', paymentStatus: 'REFUNDED', 'pricing.deliveryFee': 0 }));
    const o = await rawRead('orders/order-alice');
    assert.equal(o.status, 'PREPARING');
    assert.equal(o.paymentStatus, 'PAID');
    assert.equal(o.pricing.deliveryFee, 30);
  });
});

// ============================================================
// PROOF 4: other users cannot read an order, the owner can
// ============================================================
describe('order privacy', () => {
  it('lets the owner read their own order', async () => {
    const snap = await assertSucceeds(getDoc(doc(asUser('alice'), 'orders/order-alice')));
    assert.equal(snap.data().uid, 'alice');
  });

  it("lets the owner list their own orders with a uid filter", async () => {
    const q = query(collection(asUser('alice'), 'orders'), where('uid', '==', 'alice'));
    const snap = await assertSucceeds(getDocs(q));
    assert.equal(snap.size, 2);
  });

  it('lets the owner run the exact query the My orders page uses (uid filter, newest first, limited)', async () => {
    const q = query(collection(asUser('alice'), 'orders'), where('uid', '==', 'alice'), orderBy('createdAt', 'desc'), limit(50));
    const snap = await assertSucceeds(getDocs(q));
    assert.equal(snap.size, 2);
    assert.ok(snap.docs.every((d) => d.data().uid === 'alice'));
  });

  it("blocks that same query when it asks for someone else's orders", async () => {
    const q = query(collection(asUser('bob'), 'orders'), where('uid', '==', 'alice'), orderBy('createdAt', 'desc'), limit(50));
    await assertFails(getDocs(q));
  });

  it("blocks another signed-in user from reading someone else's order", async () => {
    await assertFails(getDoc(doc(asUser('bob'), 'orders/order-alice')));
  });

  it("blocks another user from listing someone else's orders, with or without a filter", async () => {
    const filtered = query(collection(asUser('bob'), 'orders'), where('uid', '==', 'alice'));
    await assertFails(getDocs(filtered));
    await assertFails(getDocs(collection(asUser('bob'), 'orders')));
  });

  it('blocks a user from listing all orders without a filter, even their own', async () => {
    await assertFails(getDocs(collection(asUser('alice'), 'orders')));
  });

  it('blocks signed-out users', async () => {
    await assertFails(getDoc(doc(anon(), 'orders/order-alice')));
  });

  it('lets staff list ALL orders (the dashboard query) but not customers', async () => {
    const active = query(collection(asStaff(), 'orders'), where('status', 'in', ['PAYMENT_CONFIRMED', 'PREPARING', 'PACKED', 'OUT_FOR_DELIVERY']));
    const snap = await assertSucceeds(getDocs(active));
    assert.equal(snap.size, 1, 'only the PREPARING order matches; the two DELIVERED ones do not');
    const same = query(collection(asUser('alice'), 'orders'), where('status', 'in', ['PAYMENT_CONFIRMED', 'PREPARING']));
    await assertFails(getDocs(same));
  });

  it('lets staff list the refund queue (cancelled + REFUND_PENDING) but not customers', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders/order-refund'), { uid: 'alice', status: 'CANCELLED', paymentStatus: 'REFUND_PENDING' });
    });
    const queue = (db) => query(collection(db, 'orders'), where('status', '==', 'CANCELLED'), where('paymentStatus', '==', 'REFUND_PENDING'));
    const snap = await assertSucceeds(getDocs(queue(asStaff())));
    assert.equal(snap.size, 1);
    await assertFails(getDocs(queue(asUser('alice'))));
    await assertFails(getDocs(queue(anon())));
  });

  it('lets staff read any order (read-only)', async () => {
    await assertSucceeds(getDoc(doc(asStaff(), 'orders/order-alice')));
    await assertSucceeds(getDoc(doc(asStaff(), 'orders/order-bob')));
  });
});

// ============================================================
// Feedback: own DELIVERED order, one review, valid rating
// ============================================================
describe('feedback', () => {
  it('lets the owner review their own DELIVERED order', async () => {
    const db = asUser('alice');
    await assertSucceeds(setDoc(doc(db, 'feedback/order-alice-delivered'), validFeedback('order-alice-delivered')));
  });

  it('allows the optional ratings to be missing', async () => {
    const db = asUser('alice');
    const f = validFeedback('order-alice-delivered');
    delete f.packaging;
    delete f.delivery;
    await assertSucceeds(setDoc(doc(db, 'feedback/order-alice-delivered'), f));
  });

  it('allows only one review per order, and it cannot be edited or deleted', async () => {
    const db = asUser('alice');
    const ref = doc(db, 'feedback/order-alice-delivered');
    await assertSucceeds(setDoc(ref, validFeedback('order-alice-delivered')));
    await assertFails(setDoc(ref, validFeedback('order-alice-delivered', { overall: 1 }))); // second review
    await assertFails(updateDoc(ref, { overall: 1 }));
    await assertFails(deleteDoc(ref));
  });

  it('blocks a review for an order that is not DELIVERED yet', async () => {
    const db = asUser('alice');
    await assertFails(setDoc(doc(db, 'feedback/order-alice'), validFeedback('order-alice')));
  });

  it("blocks a review for someone else's order", async () => {
    const db = asUser('alice');
    await assertFails(setDoc(doc(db, 'feedback/order-bob'), validFeedback('order-bob')));
  });

  it('blocks writing a review as another user', async () => {
    const db = asUser('alice');
    await assertFails(setDoc(doc(db, 'feedback/order-bob'), validFeedback('order-bob', { uid: 'bob' })));
  });

  it('blocks a review for an order that does not exist', async () => {
    await assertFails(setDoc(doc(asUser('alice'), 'feedback/ghost'), validFeedback('ghost')));
  });

  it('blocks a review whose orderId field does not match the doc id', async () => {
    await assertFails(setDoc(doc(asUser('alice'), 'feedback/order-alice-delivered'), validFeedback('order-bob')));
  });

  it('blocks signed-out users', async () => {
    await assertFails(setDoc(doc(anon(), 'feedback/order-alice-delivered'), validFeedback('order-alice-delivered')));
  });

  it('rejects ratings that are not whole numbers from 1 to 5', async () => {
    const ref = doc(asUser('alice'), 'feedback/order-alice-delivered');
    for (const overall of [0, 6, -1, 4.5, '5', null]) {
      await assertFails(setDoc(ref, validFeedback('order-alice-delivered', { overall })));
    }
    await assertFails(setDoc(ref, validFeedback('order-alice-delivered', { packaging: 9 })));
    await assertFails(setDoc(ref, validFeedback('order-alice-delivered', { delivery: 0 })));
  });

  it('rejects a comment over 300 characters but accepts exactly 300', async () => {
    const ref = doc(asUser('alice'), 'feedback/order-alice-delivered');
    await assertFails(setDoc(ref, validFeedback('order-alice-delivered', { comment: 'x'.repeat(301) })));
    await assertSucceeds(setDoc(ref, validFeedback('order-alice-delivered', { comment: 'x'.repeat(300) })));
  });

  it('rejects extra fields and a client-made timestamp', async () => {
    const ref = doc(asUser('alice'), 'feedback/order-alice-delivered');
    await assertFails(setDoc(ref, validFeedback('order-alice-delivered', { verified: true })));
    await assertFails(setDoc(ref, validFeedback('order-alice-delivered', { createdAt: new Date('2020-01-01') })));
  });

  it('rejects a review with a missing required field', async () => {
    const ref = doc(asUser('alice'), 'feedback/order-alice-delivered');
    const f = validFeedback('order-alice-delivered');
    delete f.overall;
    await assertFails(setDoc(ref, f));
  });

  it('lets the author read their review but not other users', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'feedback/order-alice-delivered'), { uid: 'alice', overall: 5 });
    });
    await assertSucceeds(getDoc(doc(asUser('alice'), 'feedback/order-alice-delivered')));
    await assertFails(getDoc(doc(asUser('bob'), 'feedback/order-alice-delivered')));
  });
});

// ============================================================
// Carts and wishlists: owner only
// ============================================================
describe('carts', () => {
  it('lets the owner save, read and clear their own cart', async () => {
    const ref = doc(asUser('alice'), 'carts/alice');
    await assertSucceeds(setDoc(ref, validCart()));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(deleteDoc(ref));
  });

  it("blocks other users and signed-out users from someone else's cart", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'carts/alice'), { items: [] });
    });
    await assertFails(getDoc(doc(asUser('bob'), 'carts/alice')));
    await assertFails(setDoc(doc(asUser('bob'), 'carts/alice'), validCart()));
    await assertFails(deleteDoc(doc(asUser('bob'), 'carts/alice')));
    await assertFails(getDoc(doc(anon(), 'carts/alice')));
    await assertFails(setDoc(doc(anon(), 'carts/alice'), validCart()));
  });

  it('rejects an invalid tip, pincode, note, size or extra fields', async () => {
    const ref = doc(asUser('alice'), 'carts/alice');
    await assertFails(setDoc(ref, validCart({ tip: 5 })));
    await assertFails(setDoc(ref, validCart({ tip: 10.5 })));
    await assertFails(setDoc(ref, validCart({ pincode: '56001' })));
    await assertFails(setDoc(ref, validCart({ pincode: '56001a' })));
    await assertFails(setDoc(ref, validCart({ note: 'x'.repeat(201) })));
    await assertFails(setDoc(ref, validCart({ promoCode: 'x'.repeat(33) })));
    await assertFails(setDoc(ref, validCart({ total: 1 })));
    await assertFails(setDoc(ref, validCart({ items: 'nope' })));
    await assertFails(setDoc(ref, validCart({ items: Array.from({ length: 31 }, (_, i) => ({ productId: `p${i}`, size: 'regular', qty: 1 })) })));
  });

  it('accepts a cart with no optional fields and a null promo/pincode', async () => {
    const ref = doc(asUser('alice'), 'carts/alice');
    await assertSucceeds(setDoc(ref, { items: [], updatedAt: serverTimestamp() }));
    await assertSucceeds(setDoc(ref, validCart({ promoCode: null, pincode: null })));
  });

  it('rejects a client-made updatedAt', async () => {
    await assertFails(setDoc(doc(asUser('alice'), 'carts/alice'), validCart({ updatedAt: new Date() })));
  });

  it('accepts a delivery slot (or null for as-soon-as-possible) and nothing else in its place', async () => {
    const ref = doc(asUser('alice'), 'carts/alice');
    await assertSucceeds(setDoc(ref, validCart({ slot: { date: '2026-10-05', id: '1900-2100' } })));
    await assertSucceeds(setDoc(ref, validCart({ slot: null })));
    await assertFails(setDoc(ref, validCart({ slot: 'evening' })));
    await assertFails(setDoc(ref, validCart({ slot: { date: '5 Oct', id: '1900-2100' } })));
    await assertFails(setDoc(ref, validCart({ slot: { date: '2026-10-05', id: 'x' } })));
    await assertFails(setDoc(ref, validCart({ slot: { date: '2026-10-05' } })));
    await assertFails(setDoc(ref, validCart({ slot: { date: '2026-10-05', id: '1900-2100', fee: 0 } })));
    await assertFails(setDoc(ref, validCart({ slot: [] })));
  });
});

describe('wishlists', () => {
  it('lets the owner save, read and delete their own wishlist', async () => {
    const ref = doc(asUser('alice'), 'wishlists/alice');
    await assertSucceeds(setDoc(ref, validWishlist()));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(deleteDoc(ref));
  });

  it("blocks other users and signed-out users from someone else's wishlist", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'wishlists/alice'), { productIds: [] });
    });
    await assertFails(getDoc(doc(asUser('bob'), 'wishlists/alice')));
    await assertFails(setDoc(doc(asUser('bob'), 'wishlists/alice'), validWishlist()));
    await assertFails(getDoc(doc(anon(), 'wishlists/alice')));
  });

  it('rejects extra fields, too many items and a client-made timestamp', async () => {
    const ref = doc(asUser('alice'), 'wishlists/alice');
    await assertFails(setDoc(ref, validWishlist({ vip: true })));
    await assertFails(setDoc(ref, validWishlist({ productIds: Array.from({ length: 101 }, (_, i) => `p${i}`) })));
    await assertFails(setDoc(ref, validWishlist({ updatedAt: new Date() })));
  });
});
