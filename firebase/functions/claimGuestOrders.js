'use strict';

// claimGuestOrders
// A visitor orders as a GUEST (an anonymous Firebase account), then signs in with Google, Microsoft or their phone.
//
// Usually nothing needs doing here: the sign-in is LINKED to the guest account, the uid stays the same and the orders are
// already theirs. This function is for the other case: the Google/Microsoft/phone identity already belongs to an OLDER
// account, so the visitor ends up signed in as that account and the guest's orders would be left behind. The browser
// calls this right after, and the orders move over.
//
// Who may do what: the caller must be signed in with a real provider (not anonymous), and must hand over the guest's
// own ID token, which proves they control that guest account. The token is checked here (signature, expiry, and that it
// really is an anonymous account), so nobody can take orders by guessing a uid. Only `orders` change: `uid` is rewritten,
// and `claimedFrom` / `claimedAt` record where the order came from. Prices, status and payment are not touched.
//
// Safe to repeat: once the orders have moved there is nothing left under the guest uid, and the answer is 0.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { callableOptions } = require('./shared/hardening');
const { enforce } = require('./shared/rateLimit');

// One guest rarely has more than a handful of orders. A Firestore batch holds 500 writes; staying below leaves room.
const MAX_ORDERS = 400;

const fail = (code, message) => new HttpsError(code, message);

const providerOf = (token) => token?.firebase?.sign_in_provider;

// Decides whether this caller may take over this guest. `caller` and `guest` are decoded ID tokens.
// Throws an HttpsError with a message safe to show; returns the two uids.
function checkClaim(caller, guest) {
  if (!caller?.uid) throw fail('unauthenticated', 'Please sign in.');
  if (providerOf(caller) === 'anonymous') throw fail('failed-precondition', 'Sign in with Google, Microsoft or your phone first.');
  if (!guest?.uid || providerOf(guest) !== 'anonymous') throw fail('invalid-argument', 'That is not a guest session.');
  if (guest.uid === caller.uid) throw fail('invalid-argument', 'Those are the same account.');
  return { guestUid: guest.uid, customerUid: caller.uid };
}

// Moves every order of `guestUid` to `customerUid`. Returns how many moved.
async function claimOrders(db, { guestUid, customerUid }) {
  const snap = await db.collection('orders').where('uid', '==', guestUid).limit(MAX_ORDERS).get();
  if (snap.empty) return 0;
  const batch = db.batch();
  const now = FieldValue.serverTimestamp();
  for (const doc of snap.docs) batch.update(doc.ref, { uid: customerUid, claimedFrom: guestUid, claimedAt: now });
  await batch.commit();
  return snap.size;
}

exports.claimGuestOrders = onCall(callableOptions(), async (request) => {
  if (!request.auth) throw fail('unauthenticated', 'Please sign in.');
  const guestToken = request.data?.guestToken;
  if (typeof guestToken !== 'string' || guestToken.length < 20 || guestToken.length > 4096) throw fail('invalid-argument', 'Missing guest session.');

  const db = getFirestore();
  await enforce(db, request, 'claimGuestOrders');

  let guest;
  try {
    guest = await getAuth().verifyIdToken(guestToken);
  } catch {
    throw fail('invalid-argument', 'That guest session has expired.');
  }

  const { guestUid, customerUid } = checkClaim({ uid: request.auth.uid, ...request.auth.token }, guest);
  const moved = await claimOrders(db, { guestUid, customerUid });
  return { moved };
});

exports.checkClaim = checkClaim;
exports.claimOrders = claimOrders;
exports.MAX_ORDERS = MAX_ORDERS;
