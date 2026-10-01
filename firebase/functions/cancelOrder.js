'use strict';

// cancelOrder
// Staff cancel an order (for example, a customer phones in). This starts the
// refund workflow: the order becomes CANCELLED with paymentStatus REFUND_PENDING,
// which puts it in the dashboard's "Needs refund" queue.
//
// Allowed from any step before DELIVERED. Only the server can do this (the
// security rules block all client writes to orders), so it is a staff-only function.
//
// Stock: when the customer paid, the boxes were taken out of stock. If the boxes
// were never made, they go back on the shelf. If they were already packed, the
// fruit exists and may not be reusable, so by default they are NOT returned;
// staff can override either way with `restock`.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { ORDER_FLOW } = require('./shared/orderStatus');
const { requireStaff } = require('./shared/staff');

const SAFE_ID = /^[A-Za-z0-9_-]{1,100}$/;
const CANCELLABLE = ORDER_FLOW.slice(0, -1); // every step before DELIVERED
const LAST_STEP_BEFORE_PACKING = ORDER_FLOW.indexOf('PREPARING');

const fail = (code, message) => new HttpsError(code, message);

// Cancels one order. Safe to repeat: an order that is already cancelled is left
// alone and reported as a repeat.
async function cancelOrderTx(db, { orderId, reason, restock, staffUid }) {
  const ref = db.doc(`orders/${orderId}`);

  return db.runTransaction(async (tx) => {
    // ===== READS =====
    const snap = await tx.get(ref);
    if (!snap.exists) throw fail('not-found', 'We could not find that order.');
    const order = snap.data();

    if (order.status === 'CANCELLED') return { orderId, status: 'CANCELLED', paymentStatus: order.paymentStatus, restocked: false, replay: true };
    if (!CANCELLABLE.includes(order.status)) throw fail('failed-precondition', 'A delivered order cannot be cancelled.');
    if (order.paymentStatus !== 'PAID') throw fail('failed-precondition', 'Only a paid order can be cancelled this way.');

    // Default: return stock only if the boxes were not packed yet.
    const shouldRestock = restock === undefined ? ORDER_FLOW.indexOf(order.status) <= LAST_STEP_BEFORE_PACKING : restock === true;

    let productSnaps = [];
    const wanted = new Map(); // productId -> total qty across sizes
    if (shouldRestock) {
      for (const i of order.items || []) wanted.set(i.productId, (wanted.get(i.productId) || 0) + i.qty);
      productSnaps = await tx.getAll(...[...wanted.keys()].map((id) => db.doc(`products/${id}`)));
    }

    // ===== WRITES =====
    const now = FieldValue.serverTimestamp();

    for (const p of productSnaps) {
      if (!p.exists) continue; // the box was deleted from the catalogue: nothing to put back
      const current = Number.isInteger(p.get('stock')) ? p.get('stock') : 0;
      tx.update(p.ref, { stock: current + wanted.get(p.id), updatedAt: now });
    }

    tx.update(ref, {
      status: 'CANCELLED',
      paymentStatus: 'REFUND_PENDING',
      cancelReason: reason,
      cancelledBy: 'staff',
      updatedAt: now,
      updatedBy: staffUid,
      'timestamps.CANCELLED': now,
    });

    return { orderId, status: 'CANCELLED', paymentStatus: 'REFUND_PENDING', restocked: shouldRestock, replay: false };
  });
}

exports.cancelOrder = onCall({ region: 'asia-south1' }, async (request) => {
  const staffUid = requireStaff(request);

  const { orderId, restock } = request.data || {};
  const reason = typeof request.data?.reason === 'string' ? request.data.reason.trim() : '';
  if (typeof orderId !== 'string' || !SAFE_ID.test(orderId)) throw fail('invalid-argument', 'Missing order.');
  if (reason.length < 3 || reason.length > 200) throw fail('invalid-argument', 'Give a reason (3 to 200 characters).');
  if (restock !== undefined && typeof restock !== 'boolean') throw fail('invalid-argument', 'Invalid stock option.');

  return cancelOrderTx(getFirestore(), { orderId, reason, restock, staffUid });
});

// Exported so the tests can call it without the function wrapper.
exports.cancelOrderTx = cancelOrderTx;
