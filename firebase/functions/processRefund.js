'use strict';

// processRefund
// Staff mark a cancelled order's refund as done: paymentStatus REFUND_PENDING -> REFUNDED.
//
// IMPORTANT: for now this only RECORDS a refund. It does not send any money.
// The refund has to be made in the Razorpay dashboard first (or, later, by the
// Razorpay Refund API, which will be called from here before the status change).
// Until then the dashboard tells staff exactly that.
//
// Like every order change, it is a staff-only function because the security
// rules block all client writes to orders.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { callableOptions } = require('./shared/hardening');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { requireStaff } = require('./shared/staff');

const SAFE_ID = /^[A-Za-z0-9_-]{1,100}$/;

const fail = (code, message) => new HttpsError(code, message);

// Marks one order refunded. Safe to repeat: an order that is already REFUNDED
// is left alone and reported as a repeat.
async function refundOrderTx(db, { orderId, note, staffUid }) {
  const ref = db.doc(`orders/${orderId}`);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw fail('not-found', 'We could not find that order.');

    const { status, paymentStatus } = snap.data();
    if (paymentStatus === 'REFUNDED') return { orderId, paymentStatus: 'REFUNDED', replay: true };
    if (status !== 'CANCELLED' || paymentStatus !== 'REFUND_PENDING') {
      throw fail('failed-precondition', 'Only a cancelled order with a pending refund can be refunded.');
    }

    const now = FieldValue.serverTimestamp();
    tx.update(ref, {
      paymentStatus: 'REFUNDED',
      refundedAt: now,
      refundedBy: staffUid,
      refundNote: note || null,
      updatedAt: now,
      updatedBy: staffUid,
    });
    return { orderId, paymentStatus: 'REFUNDED', replay: false };
  });
}

exports.processRefund = onCall(callableOptions(), async (request) => {
  const staffUid = requireStaff(request);

  const { orderId } = request.data || {};
  const note = typeof request.data?.note === 'string' ? request.data.note.trim() : '';
  if (typeof orderId !== 'string' || !SAFE_ID.test(orderId)) throw fail('invalid-argument', 'Missing order.');
  if (note.length > 200) throw fail('invalid-argument', 'The note is too long (up to 200 characters).');

  return refundOrderTx(getFirestore(), { orderId, note, staffUid });
});

// Exported so the tests can call it without the function wrapper.
exports.refundOrderTx = refundOrderTx;
