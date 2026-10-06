'use strict';

// processRefund
// Staff-only. Three jobs on one button, all of them safe to repeat:
//   - RETRY / CHECK a cancelled order's refund: asks Razorpay what it has for the payment (so a refund made in the Razorpay
//     dashboard, or one whose webhook we missed, is noticed), then sends whatever is still owed.
//   - PARTIAL refund of a delivered order (a damaged or missing box): pass `amount` in rupees.
//   - Both show the result: the order's paymentStatus becomes REFUNDED, or PARTIALLY_REFUNDED, and the Razorpay refund id is
//     stored (orders.refundIds, and one document per refund in `refunds`).
//
// Money really moves here. The reservation and idempotency rules that stop a double refund are in shared/refunds.js.
// Like every order change it is staff-only, because the security rules block all client writes to orders and refunds.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');
const { callableOptions } = require('./shared/hardening');
const { requireStaff } = require('./shared/staff');
const { requestRefund, syncOrderRefunds } = require('./shared/refunds');
const { RAZORPAY_KEY_SECRET, makeClient } = require('./shared/refundConfig');

const SAFE_ID = /^[A-Za-z0-9_-]{1,100}$/;

const fail = (code, message) => new HttpsError(code, message);

// The function body without the HTTP wrapper, so tests can pass a fake Razorpay client.
async function processRefundFor(db, client, { orderId, amountRupees, requestId, note, staffUid }) {
  const order = await db.doc(`orders/${orderId}`).get();
  if (!order.exists) throw fail('not-found', 'We could not find that order.');

  // Look at Razorpay first: anything already refunded there must be counted before we send more.
  await syncOrderRefunds(db, client, orderId).catch((err) => {
    if (!err.retryable) throw fail('failed-precondition', `Razorpay could not be checked: ${err.message}`);
    throw fail('unavailable', 'We could not reach Razorpay. Nothing was lost: try again in a minute.');
  });

  return requestRefund(db, client, {
    orderId,
    amountPaise: amountRupees === undefined ? undefined : amountRupees * 100,
    requestId,
    requestedBy: staffUid,
    reason: note || undefined,
  });
}

exports.processRefund = onCall(callableOptions({ secrets: [RAZORPAY_KEY_SECRET] }), async (request) => {
  const staffUid = requireStaff(request);

  const { orderId, amount, requestId } = request.data || {};
  const note = typeof request.data?.note === 'string' ? request.data.note.trim() : '';
  if (typeof orderId !== 'string' || !SAFE_ID.test(orderId)) throw fail('invalid-argument', 'Missing order.');
  if (note.length > 200) throw fail('invalid-argument', 'The note is too long (up to 200 characters).');
  if (amount !== undefined && (!Number.isInteger(amount) || amount < 1)) throw fail('invalid-argument', 'Enter a whole number of rupees.');

  return processRefundFor(getFirestore(), makeClient(), { orderId, amountRupees: amount, requestId, note, staffUid });
});

// Exported so the tests can call it without the function wrapper.
exports.processRefundFor = processRefundFor;
