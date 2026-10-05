'use strict';

// The rehearsal: a simulated customer and a staff member walk the shop's money path, end to end, against the REAL Cloud
// Functions, Firestore rules and triggers running in the Firebase emulators. Razorpay is the local stand-in in
// fakeRazorpay.js. Start it with `npm run rehearsal` (scripts/rehearsal.js sets everything up and runs this file).
//
// It mirrors docs/GO_LIVE.md section 9 as far as that is possible without real accounts. The report at the end says which
// items it proved and which still need a human with a Razorpay Test account, a phone and a browser.
//
// The customer uses the same Firebase JavaScript SDK the website uses (from web/node_modules): sign up, write a cart
// (subject to the security rules), call the callable functions, read orders (subject to the rules). The Admin SDK is used
// only to set the scene (stock, a limited promo code) and to LOOK at what the system stored.

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { createFakeRazorpay } = require('./fakeRazorpay');

const PROJECT = 'demo-freshbliss';
const PORT = Number(process.env.REHEARSAL_PORT || 9777);
const KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_test_localplaceholder'; // functions/.env.local
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;
const WEBHOOK_URL = `http://127.0.0.1:5001/${PROJECT}/asia-south1/razorpayWebhook`;
if (!KEY_SECRET || !WEBHOOK_SECRET) throw new Error('Run this with `npm run rehearsal`, which sets the secrets.');

const fromWeb = createRequire(path.join(__dirname, '..', '..', '..', 'web', 'package.json'));
const fromFunctions = createRequire(path.join(__dirname, '..', '..', 'functions', 'package.json'));
const { initializeApp, deleteApp } = fromWeb('firebase/app');
const A = fromWeb('firebase/auth');
const F = fromWeb('firebase/firestore');
const FN = fromWeb('firebase/functions');
const admin = fromFunctions('firebase-admin/app');
const adminFs = fromFunctions('firebase-admin/firestore');

// ---------- reporting ----------

