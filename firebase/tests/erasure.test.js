'use strict';

// Tests for DPDP data erasure (functions/shared/erasure.js, shared/excelErasure.js).
// Run: npm run test:orders   (uses the real Firestore emulator; the S3 file and Firebase Auth are stand-ins)
//
// The promise being tested: a customer's personal data is gone, and the shop's books are exactly as they were.

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');

// Use the SAME firebase-admin copy the functions use (two copies cannot share FieldValue).
const fromFunctions = createRequire(path.join(__dirname, '..', 'functions', 'package.json'));
const { initializeApp, getApps } = fromFunctions('firebase-admin/app');
const { getFirestore, Timestamp } = fromFunctions('firebase-admin/firestore');
const { REDACTED, hashUid, orderScrub, blockers, eraseUserData } = require('../functions/shared/erasure');
const { scrubOrderRows } = require('../functions/shared/excelErasure');
const { EXCEL_COLUMNS, orderToRow, appendRow } = require('../functions/excelSync');
const { LIMITS } = require('../functions/shared/rateLimit');
const { fakeStore } = require('./helpers/fakeStore');

const KEY = 'test-erasure-key-0123456789abcdef0123456789abcdef';
const T = Date.now();

let db;
before(() => {
  process.env.GCLOUD_PROJECT = 'demo-freshbliss';
  if (getApps().length === 0) initializeApp({ projectId: 'demo-freshbliss' });
  db = getFirestore();
});

// Firebase Auth stand-in: remembers who was deleted.
function fakeAuth({ failWith } = {}) {
  const deleted = [];
  return {
    deleted,
    deleteUser: async (uid) => {
      if (failWith) throw failWith;
      deleted.push(uid);
    },
  };
}

// ---------- pure parts ----------

describe('the replacement for a uid', () => {
  it('is stable, keyed, and does not contain the uid', () => {
    const a = hashUid('user-abc', KEY);
    assert.equal(a, hashUid('user-abc', KEY));
    assert.notEqual(a, hashUid('user-abd', KEY));
    assert.notEqual(a, hashUid('user-abc', `${KEY}-other`));
    assert.match(a, /^erased_[0-9a-f]{40}$/);
    assert.ok(!a.includes('user-abc'));
  });

  it('refuses to work without a proper secret, so it can never fall back to a guessable hash', () => {
    for (const bad of [undefined, null, '', 'short', 'x'.repeat(31)]) assert.throws(() => hashUid('u', bad), { code: 'internal' });
  });
});

describe('which fields of an order are overwritten', () => {
  const stamp = 'STAMP';
  it('overwrites the address and note, cuts the uid links, and touches nothing financial', () => {
    const patch = orderScrub({ uid: 'u', address: '12 MG Road', note: 'ring twice', claimedFrom: 'g1', status: 'DELIVERED', pricing: { total: 349 } }, 'erased_x', KEY, stamp);
    assert.deepEqual(Object.keys(patch).sort(), ['address', 'claimedFrom', 'note', 'piiErasedAt', 'uid']);
    assert.equal(patch.address, REDACTED);
    assert.equal(patch.note, REDACTED);
    assert.equal(patch.uid, 'erased_x');
    assert.equal(patch.claimedFrom, hashUid('g1', KEY));
  });

  it('does not invent a note, a claim or a reason that was never there', () => {
    const patch = orderScrub({ uid: 'u', address: 'a', note: '', cancelledBy: 'system', cancelReason: 'Out of stock: Mango' }, 'erased_x', KEY, stamp);
    assert.deepEqual(Object.keys(patch).sort(), ['address', 'piiErasedAt', 'uid']);
  });

  it('replaces the customer’s own uid in updatedBy (a customer cancel), but leaves a staff member’s alone', () => {
    const own = orderScrub({ uid: 'u', address: 'a', updatedBy: 'u' }, hashUid('u', KEY), KEY, stamp);
    assert.equal(own.updatedBy, hashUid('u', KEY));
    const asGuest = orderScrub({ uid: 'u', claimedFrom: 'g1', address: 'a', updatedBy: 'g1' }, hashUid('u', KEY), KEY, stamp);
    assert.equal(asGuest.updatedBy, hashUid('g1', KEY));
    assert.equal('updatedBy' in orderScrub({ uid: 'u', address: 'a', updatedBy: 'staff-1' }, hashUid('u', KEY), KEY, stamp), false);
  });

  it('overwrites a cancellation reason only when staff typed it', () => {
    assert.equal(orderScrub({ cancelledBy: 'staff', cancelReason: 'Called Priya on 98xxxx' }, 'h', KEY, stamp).cancelReason, REDACTED);
    assert.equal('cancelReason' in orderScrub({ cancelledBy: 'customer', cancelReason: 'Customer: Ordered by mistake' }, 'h', KEY, stamp), false);
    assert.equal('cancelReason' in orderScrub({ cancelledBy: 'system', cancelReason: 'Promo code limit: used up' }, 'h', KEY, stamp), false);
  });
});

