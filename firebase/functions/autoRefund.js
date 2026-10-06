'use strict';

// autoRefund
// The moment an order becomes CANCELLED with paymentStatus REFUND_PENDING (the customer or staff cancelled it, or the last
// box sold out while they were paying), this sends the refund to Razorpay. Nobody has to press anything.
//
// It acts only on the CHANGE into that state, never on later edits of the same order, so a refund that Razorpay rejected is
// not retried in a loop: it stays in the staff "Needs refund" queue with the reason, and staff press "Refund" to try again.
//
// The result (Razorpay refund id, status, PARTIALLY_REFUNDED / REFUNDED) is written by shared/refunds.js; Razorpay's
// refund.processed / refund.failed webhooks finish the story (razorpayWebhook.js).

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { requestRefund } = require('./shared/refunds');
const { AUTO_REFUNDS, RAZORPAY_KEY_SECRET, makeClient } = require('./shared/refundConfig');

const REGION = 'asia-south1';

// True when this write is the order entering "cancelled, refund pending".
const startsRefund = (before, after) =>
  after?.status === 'CANCELLED' && after?.paymentStatus === 'REFUND_PENDING' && !(before?.status === 'CANCELLED' && before?.paymentStatus === 'REFUND_PENDING');

async function refundIfNeeded(db, client, { orderId, before, after }) {
  if (!startsRefund(before, after)) return { skipped: 'not a new refund' };
  if (!after.payment?.razorpayPaymentId || after.payment?.mock) return { skipped: 'no real payment' };
  try {
    const result = await requestRefund(db, client, { orderId, requestedBy: 'system', reason: after.cancelReason });
    logger.info('Automatic refund started', { orderId, refundId: result.refundId, status: result.refundStatus });
    return result;
  } catch (err) {
    // Never throw: the staff queue is the safety net, and a thrown error would only make Firestore replay the event.
    logger.error('Automatic refund did not go through', { orderId, code: err.code, detail: err.message });
    await db.doc(`orders/${orderId}`).update({ refundError: err.message || 'The automatic refund failed.', updatedAt: FieldValue.serverTimestamp() }).catch(() => {});
    return { error: err.message };
  }
}

exports.autoRefund = onDocumentWritten({ document: 'orders/{orderId}', region: REGION, secrets: [RAZORPAY_KEY_SECRET] }, async (event) => {
  if (!AUTO_REFUNDS.value()) return;
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!startsRefund(before, after)) return;
  await refundIfNeeded(getFirestore(), makeClient(), { orderId: event.params.orderId, before, after });
});

// Exported so the tests can call them without the trigger.
exports.refundIfNeeded = refundIfNeeded;
exports.startsRefund = startsRefund;
