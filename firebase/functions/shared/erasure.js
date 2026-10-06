'use strict';

// DPDP data erasure: remove a customer's personal data WITHOUT breaking the books.
//
// Paid orders, refunds and the payment ledger are accounting records and must survive, so nothing financial is deleted.
// Instead the personal fields are overwritten with a fixed marker and the link to the person is cut:
//
//   KEPT, exactly as they were   items, pricing (subtotal, discount, fee, tip, total), status, paymentStatus, timestamps,
//                                the Razorpay order / payment / refund ids, the refund amounts, the zone and the pincode
//                                (an area code: with the address and uid gone it points at no one)
//   OVERWRITTEN                  address and delivery note ("[REDACTED - DPDP ERASURE]"), staff-typed cancellation text
//   LINK CUT                     `uid` (and `claimedFrom`) become a keyed hash: HMAC-SHA256(secret, uid). Only whoever holds
//                                the secret can ever connect an order to a person; the hash cannot be turned back into the
//                                uid, and no account has that uid any more, so no browser can read the order again.
//   DELETED                      the cart, the wishlist, the customer's rate-limit counters, and the Firebase Auth account
//                                (with the name, email, mobile number and provider links it holds)
//
// What this module does NOT reach, because it lives with other companies: Razorpay's own record of the payment, and Google's
// backups and logs. privacy.js says so.
//
// The order of the steps matters, because the job must be safe to run again after a failure and must never half-erase:
//   0. Refuse if an order is still being delivered or a payment may be in flight (the shop still needs the address).
//   1. Scrub the Excel copy in S3 (name, phone, address, note). If that fails, STOP here: nothing else has changed yet, and the
//      orders can still be found by uid for the next try.
//   2. Scrub everything that is found by uid or through the orders: promo use records, cart, wishlist, rate limits, feedback,
//      checkouts, refund reasons.
//   3. Last of the data: the orders themselves (their `uid` is the key every earlier step looks them up by, so they go last).
//   4. Write the audit entry, then delete the Auth account. If that fails the entry says so, and the customer can press the
//      button again: steps 1 to 3 find nothing left and only this step runs.
//
// Writes go in batches of up to 400 (Firestore allows 500 per batch or transaction), one after the other. Each batch only
// overwrites fields with fixed values, so repeating one is harmless.
//
// `erasureLog/{hash}` is the proof it happened: when, how many documents, and how the Excel and Auth steps went. It holds no
// personal data (the hash is the only identifier). Server-only: the security rules deny every client.

const crypto = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { FieldValue } = require('firebase-admin/firestore');
const { LIMITS } = require('./rateLimit');

const REDACTED = '[REDACTED - DPDP ERASURE]';

const BATCH_SIZE = 400;
const PAGE_SIZE = 400;
const MAX_DOCS = 5000; // a safety stop per collection; far above any real customer
const IN_QUERY_MAX = 30; // Firestore: at most 30 values in an `in` filter

// Statuses after which the shop no longer needs the delivery address.
const FINISHED = new Set(['DELIVERED', 'CANCELLED']);

// An unpaid checkout younger than this may still be about to be paid (the customer is in the Razorpay window).
const PAYMENT_WINDOW_MS = 2 * 60 * 60 * 1000;

const fail = (code, message) => new HttpsError(code, message);

// ---------- pure helpers ----------

// The one-way, keyed stand-in for a uid. The "erased_" prefix cannot be a Firebase uid, so it is plain on sight in the data.
function hashUid(uid, key) {
  if (typeof key !== 'string' || key.length < 32) throw fail('internal', 'Account erasure is not set up on this server yet.');
  return `erased_${crypto.createHmac('sha256', key).update(String(uid)).digest('hex').slice(0, 40)}`;
}

// Staff type their own cancellation reason (free text, which may mention the customer); the system's and the customer's come
// from fixed lists. Only the free text is overwritten.
const isStaffText = (order) => order.cancelledBy === 'staff' && typeof order.cancelReason === 'string' && order.cancelReason !== '';