describe('when erasure must wait', () => {
  const order = (status) => ({ data: { status } });
  const checkout = (status, ageMs, now) => ({ data: { status, createdAt: Timestamp.fromMillis(now - ageMs) } });
  const now = 1_000_000_000_000;

  it('waits for an order that is still being prepared or delivered', () => {
    for (const status of ['PAYMENT_CONFIRMED', 'PREPARING', 'PACKED', 'OUT_FOR_DELIVERY']) assert.equal(blockers([order(status)], [], now).length, 1, status);
  });
  it('lets finished orders go', () => assert.deepEqual(blockers([order('DELIVERED'), order('CANCELLED')], [], now), []));
  it('waits for a payment that may be in progress, but not for an old abandoned checkout or a paid one', () => {
    assert.equal(blockers([], [checkout('CREATED', 10 * 60 * 1000, now)], now).length, 1);
    assert.deepEqual(blockers([], [checkout('CREATED', 3 * 3600 * 1000, now)], now), []);
    assert.deepEqual(blockers([], [checkout('PAID', 1000, now)], now), []);
  });
});

// ---------- the real thing, against the Firestore emulator ----------

// One customer with everything the system can hold about them, plus a bystander whose data must never change.
async function seedCustomer(tag, { activeOrder = false } = {}) {
  const uid = `cust-${T}-${tag}`;
  const bystander = `other-${T}-${tag}`;
  const code = `WELCOME${tag.toUpperCase()}${T}`.slice(0, 32);
  const ts = Timestamp.now();

  const base = (id, over) => ({
    id,
    uid,
    items: [{ productId: 'mix', name: 'Classic Fresh Mix', size: 'large', qty: 2, unitPrice: 199, lineTotal: 398 }],
    pricing: { subtotal: 398, discount: 40, deliveryFee: 30, tip: 10, total: 398 },
    promo: { code, type: 'percent', value: 10 },
    zone: { id: 'B', name: 'Zone B', fee: 30 },
    pincode: '560100',
    address: 'Flat 4B, 12 MG Road, Priya Nair, 9876543210',
    note: 'Ring the bell twice, ask for Priya',
    slot: null,
    payment: { razorpayOrderId: `order_${id}`, razorpayPaymentId: `pay_${id}`, amountPaise: 39800, currency: 'INR' },
    status: 'DELIVERED',
    paymentStatus: 'PAID',
    timestamps: { PAYMENT_CONFIRMED: ts, DELIVERED: ts },
    createdAt: ts,
    updatedAt: ts,
    ...over,
  });

  // Order ids are Firestore auto-ids in production: they do not contain the uid, so neither do these.
  const ids = { delivered: `ord-${T}-${tag}-1`, staffCancelled: `ord-${T}-${tag}-2`, customerCancelled: `ord-${T}-${tag}-3`, claimed: `ord-${T}-${tag}-4` };
  const orders = {
    [ids.delivered]: base(ids.delivered, {}),
    [ids.staffCancelled]: base(ids.staffCancelled, { status: 'CANCELLED', paymentStatus: 'REFUNDED', cancelledBy: 'staff', cancelReason: 'Priya called, wants to cancel', refundIds: ['rfnd_1'], refundedPaise: 39800 }),
    [ids.customerCancelled]: base(ids.customerCancelled, { status: 'CANCELLED', paymentStatus: 'REFUNDED', cancelledBy: 'customer', cancelReason: 'Customer: Ordered by mistake', updatedBy: uid, refundIds: ['rfnd_2'], refundedPaise: 39800 }),
    [ids.claimed]: base(ids.claimed, { claimedFrom: `guest-${T}-${tag}`, claimedAt: ts }),
  };
  if (activeOrder) orders[`ord-${T}-${tag}-live`] = base(`ord-${T}-${tag}-live`, { status: 'PREPARING' });
  for (const [id, data] of Object.entries(orders)) await db.doc(`orders/${id}`).set(data);

  await db.doc(`checkouts/${ids.delivered}`).set({ uid, status: 'PAID', address: orders[ids.delivered].address, note: orders[ids.delivered].note, pincode: '560100', promo: orders[ids.delivered].promo, pricing: orders[ids.delivered].pricing, payment: orders[ids.delivered].payment, createdAt: ts });
  await db.doc(`refunds/${ids.staffCancelled}_full_1`).set({ orderId: ids.staffCancelled, razorpayPaymentId: `pay_${ids.staffCancelled}`, razorpayRefundId: 'rfnd_1', amountPaise: 39800, kind: 'full', status: 'PROCESSED', requestedBy: 'system', reason: 'Priya called, wants to cancel', createdAt: ts });
  await db.doc(`refunds/${ids.customerCancelled}_full_1`).set({ orderId: ids.customerCancelled, razorpayPaymentId: `pay_${ids.customerCancelled}`, razorpayRefundId: 'rfnd_2', amountPaise: 39800, kind: 'full', status: 'PROCESSED', requestedBy: 'system', reason: 'Customer: Ordered by mistake', createdAt: ts });
  await db.doc(`paymentEvents/evt_${uid}`).set({ event: 'order.paid', outcome: 'CONFIRMED', receivedAt: ts });
  await db.doc(`feedback/${ids.delivered}`).set({ orderId: ids.delivered, uid, overall: 5, comment: 'Delivered by Ravi, lovely', createdAt: ts });
  await db.doc(`carts/${uid}`).set({ items: [{ productId: 'mix', size: 'large', qty: 1 }], note: 'gate code 4411', pincode: '560100', updatedAt: ts });
  await db.doc(`wishlists/${uid}`).set({ productIds: ['mix'], updatedAt: ts });
  await db.doc(`promoCodes/${code}`).set({ active: true, type: 'percent', value: 10, usedCount: 1 });
  await db.doc(`promoCodes/${code}/uses/${uid}`).set({ uid, code, count: 1, orderIds: [ids.delivered], lastUsedAt: ts });
  await db.doc(`rateLimits/createCheckout__uid__${uid}`).set({ count: 2, windowStart: Date.now(), expiresAt: new Date(Date.now() + 1e6) });

  // A bystander with the same kinds of data.
  await db.doc(`orders/${bystander}-o1`).set(base(`${bystander}-o1`, { uid: bystander, address: 'Someone else, 9 Park St' }));
  await db.doc(`carts/${bystander}`).set({ items: [], updatedAt: ts });
  await db.doc(`promoCodes/${code}/uses/${bystander}`).set({ uid: bystander, code, count: 1, orderIds: [], lastUsedAt: ts });

  return { uid, bystander, code, ids, orders };
}

