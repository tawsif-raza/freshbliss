'use strict';

// updateOrderStatus
// How staff move an order forward (Preparing, Packed, Out for delivery, Delivered).
//
// Why a function and not a direct Firestore write: the security rules let NO
// client change an order, staff included. That is deliberate: status is money
// and trust, so only the server may change it, and only along the allowed path.
// This function is that path. It checks three things:
//   1. the caller is signed in and carries the `staff` claim
//   2. the order exists and is on the normal delivery line (not cancelled)
//   3. the new status is exactly the NEXT step
//
// Writing the order document is what makes the customer's tracking page update:
// it listens to the order with Firestore onSnapshot.

const crypto = require('node:crypto');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { callableOptions } = require('./shared/hardening');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { ORDER_FLOW, nextStatus, cleanRider } = require('./shared/orderStatus');
const { requireStaff } = require('./shared/staff');

const SAFE_ID = /^[A-Za-z0-9_-]{1,100}$/;

const fail = (code, message) => new HttpsError(code, message);

// Moves one order one step forward. Safe to repeat: asking for the status the
// order is already in (a double click) changes nothing and succeeds.
async function advanceOrder(db, { orderId, status, rider, staffUid }) {
  const ref = db.doc(`orders/${orderId}`);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw fail('not-found', 'We could not find that order.');

    const current = snap.get('status');
    if (current === status) return { orderId, status, replay: true };

    const expected = nextStatus(current);
    if (!expected) throw fail('failed-precondition', `This order is ${current} and cannot be moved.`);
    if (status !== expected) {
      throw fail('failed-precondition', `This order is ${current}. The next step is ${expected}.`);
    }

    // Check the rider details BEFORE writing anything.
    const riderDetails = status === 'OUT_FOR_DELIVERY' ? cleanRider(rider) : null;

    const now = FieldValue.serverTimestamp();
    const changes = {
      status,
      updatedAt: now,
      updatedBy: staffUid,
      [`timestamps.${status}`]: now, // "timestamps.PREPARING" sets just that entry
    };

    if (riderDetails) {
      changes.rider = riderDetails;
      // 4-digit delivery code the customer reads out to the rider.
      changes.pin = String(crypto.randomInt(1000, 10000));
    }

    tx.update(ref, changes);
    return { orderId, status, replay: false };
  });
}

exports.updateOrderStatus = onCall(callableOptions(), async (request) => {
  const staffUid = requireStaff(request); // signed in AND carries the server-set `staff` claim

  const { orderId, status, rider } = request.data || {};
  if (typeof orderId !== 'string' || !SAFE_ID.test(orderId)) throw fail('invalid-argument', 'Missing order.');
  // The first status (PAYMENT_CONFIRMED) is only ever set by payment, never by hand.
  if (!ORDER_FLOW.slice(1).includes(status)) throw fail('invalid-argument', 'That is not a status you can set.');

  return advanceOrder(getFirestore(), { orderId, status, rider, staffUid });
});

// Exported so the tests can call it without the function wrapper.
exports.advanceOrder = advanceOrder;