// The fields to overwrite on one ORDER. Returns only fields that exist, so nothing is invented.
function orderScrub(order, hash, key, stamp) {
  const patch = { uid: hash, address: REDACTED, piiErasedAt: stamp };
  if (typeof order.note === 'string' && order.note !== '') patch.note = REDACTED;
  if (typeof order.claimedFrom === 'string' && order.claimedFrom !== '') patch.claimedFrom = hashUid(order.claimedFrom, key);
  if (isStaffText(order)) patch.cancelReason = REDACTED;
  // cancelMyOrder stamps `updatedBy` with the customer's own uid (their current one, or the guest uid they had when they
  // cancelled). A STAFF uid there is the business's own audit trail and stays.
  if (typeof order.updatedBy === 'string' && order.updatedBy !== '' && (order.updatedBy === order.uid || order.updatedBy === order.claimedFrom)) {
    patch.updatedBy = hashUid(order.updatedBy, key);
  }
  return patch;
}

// The same for one CHECKOUT (the priced quote a payment is made against; it carries the same address and note).
function checkoutScrub(checkout, hash, stamp) {
  const patch = { uid: hash, address: REDACTED, piiErasedAt: stamp };
  if (typeof checkout.note === 'string' && checkout.note !== '') patch.note = REDACTED;
  return patch;
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// ---------- reading ----------

// Every document of `collection` whose `field` equals `value`, a page at a time. Returns [{ ref, id, data }].
async function readAll(db, collection, field, value) {
  const found = [];
  let last = null;
  while (found.length < MAX_DOCS) {
    let q = db.collection(collection).where(field, '==', value).orderBy('__name__').limit(PAGE_SIZE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    for (const doc of snap.docs) found.push({ ref: doc.ref, id: doc.id, data: doc.data() });
    if (snap.size < PAGE_SIZE) break;
    last = snap.docs[snap.docs.length - 1];
  }
  return found;
}

// Refunds of the given orders (a refund names its order, not its customer).
async function readRefunds(db, orderIds) {
  const found = [];
  for (const ids of chunk(orderIds, IN_QUERY_MAX)) {
    const snap = await db.collection('refunds').where('orderId', 'in', ids).get();
    for (const doc of snap.docs) found.push({ ref: doc.ref, id: doc.id, data: doc.data() });
  }
  return found;
}

// ---------- the checks ----------

// Why erasure must wait, as a list of plain sentences (empty = go ahead).
function blockers(orders, checkouts, now) {
  const reasons = [];
  const active = orders.filter((o) => !FINISHED.has(o.data.status));
  if (active.length > 0) {
    reasons.push(`You have ${active.length === 1 ? 'an order' : `${active.length} orders`} still on the way. We need your address until ${active.length === 1 ? 'it is' : 'they are'} delivered or cancelled.`);
  }
  const paying = checkouts.filter((c) => c.data.status === 'CREATED' && now - (c.data.createdAt?.toMillis?.() ?? 0) < PAYMENT_WINDOW_MS);
  if (paying.length > 0) {
    reasons.push('A payment may still be in progress. Please wait a couple of hours, or finish or cancel it, and try again.');
  }
  return reasons;
}

// ---------- writing ----------

// Runs a list of { type: 'update' | 'set' | 'delete', ref, data } in batches. Returns how many were run.
async function runBatches(db, ops) {
  for (const group of chunk(ops, BATCH_SIZE)) {
    const batch = db.batch();
    for (const op of group) {
      if (op.type === 'delete') batch.delete(op.ref);
      else if (op.type === 'set') batch.set(op.ref, op.data);
      else batch.update(op.ref, op.data);
    }
    await batch.commit();
  }
  return ops.length;
}

// The per-customer promo use records are keyed by uid (promoCodes/{code}/uses/{uid}). They keep their counts (so a code's
// usage stays right) under the hash instead.
async function promoUseOps(db, uid, hash, codes) {
  const ops = [];
  for (const code of codes) {
    const from = db.doc(`promoCodes/${code}/uses/${uid}`);
    const snap = await from.get();
    if (!snap.exists) continue;
    ops.push({ type: 'set', ref: db.doc(`promoCodes/${code}/uses/${hash}`), data: { ...snap.data(), uid: hash } });
    ops.push({ type: 'delete', ref: from });
  }
  return ops;
}

// The counters behind the rate limits are keyed by uid: "rateLimits/<bucket>__uid__<uid>". Deleting a missing one is harmless.
const rateLimitOps = (db, uid) => Object.keys(LIMITS).map((bucket) => ({ type: 'delete', ref: db.doc(`rateLimits/${bucket}__uid__${uid}`) }));

// ---------- the job ----------

// Erases one customer. Returns a summary of what was done (counts only, no personal data).
//   db        Firestore (Admin SDK)
//   auth      Firebase Auth (Admin SDK): only deleteUser(uid) is used
//   uid       the customer
//   key       the secret behind hashUid (ERASURE_HASH_KEY)
//   scrubExcel   optional async (orderIds) => 'DONE' | 'SKIPPED_NOT_CONFIGURED'; throws if the sheet could not be scrubbed
//   now       the clock, for tests
async function eraseUserData(db, { uid, auth, key, scrubExcel, now = Date.now() }) {
  if (typeof uid !== 'string' || uid === '') throw fail('unauthenticated', 'Please sign in.');
  const hash = hashUid(uid, key); // also checks the key is set, before anything is read or changed

  // 0. What is there, and may it go now?
  const [orders, checkouts] = await Promise.all([readAll(db, 'orders', 'uid', uid), readAll(db, 'checkouts', 'uid', uid)]);
  const reasons = blockers(orders, checkouts, now);
  if (reasons.length > 0) throw fail('failed-precondition', reasons.join(' '));

  const log = db.doc(`erasureLog/${hash}`);
  await log.set({ state: 'IN_PROGRESS', startedAt: FieldValue.serverTimestamp() }, { merge: true });

  // 1. The Excel copy first: if S3 is unreachable we stop with everything still findable.
  let excel = 'NOT_NEEDED';
  if (orders.length > 0 && scrubExcel) {
    try {
      excel = await scrubExcel(orders.map((o) => o.id));
    } catch {
      await log.set({ state: 'FAILED_EXCEL', failedAt: FieldValue.serverTimestamp() }, { merge: true });
      throw fail('unavailable', 'We could not finish erasing your data just now. Nothing was lost: please try again in a few minutes.');
    }
  }

  // 2. Everything found by uid or through the orders.
  const stamp = FieldValue.serverTimestamp();
  const feedback = await readAll(db, 'feedback', 'uid', uid);
  const refunds = orders.length > 0 ? await readRefunds(db, orders.map((o) => o.id)) : [];
  const staffTextOrders = new Set(orders.filter((o) => isStaffText(o.data)).map((o) => o.id));
  // A refund only holds free text when staff typed the reason for the cancellation it belongs to.
  const staffRefunds = refunds.filter((r) => staffTextOrders.has(r.data.orderId) && typeof r.data.reason === 'string' && r.data.reason !== '');
  const codes = new Set([...orders, ...checkouts].map((d) => d.data.promo?.code).filter((c) => typeof c === 'string' && c !== ''));

  const sideOps = [
    ...(await promoUseOps(db, uid, hash, codes)),
    ...rateLimitOps(db, uid),
    { type: 'delete', ref: db.doc(`carts/${uid}`) },
    { type: 'delete', ref: db.doc(`wishlists/${uid}`) },
    ...feedback.map((f) => ({
      type: 'update',
      ref: f.ref,
      data: { uid: hash, ...(typeof f.data.comment === 'string' && f.data.comment !== '' ? { comment: REDACTED } : {}), piiErasedAt: stamp },
    })),
    ...checkouts.map((c) => ({ type: 'update', ref: c.ref, data: checkoutScrub(c.data, hash, stamp) })),
    ...staffRefunds.map((r) => ({ type: 'update', ref: r.ref, data: { reason: REDACTED, piiErasedAt: stamp } })),
  ];
  await runBatches(db, sideOps);

  // 3. The orders last (their uid is how every step above finds them again after a failure).
  await runBatches(db, orders.map((o) => ({ type: 'update', ref: o.ref, data: orderScrub(o.data, hash, key, stamp) })));

  // 4. The audit entry, then the account. Nothing personal is in the entry.
  const counts = { orders: orders.length, checkouts: checkouts.length, feedback: feedback.length, refundsTouched: staffRefunds.length };
  await log.set({ state: 'DATA_ERASED', dataErasedAt: FieldValue.serverTimestamp(), counts, excel }, { merge: true });
  try {
    await auth.deleteUser(uid);
  } catch (err) {
    if (err?.code !== 'auth/user-not-found') {
      await log.set({ state: 'FAILED_AUTH', failedAt: FieldValue.serverTimestamp() }, { merge: true });
      throw fail('unavailable', 'Your data was erased, but we could not close your account just now. Please press the button again.');
    }
  }
  await log.set({ state: 'COMPLETED', completedAt: FieldValue.serverTimestamp() }, { merge: true });

  return { erased: true, ...counts, excel };
}

module.exports = { REDACTED, FINISHED, PAYMENT_WINDOW_MS, hashUid, orderScrub, checkoutScrub, blockers, eraseUserData };