const get = async (p) => {
  const s = await db.doc(p).get();
  return s.exists ? s.data() : null;
};
const asJson = (data) => JSON.stringify(data, (k, v) => (v && typeof v.toMillis === 'function' ? `ts:${v.toMillis()}` : v));

// Every field a bookkeeper cares about, as it was.
const FINANCIAL = ['id', 'items', 'pricing', 'promo', 'zone', 'pincode', 'slot', 'payment', 'status', 'paymentStatus', 'timestamps', 'createdAt', 'refundIds', 'refundedPaise'];
const pick = (doc) => asJson(Object.fromEntries(FINANCIAL.filter((k) => k in doc).map((k) => [k, doc[k]])));

describe('erasing a customer (emulator)', () => {
  it('anonymises the personal data, keeps every financial field exactly, and leaves nobody else touched', async () => {
    const s = await seedCustomer('a');
    const auth = fakeAuth();
    const before = Object.fromEntries(await Promise.all(Object.keys(s.orders).map(async (id) => [id, await get(`orders/${id}`)])));
    const bystanderBefore = asJson(await get(`orders/${s.bystander}-o1`));
    const paymentEventBefore = asJson(await get(`paymentEvents/evt_${s.uid}`));
    let excelAsked = null;

    const result = await eraseUserData(db, { uid: s.uid, auth, key: KEY, scrubExcel: async (ids) => ((excelAsked = ids), 'DONE') });

    const hash = hashUid(s.uid, KEY);
    assert.equal(result.erased, true);
    assert.equal(result.orders, 4);
    assert.deepEqual(auth.deleted, [s.uid], 'the Auth account is deleted, once');
    assert.deepEqual([...excelAsked].sort(), Object.keys(s.orders).sort(), 'the Excel scrub is given every order');

    for (const id of Object.keys(s.orders)) {
      const after = await get(`orders/${id}`);
      assert.equal(after.uid, hash, `${id}: uid replaced`);
      assert.equal(after.address, REDACTED, `${id}: address`);
      assert.equal(after.note, REDACTED, `${id}: note`);
      assert.ok(after.piiErasedAt, `${id}: stamped`);
      assert.equal(pick(after), pick(before[id]), `${id}: every financial field is unchanged`);
    }
    assert.equal((await get(`orders/${s.ids.claimed}`)).claimedFrom, hashUid(`guest-${T}-a`, KEY));

    // Free text: staff's is overwritten, the customer's fixed reason and the system's stay.
    assert.equal((await get(`orders/${s.ids.staffCancelled}`)).cancelReason, REDACTED);
    assert.equal((await get(`orders/${s.ids.customerCancelled}`)).cancelReason, 'Customer: Ordered by mistake');
    assert.equal((await get(`orders/${s.ids.customerCancelled}`)).updatedBy, hash, 'the customer’s uid in updatedBy is replaced too');

    // Refunds: amounts, ids and status intact; only the staff-typed reason goes.
    const refundStaff = await get(`refunds/${s.ids.staffCancelled}_full_1`);
    assert.deepEqual([refundStaff.amountPaise, refundStaff.razorpayRefundId, refundStaff.razorpayPaymentId, refundStaff.status], [39800, 'rfnd_1', `pay_${s.ids.staffCancelled}`, 'PROCESSED']);
    assert.equal(refundStaff.reason, REDACTED);
    assert.equal((await get(`refunds/${s.ids.customerCancelled}_full_1`)).reason, 'Customer: Ordered by mistake');

    // Checkout (the payment's priced quote): same treatment.
    const checkout = await get(`checkouts/${s.ids.delivered}`);
    assert.deepEqual([checkout.uid, checkout.address, checkout.note, checkout.status, checkout.payment.razorpayOrderId], [hash, REDACTED, REDACTED, 'PAID', `order_${s.ids.delivered}`]);

    // The payment ledger is not personal and is not touched.
    assert.equal(asJson(await get(`paymentEvents/evt_${s.uid}`)), paymentEventBefore);

    // Feedback keeps the rating, loses the words and the link.
    const feedback = await get(`feedback/${s.ids.delivered}`);
    assert.deepEqual([feedback.overall, feedback.comment, feedback.uid], [5, REDACTED, hash]);

    // Deleted, or re-keyed with the counts kept.
    assert.equal(await get(`carts/${s.uid}`), null);
    assert.equal(await get(`wishlists/${s.uid}`), null);
    assert.equal(await get(`rateLimits/createCheckout__uid__${s.uid}`), null);
    assert.equal(await get(`promoCodes/${s.code}/uses/${s.uid}`), null);
    const use = await get(`promoCodes/${s.code}/uses/${hash}`);
    assert.deepEqual([use.uid, use.count, use.orderIds], [hash, 1, [s.ids.delivered]]);
    assert.equal((await get(`promoCodes/${s.code}`)).usedCount, 1, 'the code keeps its usage count');

    // The audit entry: proof, with no personal data.
    const log = await get(`erasureLog/${hash}`);
    assert.equal(log.state, 'COMPLETED');
    assert.deepEqual(log.counts, { orders: 4, checkouts: 1, feedback: 1, refundsTouched: 1 });
    assert.ok(!asJson(log).includes(s.uid));

    // The bystander is untouched.
    assert.equal(asJson(await get(`orders/${s.bystander}-o1`)), bystanderBefore);
    assert.ok(await get(`carts/${s.bystander}`));
    assert.ok(await get(`promoCodes/${s.code}/uses/${s.bystander}`));

    // Nothing left that names the person: no original text and no raw uid in any document of theirs.
    const everything = [];
    for (const id of Object.keys(s.orders)) everything.push(asJson(await get(`orders/${id}`)));
    everything.push(asJson(checkout), asJson(feedback), asJson(refundStaff), asJson(use));
    const text = everything.join('\n');
    for (const secret of ['Priya', '9876543210', 'MG Road', 'Ring the bell', 'Ravi', s.uid, 'gate code']) assert.ok(!text.includes(secret), `"${secret}" is gone`);
  });

  it('refuses while an order is still on the way, and changes nothing at all', async () => {
    const s = await seedCustomer('b', { activeOrder: true });
    const auth = fakeAuth();
    const snapshot = async () => asJson(await Promise.all(Object.keys(s.orders).map((id) => get(`orders/${id}`))));
    const before = await snapshot();

    await assert.rejects(() => eraseUserData(db, { uid: s.uid, auth, key: KEY }), (err) => err.code === 'failed-precondition' && /still on the way/.test(err.message));

    assert.equal(await snapshot(), before);
    assert.ok(await get(`carts/${s.uid}`), 'the cart is still there');
    assert.deepEqual(auth.deleted, [], 'the account is not touched');
    assert.equal(await get(`erasureLog/${hashUid(s.uid, KEY)}`), null, 'nothing was started');
  });

  it('refuses while a payment may be in progress, but not for an old abandoned checkout', async () => {
    const uid = `cust-${T}-pay`;
    await db.doc(`checkouts/${uid}-live`).set({ uid, status: 'CREATED', address: '1 Road', note: '', createdAt: Timestamp.now() });
    await assert.rejects(() => eraseUserData(db, { uid, auth: fakeAuth(), key: KEY }), { code: 'failed-precondition' });

    await db.doc(`checkouts/${uid}-live`).update({ createdAt: Timestamp.fromMillis(Date.now() - 3 * 3600 * 1000) });
    const auth = fakeAuth();
    const result = await eraseUserData(db, { uid, auth, key: KEY });
    assert.equal(result.checkouts, 1);
    assert.equal((await get(`checkouts/${uid}-live`)).address, REDACTED);
    assert.deepEqual(auth.deleted, [uid]);
  });

  it('stops before changing anything if the Excel copy cannot be scrubbed, then succeeds on the next try', async () => {
    const s = await seedCustomer('c');
    const auth = fakeAuth();
    await assert.rejects(
      () => eraseUserData(db, { uid: s.uid, auth, key: KEY, scrubExcel: async () => { throw new Error('S3 is down'); } }),
      (err) => err.code === 'unavailable' && !/S3/.test(err.message),
    );
    assert.equal((await get(`orders/${s.ids.delivered}`)).uid, s.uid, 'the orders are still findable by uid');
    assert.equal((await get(`orders/${s.ids.delivered}`)).address.includes('MG Road'), true);
    assert.ok(await get(`carts/${s.uid}`));
    assert.deepEqual(auth.deleted, []);
    assert.equal((await get(`erasureLog/${hashUid(s.uid, KEY)}`)).state, 'FAILED_EXCEL');

    const result = await eraseUserData(db, { uid: s.uid, auth, key: KEY, scrubExcel: async () => 'DONE' });
    assert.equal(result.orders, 4);
    assert.equal((await get(`erasureLog/${hashUid(s.uid, KEY)}`)).state, 'COMPLETED');
  });

  it('survives the Auth deletion failing: the data is already erased, and the retry only closes the account', async () => {
    const s = await seedCustomer('d');
    await assert.rejects(() => eraseUserData(db, { uid: s.uid, auth: fakeAuth({ failWith: Object.assign(new Error('network'), { code: 'auth/internal-error' }) }), key: KEY }), { code: 'unavailable' });
    assert.equal((await get(`orders/${s.ids.delivered}`)).address, REDACTED);
    assert.equal((await get(`erasureLog/${hashUid(s.uid, KEY)}`)).state, 'FAILED_AUTH');

    const auth = fakeAuth();
    const result = await eraseUserData(db, { uid: s.uid, auth, key: KEY });
    assert.equal(result.orders, 0, 'nothing is left to erase');
    assert.deepEqual(auth.deleted, [s.uid]);
    assert.equal((await get(`erasureLog/${hashUid(s.uid, KEY)}`)).state, 'COMPLETED');
  });

  it('treats an account that is already gone as done, and can be run twice', async () => {
    const s = await seedCustomer('e');
    const gone = fakeAuth({ failWith: Object.assign(new Error('no user'), { code: 'auth/user-not-found' }) });
    assert.equal((await eraseUserData(db, { uid: s.uid, auth: gone, key: KEY })).erased, true);
    const again = await eraseUserData(db, { uid: s.uid, auth: gone, key: KEY });
    assert.deepEqual([again.orders, again.checkouts, again.feedback], [0, 0, 0]);
  });

  it('handles a guest with only a cart, and a customer with more than one batch of orders', async () => {
    const guest = `guest-${T}-lonely`;
    await db.doc(`carts/${guest}`).set({ items: [], note: 'leave at gate', updatedAt: Timestamp.now() });
    const auth = fakeAuth();
    const r = await eraseUserData(db, { uid: guest, auth, key: KEY });
    assert.deepEqual([r.orders, r.excel], [0, 'NOT_NEEDED']);
    assert.equal(await get(`carts/${guest}`), null);
    assert.deepEqual(auth.deleted, [guest]);

    const many = `cust-${T}-many`;
    const writer = db.bulkWriter();
    for (let i = 0; i < 450; i++) writer.set(db.doc(`orders/${many}-${i}`), { uid: many, status: 'DELIVERED', paymentStatus: 'PAID', address: `${i} Long Street`, note: '', pricing: { total: 100 } });
    await writer.close();
    const big = await eraseUserData(db, { uid: many, auth: fakeAuth(), key: KEY });
    assert.equal(big.orders, 450);
    const left = await db.collection('orders').where('uid', '==', many).limit(1).get();
    assert.equal(left.size, 0, 'no order is left under the real uid');
    const sample = await get(`orders/${many}-449`);
    assert.deepEqual([sample.address, sample.pricing.total, sample.status], [REDACTED, 100, 'DELIVERED']);
  });

  it('will not run without the secret, before it reads or changes anything', async () => {
    const s = await seedCustomer('f');
    await assert.rejects(() => eraseUserData(db, { uid: s.uid, auth: fakeAuth(), key: '' }), { code: 'internal' });
    assert.equal((await get(`orders/${s.ids.delivered}`)).uid, s.uid);
  });

  it('clears every rate-limit bucket the system keeps per customer', () => {
    assert.ok(Object.keys(LIMITS).includes('requestDataErasure'));
    assert.ok(Object.keys(LIMITS).length >= 5);
  });
});