const results = [];
let section = '';
const say = (text) => console.log(text);
async function step(name, fn) {
  try {
    await fn();
    results.push({ section, name, ok: true });
    say(`  ✔ ${name}`);
  } catch (err) {
    results.push({ section, name, ok: false, detail: err.message });
    say(`  ✖ ${name}\n      ${String(err.message).split('\n').join('\n      ')}`);
    return false;
  }
  return true;
}
const heading = (text) => {
  section = text;
  say(`\n${text}`);
};
// The SDK adds the HTTP status to a callable's message ("... [400]"); the website strips it (lib/errors.js), so do the same.
const said = (err) => String(err.message).replace(/\s*\[\d{3}\]$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(what, read, { timeout = 15000, every = 150 } = {}) {
  const until = Date.now() + timeout;
  let last;
  while (Date.now() < until) {
    last = await read();
    if (last) return last;
    await sleep(every);
  }
  throw new Error(`Timed out waiting for ${what}`);
}
// Runs `fn` and returns the error it throws (or fails the step if it does not throw).
async function refused(fn) {
  try {
    await fn();
  } catch (err) {
    return err;
  }
  throw new Error('Expected this to be refused, but it was allowed.');
}

// ---------- the people ----------

const apps = [];
function client(name) {
  const app = initializeApp({ projectId: PROJECT, apiKey: 'rehearsal-key', appId: `rehearsal-${name}` }, name);
  apps.push(app);
  const auth = A.getAuth(app);
  A.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = F.getFirestore(app);
  F.connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const fn = FN.getFunctions(app, 'asia-south1');
  FN.connectFunctionsEmulator(fn, '127.0.0.1', 5001);
  return {
    auth,
    db,
    get uid() {
      return auth.currentUser?.uid;
    },
    call: async (fname, data) => (await FN.httpsCallable(fn, fname)(data ?? {})).data,
    signUp: async (email) => (await A.createUserWithEmailAndPassword(auth, email, 'rehearsal-password-1')).user,
    signIn: async (email) => (await A.signInWithEmailAndPassword(auth, email, 'rehearsal-password-1')).user,
    anonymous: async () => (await A.signInAnonymously(auth)).user,
    // The customer's own order, or null if it does not exist yet. (The rules refuse a read of a document that is not
    // there, because they cannot tell whose it would be; the website only opens orders that exist.)
    order: async (id) => {
      try {
        const snap = await F.getDoc(F.doc(db, 'orders', id));
        return snap.exists() ? snap.data() : null;
      } catch (err) {
        if (err.code === 'permission-denied') return null;
        throw err;
      }
    },
    saveCart: (items, extra = {}) => F.setDoc(F.doc(db, 'carts', auth.currentUser.uid), { items, updatedAt: F.serverTimestamp(), ...extra }),
  };
}

const fake = createFakeRazorpay({ keyId: KEY_ID, keySecret: KEY_SECRET, webhookSecret: WEBHOOK_SECRET, webhookUrl: WEBHOOK_URL });
let adb; // Admin SDK Firestore, to set the scene and to look
const doc = async (p) => (await adb.doc(p).get()).data();

// A customer's whole trip to a paid order. Returns what later steps need.
async function checkoutAndPay(c, { productId, qty = 1, promoCode = null, pincode = '560012', tip = 0, verify = true } = {}) {
  await c.saveCart([{ productId, size: 'regular', qty }], { pincode, tip, promoCode });
  const quote = await c.call('createCheckout', { address: `Home: Flat 4B, MG Road. Pincode: ${pincode}` });
  const paid = fake.pay(quote.razorpayOrderId);
  const result = verify ? await c.call('verifyPayment', { checkoutId: quote.checkoutId, ...paid.response }) : null;
  return { quote, paid, result, orderId: quote.checkoutId };
}

async function main() {
  await fake.start(PORT);
  say(`Fake Razorpay listening on 127.0.0.1:${PORT}; functions emulator will call it at ${process.env.RAZORPAY_API_BASE}`);
  assert.equal(process.env.RAZORPAY_API_BASE, `http://127.0.0.1:${PORT}`, 'the functions must be pointed at the stand-in');

  admin.initializeApp({ projectId: PROJECT });
  adb = adminFs.getFirestore();

  // ---------- scene ----------
  heading('0. Set the scene (seed data, as in docs/GO_LIVE.md 8.1)');
  const seed = spawnSync(process.execPath, [path.join(__dirname, '..', 'seed.js')], { env: process.env, encoding: 'utf8' });
  await step('seed script writes products, delivery zones and the demo promo into the emulator', async () => {
    assert.equal(seed.status, 0, seed.stderr || seed.stdout);
    assert.ok((await adb.collection('products').get()).size >= 5);
    assert.equal((await doc('promoCodes/WELCOME10')).maxUsesPerUser, 1);
  });
  const stock = { box: 'rehearsal-box', rare: 'rehearsal-rare', drop: 'rehearsal-drop' };
  const product = (name, price, qty) => ({ name, price, stock: qty, active: true, sizes: [{ id: 'regular', label: 'Regular', extra: 0 }], category: 'fruit-boxes', createdAt: adminFs.FieldValue.serverTimestamp(), updatedAt: adminFs.FieldValue.serverTimestamp() });
  await adb.doc(`products/${stock.box}`).set(product('Rehearsal Box', 200, 50));
  await adb.doc(`products/${stock.rare}`).set(product('Rehearsal Rare Box', 300, 1));
  await adb.doc(`products/${stock.drop}`).set(product('Rehearsal Drop Box', 150, 50));
  await adb.doc('promoCodes/RUSH1').set({ type: 'percent', value: 20, min: 0, active: true, expiresAt: null, globalMaxUses: 1, usedCount: 0 });

  // ---------- 1 ----------
  heading('1. A new customer: browse, sign up, apply the welcome promo, pay, track');
  const alice = client('alice');
  let order1;
  let pricing;
  await step('a visitor can read the catalogue but not the promo codes, refunds or other private data', async () => {
    await alice.anonymous();
    const products = await F.getDocs(F.query(F.collection(alice.db, 'products'), F.where('active', '==', true))); // as the website asks
    assert.ok(products.size >= 5, 'products are public');
    for (const p of ['promoCodes/WELCOME10', 'promoCodes/WELCOME10/uses/x', 'refunds/x', 'checkouts/x', 'paymentEvents/x']) {
      const err = await refused(() => F.getDoc(F.doc(alice.db, p)));
      assert.equal(err.code, 'permission-denied', p);
    }
  });
  await step('creates an account (the guest session becomes a signed-in customer; same uid)', async () => {
    const guestUid = alice.uid;
    const credential = A.EmailAuthProvider.credential('alice@example.test', 'rehearsal-password-1');
    const linked = await A.linkWithCredential(alice.auth.currentUser, credential);
    assert.equal(linked.user.uid, guestUid, 'linking keeps the uid, so earlier orders stay attached');
    assert.equal(linked.user.isAnonymous, false);
  });
  await step('the customer saves a cart (security rules allow only a well-formed cart) and cannot write anyone else\'s', async () => {
    await alice.saveCart([{ productId: stock.box, size: 'regular', qty: 2 }], { pincode: '560012', tip: 10, promoCode: 'WELCOME10' });
    const err = await refused(() => F.setDoc(F.doc(alice.db, 'carts', 'someone-else'), { items: [], updatedAt: F.serverTimestamp() }));
    assert.equal(err.code, 'permission-denied');
    const bad = await refused(() => F.setDoc(F.doc(alice.db, 'carts', alice.uid), { items: [], tip: 999, updatedAt: F.serverTimestamp() }));
    assert.equal(bad.code, 'permission-denied', 'a tip the shop does not offer is refused by the rules');
  });
  await step('previewCheckout prices the cart on the server, with the promo, and the numbers add up', async () => {
    const q = await alice.call('previewCheckout', { items: [{ productId: stock.box, size: 'regular', qty: 2 }], pincode: '560012', tip: 10, promoCode: 'welcome10' });
    pricing = q.pricing;
    assert.equal(pricing.subtotal, 400);
    assert.equal(pricing.discount, 40, '10% of 400');
    assert.equal(pricing.deliveryFee, 0, 'Zone A is free');
    assert.equal(pricing.total, 400 - 40 + 0 + 10);
    assert.equal(q.promo.code, 'WELCOME10');
  });
  await step('createCheckout makes a Razorpay order for exactly that amount (key id and secret accepted)', async () => {
    await alice.saveCart([{ productId: stock.box, size: 'regular', qty: 2 }], { pincode: '560012', tip: 10, promoCode: 'WELCOME10' });
    const quote = await alice.call('createCheckout', { address: 'Home: Flat 4B, MG Road. Pincode: 560012' });
    assert.equal(quote.amountPaise, pricing.total * 100);
    const rzOrder = fake.orders.get(quote.razorpayOrderId);
    assert.ok(rzOrder, 'the order exists at "Razorpay"');
    assert.equal(rzOrder.amount, pricing.total * 100);
    assert.equal(rzOrder.receipt, quote.checkoutId);
    assert.equal(fake.log.find((l) => l.path === '/v1/orders').status, 200, 'the stand-in accepted our Basic auth');
    order1 = { quote, paid: fake.pay(quote.razorpayOrderId) };
  });
  await step('a tampered payment signature is refused (nothing is confirmed)', async () => {
    const err = await refused(() => alice.call('verifyPayment', { checkoutId: order1.quote.checkoutId, ...order1.paid.response, razorpay_signature: 'a'.repeat(64) }));
    assert.equal(err.code, 'functions/permission-denied');
    assert.equal((await adb.doc(`orders/${order1.quote.checkoutId}`).get()).exists, false);
  });
  await step('payment succeeds: the order is confirmed, stock goes down, the cart is cleared, the promo use is counted', async () => {
    const result = await alice.call('verifyPayment', { checkoutId: order1.quote.checkoutId, ...order1.paid.response });
    assert.deepEqual([result.status, result.paymentStatus, result.message], ['PAYMENT_CONFIRMED', 'PAID', 'Payment confirmed.']);
    const mine = await alice.order(order1.quote.checkoutId);
    assert.equal(mine.payment.razorpayPaymentId, order1.paid.payment.id);
    assert.equal((await doc(`products/${stock.box}`)).stock, 48);
    assert.equal((await adb.doc(`carts/${alice.uid}`).get()).exists, false, 'cart cleared');
    assert.equal((await doc('promoCodes/WELCOME10')).usedCount, 1);
    assert.equal((await doc(`promoCodes/WELCOME10/uses/${alice.uid}`)).count, 1);
  });
  await step('Razorpay\'s order.paid webhook arriving as well changes nothing (no second order, no second stock cut, no second promo use)', async () => {
    const out = await order1.paid.sendOrderPaid();
    assert.deepEqual([out.status, out.body], [200, 'Already processed']);
    assert.equal((await doc(`products/${stock.box}`)).stock, 48);
    assert.equal((await doc('promoCodes/WELCOME10')).usedCount, 1);
  });
  await step('the same webhook delivered twice is answered from the ledger', async () => {
    const out1 = await order1.paid.sendOrderPaid({ eventId: 'evt_rehearsal_dup' });
    const out2 = await order1.paid.sendOrderPaid({ eventId: 'evt_rehearsal_dup' });
    assert.equal(out1.status, 200);
    assert.deepEqual([out2.status, out2.body], [200, 'Duplicate']);
  });
  await step('a webhook with a wrong signature is rejected with 400', async () => {
    const res = await fetch(WEBHOOK_URL, { method: 'POST', headers: { 'content-type': 'application/json', 'x-razorpay-signature': 'b'.repeat(64) }, body: '{"event":"order.paid"}' });
    assert.equal(res.status, 400);
  });
  await step('the welcome code cannot be used a second time: a polite message before any payment', async () => {
    const err = await refused(() => alice.call('previewCheckout', { items: [{ productId: stock.box, size: 'regular', qty: 1 }], pincode: '560012', tip: 0, promoCode: 'WELCOME10' }));
    assert.equal(said(err), 'You have already used the code WELCOME10.');
    assert.equal(err.details?.promoLimit, true);
  });
  await step('the customer can read their own order but cannot change it, and another customer cannot see it', async () => {
    assert.ok(await alice.order(order1.quote.checkoutId));
    const err = await refused(() => F.updateDoc(F.doc(alice.db, 'orders', order1.quote.checkoutId), { paymentStatus: 'REFUNDED' }));
    assert.equal(err.code, 'permission-denied');
    const mallory = client('mallory');
    await mallory.signUp('mallory@example.test');
    const peek = await refused(() => F.getDoc(F.doc(mallory.db, 'orders', order1.quote.checkoutId)));
    assert.equal(peek.code, 'permission-denied');
    const staffCall = await refused(() => mallory.call('processRefund', { orderId: order1.quote.checkoutId }));
    assert.equal(staffCall.code, 'functions/permission-denied', 'staff-only functions refuse a customer');
  });

  heading('2. Staff: move the order along, and the customer sees it');
  const staff = client('staff');
  await step('a staff member (staff claim granted in the emulator) moves the order to Preparing', async () => {
    await staff.signUp('staff@example.test');
    await staff.call('devGrantStaff');
    await staff.auth.currentUser.getIdToken(true);
    const r = await staff.call('updateOrderStatus', { orderId: order1.quote.checkoutId, status: 'PREPARING' });
    assert.equal(r.status, 'PREPARING');
    assert.equal((await alice.order(order1.quote.checkoutId)).status, 'PREPARING', 'the customer reads the new status');
  });
  await step('staff can list orders; a customer listing everyone\'s orders is refused', async () => {
    const all = await F.getDocs(F.query(F.collection(staff.db, 'orders'), F.where('status', '==', 'PREPARING')));
    assert.ok(all.size >= 1);
    const err = await refused(() => F.getDocs(F.collection(alice.db, 'orders')));
    assert.equal(err.code, 'permission-denied');
  });

  heading('3. The customer cancels: the refund goes to Razorpay by itself and the order ends REFUNDED');
  await step('cancelMyOrder (allowed until packed) cancels, returns the stock and flags the refund', async () => {
    const r = await alice.call('cancelMyOrder', { orderId: order1.quote.checkoutId, reason: 'Changed my mind' });
    assert.deepEqual([r.status, r.paymentStatus, r.restocked], ['CANCELLED', 'REFUND_PENDING', true]);
    assert.equal((await doc(`products/${stock.box}`)).stock, 50);
  });
  let refund1;
  await step('the autoRefund trigger fires and asks Razorpay for the FULL amount, with an idempotency key and correct auth', async () => {
    await waitFor('the refund request to reach Razorpay', () => fake.refundsFor(order1.paid.payment.id).length > 0);
    const refunds = fake.refundsFor(order1.paid.payment.id);
    assert.equal(refunds.length, 1, 'exactly one refund');
    refund1 = refunds[0];
    assert.equal(refund1.amount, pricing.total * 100);
    const call = fake.log.find((l) => l.path.endsWith('/refund') && l.status === 200);
    assert.equal(call.idempotency, `${order1.quote.checkoutId}_full_1`);
    assert.equal(refund1.notes.refundKey, `${order1.quote.checkoutId}_full_1`);
    assert.equal(refund1.speed, 'normal');
  });
  await step('Razorpay\'s refund.created and refund.processed webhooks are accepted (200) and the order ends REFUNDED', async () => {
    const o = await waitFor('the order to become REFUNDED', async () => {
      const d = await doc(`orders/${order1.quote.checkoutId}`);
      return d.paymentStatus === 'REFUNDED' ? d : null;
    });
    // The order turns REFUNDED INSIDE the refund.processed webhook, and the fake logs a webhook only once the shop has answered
    // it, so wait for both answers instead of reading the log the instant the order flips.
    const refundHooks = await waitFor('both refund webhooks to be answered', async () => {
      const seen = fake.webhooks.filter((w) => w.event.startsWith('refund.'));
      return seen.length >= 2 ? seen : null;
    });
    assert.deepEqual(refundHooks.map((w) => [w.event, w.status]), [['refund.created', 200], ['refund.processed', 200]]);
    assert.equal(o.status, 'CANCELLED');
    assert.deepEqual(o.refundIds, [refund1.id]);
    assert.equal(o.refundedPaise, pricing.total * 100);
    assert.equal(o.refundPendingPaise, 0);
    const rec = await doc(`refunds/${order1.quote.checkoutId}_full_1`);
    assert.deepEqual([rec.status, rec.kind, rec.requestedBy, rec.razorpayRefundId], ['PROCESSED', 'full', 'system', refund1.id]);
    assert.equal((await alice.order(order1.quote.checkoutId)).paymentStatus, 'REFUNDED', 'the customer sees it');
  });
  await step('the refund queue is empty and the refund is never sent a second time', async () => {
    const queue = await adb.collection('orders').where('status', '==', 'CANCELLED').where('paymentStatus', '==', 'REFUND_PENDING').get();
    assert.equal(queue.docs.filter((d) => d.id === order1.quote.checkoutId).length, 0);
    await sleep(500);
    assert.equal(fake.refundsFor(order1.paid.payment.id).length, 1);
  });
  await step('staff pressing Refund on an already refunded order is a harmless no-op', async () => {
    const r = await staff.call('processRefund', { orderId: order1.quote.checkoutId });
    assert.equal(r.paymentStatus, 'REFUNDED');
    assert.equal(fake.refundsFor(order1.paid.payment.id).length, 1);
  });

  heading('4. The browser closes before the page returns: the webhook creates the order');
  await step('order.paid alone creates the order, takes stock once and counts nothing twice', async () => {
    const bob = client('bob');
    await bob.signUp('bob@example.test');
    const trip = await checkoutAndPay(bob, { productId: stock.drop, qty: 3, verify: false });
    const out = await trip.paid.sendOrderPaid();
    assert.deepEqual([out.status, out.body], [200, 'Processed']);
    const o = await bob.order(trip.orderId);
    assert.deepEqual([o.status, o.paymentStatus], ['PAYMENT_CONFIRMED', 'PAID']);
    assert.equal((await doc(`products/${stock.drop}`)).stock, 47);
    const late = await bob.call('verifyPayment', { checkoutId: trip.orderId, ...trip.paid.response });
    assert.equal(late.status, 'PAYMENT_CONFIRMED', 'the browser arriving late is told the order is confirmed');
    assert.equal((await doc(`products/${stock.drop}`)).stock, 47, 'still 47');
  });
  await step('a payment.authorized event on its own is ignored (only a captured payment creates an order)', async () => {
    const carol = client('carol');
    await carol.signUp('carol@example.test');
    const trip = await checkoutAndPay(carol, { productId: stock.drop, qty: 1, verify: false });
    const out = await fake.sendWebhook('payment.authorized', { payment: { entity: { id: trip.paid.payment.id, order_id: trip.quote.razorpayOrderId, amount: trip.paid.payment.amount, status: 'authorized', captured: false } } });
    assert.deepEqual([out.status, out.body], [200, 'Ignored']);
    assert.equal((await adb.doc(`orders/${trip.orderId}`).get()).exists, false);
  });

  heading('5. The last box sells out while two customers are paying');
  await step('one order is confirmed; the other is cancelled as a WHOLE order and refunded in full automatically', async () => {
    const d1 = client('dana');
    const d2 = client('eli');
    await d1.signUp('dana@example.test');
    await d2.signUp('eli@example.test');
    const t1 = await checkoutAndPay(d1, { productId: stock.rare, qty: 1, verify: false });
    const t2 = await checkoutAndPay(d2, { productId: stock.rare, qty: 1, verify: false });
    const [r1, r2] = await Promise.all([
      d1.call('verifyPayment', { checkoutId: t1.orderId, ...t1.paid.response }),
      d2.call('verifyPayment', { checkoutId: t2.orderId, ...t2.paid.response }),
    ]);
    const winners = [r1, r2].filter((r) => r.status === 'PAYMENT_CONFIRMED');
    const losers = [r1, r2].filter((r) => r.status === 'CANCELLED');
    assert.equal(winners.length, 1);
    assert.equal(losers.length, 1);
    assert.match(losers[0].message, /sold out while you were paying.*refunded/);
    assert.equal((await doc(`products/${stock.rare}`)).stock, 0, 'never below zero');
    const loser = losers[0].orderId === t1.orderId ? t1 : t2;
    await waitFor('the loser to be refunded', async () => (await doc(`orders/${loser.orderId}`)).paymentStatus === 'REFUNDED');
    const refunds = fake.refundsFor(loser.paid.payment.id);
    assert.equal(refunds.length, 1);
    assert.equal(refunds[0].amount, loser.paid.payment.amount, 'the whole order, not one item');
    assert.match((await doc(`orders/${loser.orderId}`)).cancelReason, /^Out of stock/);
  });

  heading('6. A promo code with one use left, two customers paying at once');
  await step('one gets the discount; the other is cancelled with a clear reason and refunded in full', async () => {
    const f1 = client('fay');
    const f2 = client('gus');
    await f1.signUp('fay@example.test');
    await f2.signUp('gus@example.test');
    // Both were quoted while the code still had a use left (preview and createCheckout only read the counter).
    const t1 = await checkoutAndPay(f1, { productId: stock.drop, qty: 1, promoCode: 'RUSH1', verify: false });
    const t2 = await checkoutAndPay(f2, { productId: stock.drop, qty: 1, promoCode: 'RUSH1', verify: false });
    const [r1, r2] = await Promise.all([
      f1.call('verifyPayment', { checkoutId: t1.orderId, ...t1.paid.response }),
      f2.call('verifyPayment', { checkoutId: t2.orderId, ...t2.paid.response }),
    ]);
    assert.equal([r1, r2].filter((r) => r.status === 'PAYMENT_CONFIRMED').length, 1);
    const losing = [r1, r2].find((r) => r.status === 'CANCELLED');
    assert.match(losing.message, /promo code reached its usage limit/);
    assert.equal((await doc('promoCodes/RUSH1')).usedCount, 1, 'never above the limit');
    const loser = losing.orderId === t1.orderId ? t1 : t2;
    await waitFor('the loser to be refunded', async () => (await doc(`orders/${loser.orderId}`)).paymentStatus === 'REFUNDED');
    assert.match((await doc(`orders/${loser.orderId}`)).cancelReason, /^Promo code limit/);
    assert.equal(fake.refundsFor(loser.paid.payment.id)[0].amount, loser.paid.payment.amount);
    const later = client('hal');
    await later.signUp('hal@example.test');
    const err = await refused(() => later.call('previewCheckout', { items: [{ productId: stock.drop, size: 'regular', qty: 1 }], pincode: '560012', tip: 0, promoCode: 'RUSH1' }));
    assert.equal(said(err), 'This promo code has reached its usage limit.');
  });

  heading('7. Razorpay refuses the refund: staff see why, retry, and the customer is refunded exactly once');
  await step('the failed automatic refund waits in the queue with its reason; Retry refund sends it; no double refund', async () => {
    const ivy = client('ivy');
    await ivy.signUp('ivy@example.test');
    const trip = await checkoutAndPay(ivy, { productId: stock.box, qty: 1 });
    fake.failNextRefund(400, 'The payment has not been captured');
    await ivy.call('cancelMyOrder', { orderId: trip.orderId, reason: 'Ordered by mistake' });
    // refundError is written twice within milliseconds: first Razorpay's own reason (shared/refunds.js), then the same reason
    // with "Razorpay did not accept the refund:" in front (autoRefund.js). Wait for the final text staff will see.
    const stuck = await waitFor('the refund error to be stored', async () => {
      const d = await doc(`orders/${trip.orderId}`);
      return /did not accept the refund/.test(d.refundError || '') ? d : null;
    });
    assert.match(stuck.refundError, /did not accept the refund: The payment has not been captured/);
    assert.equal(stuck.paymentStatus, 'REFUND_PENDING');
    assert.equal(stuck.refundPendingPaise, 0, 'nothing is reserved after a refusal');
    assert.equal(fake.refundsFor(trip.paid.payment.id).length, 0);

    const retry = await staff.call('processRefund', { orderId: trip.orderId, note: 'Retry after Razorpay fixed it' });
    assert.ok(retry.refundId, 'a Razorpay refund id is returned');
    await waitFor('REFUNDED', async () => (await doc(`orders/${trip.orderId}`)).paymentStatus === 'REFUNDED');
    const refunds = fake.refundsFor(trip.paid.payment.id);
    assert.equal(refunds.length, 1);
    const done = await doc(`orders/${trip.orderId}`);
    assert.equal(done.refundError, undefined, 'the error is cleared');
    assert.deepEqual(done.refundIds, [refunds[0].id]);
    assert.equal((await doc(`refunds/${trip.orderId}_full_1`)).status, 'FAILED');
    assert.equal((await doc(`refunds/${trip.orderId}_full_2`)).status, 'PROCESSED');
  });
  await step('a refund made by hand in the Razorpay dashboard is noticed (not paid twice)', async () => {
    const jo = client('jo');
    await jo.signUp('jo@example.test');
    const trip = await checkoutAndPay(jo, { productId: stock.box, qty: 1 });
    // The shop owner refunds in the dashboard BEFORE the system gets there: simulate by creating it at "Razorpay"
    // directly and letting the webhook tell the shop.
    fake.failNextRefund(500, 'Razorpay is having a problem'); // the automatic attempt hits an outage
    await jo.call('cancelMyOrder', { orderId: trip.orderId, reason: 'Other' });
    await waitFor('the outage to reach the shop', () => fake.log.some((l) => l.path.endsWith('/refund') && l.status === 500));
    await sleep(300); // let the shop record it
    const manual = await fetch(`http://127.0.0.1:${PORT}/v1/payments/${trip.paid.payment.id}/refund`, {
      method: 'POST',
      headers: { authorization: `Basic ${Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ amount: trip.paid.payment.amount }),
    });
    assert.equal(manual.status, 200);
    await waitFor('the dashboard refund to reach the order', async () => (await doc(`orders/${trip.orderId}`)).paymentStatus === 'REFUNDED');
    const refundsBefore = fake.refundsFor(trip.paid.payment.id).length;
    const r = await staff.call('processRefund', { orderId: trip.orderId });
    assert.equal(r.paymentStatus, 'REFUNDED');
    assert.equal(fake.refundsFor(trip.paid.payment.id).length, refundsBefore, 'pressing Refund afterwards sent nothing more');
    assert.equal(refundsBefore, 1);
  });

  heading('8. A guest places an order, then signs in to an existing account');
  await step('the guest\'s order moves to the account (claimGuestOrders), and the guest session can no longer see it', async () => {
    const existing = client('kim-account');
    const kim = await existing.signUp('kim@example.test');
    const guest = client('kim-guest');
    await guest.anonymous();
    const guestUid = guest.uid;
    const trip = await checkoutAndPay(guest, { productId: stock.box, qty: 1 });
    const guestToken = await guest.auth.currentUser.getIdToken();
    const moved = await existing.call('claimGuestOrders', { guestToken });
    assert.equal(moved.moved, 1);
    assert.equal((await doc(`orders/${trip.orderId}`)).uid, kim.uid);
    assert.notEqual(kim.uid, guestUid);
    assert.ok(await existing.order(trip.orderId), 'the account sees it');
  });

  heading('9. Local test checkout (what the website uses on a laptop)');
  await step('createMockOrder makes a test order and counts the promo use like a real one', async () => {
    const lee = client('lee');
    await lee.signUp('lee@example.test');
    await adb.doc('promoCodes/MOCKONCE').set({ type: 'flat', value: 20, min: 0, active: true, expiresAt: null, maxUsesPerUser: 1, usedCount: 0 });
    const data = { items: [{ productId: stock.box, size: 'regular', qty: 1 }], pincode: '560012', tip: 0, promoCode: 'MOCKONCE', address: 'Home: Flat 1, Test Road. Pincode: 560012', note: '' };
    const first = await lee.call('createMockOrder', data);
    assert.equal(first.paymentStatus, 'PAID_MOCK');
    assert.equal(first.pricing.discount, 20);
    const err = await refused(() => lee.call('createMockOrder', data));
    assert.match(err.message, /already used the code MOCKONCE/);
    assert.equal((await doc('promoCodes/MOCKONCE')).usedCount, 1);
  });

  // ---------- sign-off ----------
  heading('10. After all that');
  await step('no checkout left half-done and no negative stock anywhere', async () => {
    const products = await adb.collection('products').get();
    for (const p of products.docs) assert.ok(!(p.get('stock') < 0), `${p.id} has negative stock`);
  });
  await step('every webhook the shop was sent (including every refund event) was answered 200', async () => {
    const bad = fake.webhooks.filter((w) => w.status !== 200);
    assert.deepEqual(bad, []);
  });
  await step('no refund exists at "Razorpay" for a payment twice, and refunded amounts never exceed payments', async () => {
    for (const p of fake.payments.values()) {
      const rs = fake.refundsFor(p.id);
      assert.ok(rs.length <= 1, `payment ${p.id} has ${rs.length} refunds`);
      assert.ok(rs.reduce((n, r) => n + r.amount, 0) <= p.amount);
    }
  });
}

main()
  .catch((err) => {
    results.push({ section: 'crash', name: 'the rehearsal itself', ok: false, detail: err.stack || String(err) });
    console.error(err);
  })
  .finally(async () => {
    const failed = results.filter((r) => !r.ok);
    say(`\n${'='.repeat(60)}\nRehearsal: ${results.length - failed.length} of ${results.length} checks passed.`);
    if (failed.length) {
      say('FAILED:');
      for (const f of failed) say(`  - [${f.section}] ${f.name}\n      ${String(f.detail).split('\n')[0]}`);
    }
    say(`Fake Razorpay saw ${fake.log.length} API calls: ${fake.orders.size} orders, ${fake.refunds.length} refunds, ${fake.webhooks.length} webhooks sent.`);
    await Promise.allSettled(apps.map((a) => deleteApp(a)));
    await fake.stop().catch(() => {});
    process.exit(failed.length ? 1 : 0);
  });
