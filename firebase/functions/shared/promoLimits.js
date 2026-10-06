'use strict';

// Promo usage limits: how many times a code may be used in total, and by one customer.
//
// On promoCodes/{CODE} (server-only; clients cannot read or write it):
//   globalMaxUses     the most times the code may be used across the whole shop. Missing/null = unlimited.
//   maxUsesPerUser    the most times ONE account (uid) may use it. Missing/null = unlimited. 1 = a welcome code.
//   requiresSignIn    true = only signed-in customers (Google, Microsoft or phone), not anonymous guests. Worth setting
//                     on any code with maxUsesPerUser: a guest is an anonymous account, and clearing the browser's data
//                     makes a new one, so a per-user limit alone does not stop a determined guest.
//   usedCount         kept by the server: how many orders have used the code. Never edit it by hand.
// and one document per customer who has used it:
//   promoCodes/{CODE}/uses/{uid}   { uid, code, count, orderIds, lastUsedAt }
//
// A limit of 0 means "used up". Anything that is not a whole number of 0 or more (a string, -1, 2.5) is a mistake in the
// data, and the code is REFUSED rather than treated as unlimited: a typo must never give away unlimited discounts.
//
// ---------------------------------------------------------------------------
// When a use is counted, and why it cannot be counted twice
// ---------------------------------------------------------------------------
// A use is counted when the order is CONFIRMED (payment verified), inside the same Firestore transaction that takes the
// stock and creates the order (shared/payments.js). Two checkouts racing for the last use are serialised by Firestore:
// the second one re-reads the counters, sees the limit reached and is cancelled for a refund (the money is returned by
// autoRefund), exactly like an item that sold out while paying. That transaction runs once per checkout (a checkout that
// is already PAID returns early), so a double click, a retried request or a webhook arriving together with the browser
// can never count a use twice.
//
// Before payment (previewCheckout and createCheckout) the same counters are only READ, so a customer who has used up their
// code is told straight away, politely, before they are asked for money. That early check is a courtesy; the transaction
// at confirmation is what enforces the limit.

const { HttpsError } = require('firebase-functions/v2/https');
const { FieldValue } = require('firebase-admin/firestore');

const fail = (code, message, details) => new HttpsError(code, message, details);

// 'unlimited' | 'invalid' | a number
function readLimit(value) {
  if (value === undefined || value === null) return 'unlimited';
  return Number.isInteger(value) && value >= 0 ? value : 'invalid';
}

// Why this customer may not use the code now, or null if they may.
//   promo   the promoCodes document (plus `code`)
//   usage   { usedCount, userUses }: the counters as read
// Returns { kind: 'config' | 'global' | 'user', message }.
function limitProblem(promo, { usedCount = 0, userUses = 0 } = {}) {
  const global = readLimit(promo.globalMaxUses);
  const perUser = readLimit(promo.maxUsesPerUser);
  if (global === 'invalid' || perUser === 'invalid') return { kind: 'config', message: 'That promo code is not valid.' };

  if (global !== 'unlimited' && (usedCount || 0) >= global) {
    return { kind: 'global', message: 'This promo code has reached its usage limit.' };
  }
  if (perUser !== 'unlimited' && (userUses || 0) >= perUser) {
    return {
      kind: 'user',
      message: perUser === 1 ? `You have already used the code ${promo.code}.` : `You have already used the code ${promo.code} the ${perUser} times it allows.`,
    };
  }
  return null;
}

// The error to throw before payment. `details.promoLimit` lets the checkout page drop the code and say why in the promo box.
const limitError = (problem) =>
  fail('failed-precondition', problem.message, problem.kind === 'config' ? undefined : { promoLimit: true });

const usesRef = (db, code, uid) => db.doc(`promoCodes/${code}/uses/${uid}`);

// How many times this customer has used the code. Only read when the code has a per-user limit.
async function readUserUses(reader, db, promo, uid) {
  if (!uid || readLimit(promo.maxUsesPerUser) === 'unlimited') return 0;
  const snap = await reader.get(usesRef(db, promo.code, uid));
  return snap.exists ? snap.get('count') || 0 : 0;
}

// For previewCheckout and createCheckout: refuse the code if it cannot be used by this customer. Read-only.
//   who   { uid, anonymous } from the request's auth token
async function assertPromoUsable(db, promo, who) {
  if (promo.requiresSignIn === true && who.anonymous) {
    throw fail('failed-precondition', 'Sign in to use this promo code.', { promoLimit: true, needsSignIn: true });
  }
  const userUses = await readUserUses({ get: (ref) => ref.get() }, db, promo, who.uid);
  const problem = limitProblem(promo, { usedCount: promo.usedCount, userUses });
  if (problem) throw limitError(problem);
}

const ignoreConfig = (problem) => (problem && problem.kind !== 'config' ? problem : null);

// Who is asking, from request.auth: the uid, and whether it is an anonymous guest account.
const whoIs = (auth) => ({ uid: auth?.uid, anonymous: auth?.token?.firebase?.sign_in_provider === 'anonymous' });

// Inside a transaction. Reads first (a transaction must read before it writes):
// returns what the counters say now, or null if the code has no limits (nothing to enforce or count).
async function readPromoClaim(tx, db, code, uid) {
  const promoRef = db.doc(`promoCodes/${code}`);
  const promoSnap = await tx.get(promoRef);
  // The code was deleted after the customer was quoted: honour the quote, there is no counter to keep.
  if (!promoSnap.exists) return null;
  const promo = { code, ...promoSnap.data() };
  const useSnap = await tx.get(usesRef(db, code, uid));
  return {
    promoRef,
    useRef: usesRef(db, code, uid),
    promo,
    // A code whose limits were mistyped AFTER the customer was quoted and paid is honoured (the 'config' problem is
    // ignored here): the customer paid what we quoted, and refusing now would only cost them a refund.
    problem: ignoreConfig(limitProblem(promo, { usedCount: promo.usedCount, userUses: useSnap.exists ? useSnap.get('count') || 0 : 0 })),
  };
}

// Inside the same transaction, after the reads: count one use.
function writePromoClaim(tx, claim, { uid, orderId }) {
  tx.update(claim.promoRef, { usedCount: FieldValue.increment(1) });
  tx.set(
    claim.useRef,
    { uid, code: claim.promo.code, count: FieldValue.increment(1), orderIds: FieldValue.arrayUnion(orderId), lastUsedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}

module.exports = { readLimit, limitProblem, assertPromoUsable, readPromoClaim, writePromoClaim, whoIs };