// ---------- the Excel copy ----------

describe('scrubbing the Excel order sheet', () => {
  const CFG = { bucket: 'b', key: 'orders/orders.xlsx', region: 'ap-south-1', accessKeyId: 'AKIAEXAMPLE', secretAccessKey: 'SECRET', endpoint: '' };
  const order = (name) => ({
    uid: 'u',
    status: 'DELIVERED',
    paymentStatus: 'PAID',
    address: `${name}'s house, 12 MG Road`,
    pincode: '560100',
    zone: { name: 'Zone B' },
    items: [{ name: 'Classic Fresh Mix', size: 'large', qty: 1 }],
    pricing: { subtotal: 199, discount: 0, deliveryFee: 30, tip: 0, total: 229 },
    payment: { razorpayPaymentId: `pay_${name}` },
    note: `ring for ${name}`,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  const col = (header) => EXCEL_COLUMNS.indexOf(header);

  it('overwrites name, phone, address and note for the given orders only, and keeps every other cell', async () => {
    const store = fakeStore();
    await appendRow(CFG, 'ord-priya', orderToRow('ord-priya', order('Priya'), { name: 'Priya Nair', phone: '+919876543210' }), { store });
    await appendRow(CFG, 'ord-ravi', orderToRow('ord-ravi', order('Ravi'), { name: 'Ravi K', phone: '+919811111111' }), { store });
    const ravi = await store.rowOf('ord-ravi');
    const priyaBefore = await store.rowOf('ord-priya');

    const result = await scrubOrderRows(CFG, { orderIds: ['ord-priya'], columns: EXCEL_COLUMNS, redacted: REDACTED }, { store });
    assert.deepEqual(result, { rows: 1, changed: true });

    const priya = await store.rowOf('ord-priya');
    for (const header of ['Customer', 'Phone', 'Address', 'Note']) assert.equal(priya[col(header)], REDACTED, header);
    EXCEL_COLUMNS.forEach((header, i) => {
      if (!['Customer', 'Phone', 'Address', 'Note'].includes(header)) assert.equal(priya[i], priyaBefore[i], `${header} is unchanged`);
    });
    assert.deepEqual(await store.rowOf('ord-ravi'), ravi, 'another customer’s row is untouched');
  });

  it('does nothing (and saves nothing) when the orders are not in the sheet or already scrubbed', async () => {
    const store = fakeStore();
    await appendRow(CFG, 'ord-1', orderToRow('ord-1', order('Asha')), { store });
    const args = { columns: EXCEL_COLUMNS, redacted: REDACTED };
    assert.deepEqual(await scrubOrderRows(CFG, { ...args, orderIds: ['nope'] }, { store }), { rows: 0, changed: false });
    await scrubOrderRows(CFG, { ...args, orderIds: ['ord-1'] }, { store });
    const puts = store.puts;
    assert.deepEqual(await scrubOrderRows(CFG, { ...args, orderIds: ['ord-1'] }, { store }), { rows: 1, changed: false });
    assert.equal(store.puts, puts, 'no second upload');
  });

  it('refuses if the columns it expects are not there, instead of scrubbing the wrong cells', async () => {
    await assert.rejects(() => scrubOrderRows(CFG, { orderIds: ['x'], columns: ['Order ID', 'Phone'], redacted: REDACTED }, { store: fakeStore() }), /columns changed/);
  });
});
