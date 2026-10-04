'use strict';

// Refunds: sending money back through Razorpay, and keeping the order in step with what Razorpay says.
//
// Three pieces, all here so the paths cannot drift apart:
//   createRazorpayClient   the two Razorpay calls we need (create a refund, list a payment's refunds)
//   requestRefund          reserve the amount in Firestore, ask Razorpay, record the answer
//   applyRefundEntity      record what Razorpay says about ONE refund (from the API reply, the webhook, or a sync)
//
// Callers: autoRefund (a cancelled order starts its refund by itself), processRefund (staff: retry, check status, or a
// partial refund), and razorpayWebhook (refund.created / refund.processed / refund.failed).
//
// ---------------------------------------------------------------------------
// The records
// ---------------------------------------------------------------------------
// refunds/{key}  one document per refund, server-only (rules deny clients). It is the audit trail:
//   orderId, razorpayPaymentId, razorpayRefundId, amountPaise, kind ('full' | 'partial' | 'dashboard'),
//   status, requestedBy ('system' | a staff uid | 'razorpay'), reason, failureReason, timestamps.
//   status:  REQUESTED  we reserved the amount and are asking Razorpay (or do not know whether it heard us)
//            PENDING    Razorpay accepted it and is processing it
//            PROCESSED  done, the money is on its way to the customer's bank (final)
//            FAILED     Razorpay refused or could not complete it (final; the money was NOT sent)
//
// orders/{id}, extra fields:
//   refundedPaise        total Razorpay has PROCESSED
//   refundPendingPaise   total reserved or in flight, so two refunds cannot together exceed the payment
//   refundIds            every Razorpay refund id, for auditing
//   refundError          why the last attempt failed (cleared by the next success)
//   refundAlert          set when a refund hits an order that is still active; a human must look
//   paymentStatus        REFUND_PENDING -> REFUNDED, or PARTIALLY_REFUNDED (a delivered order refunded in part)
//
// ---------------------------------------------------------------------------
// Why this cannot refund twice
// ---------------------------------------------------------------------------
//  1. The amount is reserved in a Firestore transaction BEFORE Razorpay is called, so a second request sees it.
//  2. Every refund has a fixed key (refunds/{key}); the Razorpay call carries the same key in the
//     X-Refund-Idempotency header, so a retry after a timeout returns the original refund instead of making another.
//  3. Replies are applied once: a refund already PROCESSED or FAILED is never changed again, so the API reply, the
//     webhook and a sync can arrive in any order.

const { HttpsError } = require('firebase-functions/v2/https');
const { FieldValue } = require('firebase-admin/firestore');

const API = 'https://api.razorpay.com/v1';
const TERMINAL = new Set(['PROCESSED', 'FAILED']);
const KEY = /^[A-Za-z0-9_-]{10,100}$/; // Razorpay: at least 10 characters, letters, digits, hyphen, underscore
const SAFE_ID = /^[A-Za-z0-9_-]{1,100}$/;

const fail = (code, message) => new HttpsError(code, message);

// ---------- the Razorpay calls ----------

// `fetchImpl` is injectable so tests never touch the network. Errors carry:
//   retryable  true when we cannot tell whether Razorpay acted (network, timeout, 5xx, 429), so the SAME key must be reused
//   message    Razorpay's own description when it gave one
function createRazorpayClient({ keyId, keySecret, fetchImpl = globalThis.fetch }) {
  const auth = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;

  async function call(method, path, { body, headers } = {}) {
    let res;
    try {
      res = await fetchImpl(`${API}${path}`, {
        method,
        headers: { Authorization: auth, 'Content-Type': 'application/json', ...headers },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20000),
      });
    } catch (err) {
      throw Object.assign(new Error('Could not reach Razorpay.'), { retryable: true, cause: err });
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      // not JSON: handled below
    }
    if (!res.ok) {
      const message = data?.error?.description || `Razorpay answered ${res.status}.`;
      throw Object.assign(new Error(message), { retryable: res.status >= 500 || res.status === 429, statusCode: res.status });
    }
    return data;
  }

  return {
    // Normal-speed refund (free; the customer's bank takes a few days). Same key + same body returns the original refund.
    createRefund: (paymentId, { amountPaise, notes }, idempotencyKey) =>
      call('POST', `/payments/${encodeURIComponent(paymentId)}/refund`, {
        body: { amount: amountPaise, speed: 'normal', notes },
        headers: { 'X-Refund-Idempotency': idempotencyKey },
      }),
    // Every refund on a payment, including ones made in the Razorpay dashboard.
    listRefunds: async (paymentId) => (await call('GET', `/payments/${encodeURIComponent(paymentId)}/refunds?count=100`)).items || [],
  };
}

// ---------- small helpers ----------

const statusOf = (razorpayStatus) => (razorpayStatus === 'processed' ? 'PROCESSED' : razorpayStatus === 'failed' ? 'FAILED' : 'PENDING');

// What is still owed on this order, in paise.
const remainingPaise = (order) => (order.payment?.amountPaise || 0) - (order.refundedPaise || 0) - (order.refundPendingPaise || 0);

// The paymentStatus after `refundedPaise` has been processed.
function paymentStatusAfter(order, refundedPaise) {
  if (refundedPaise >= order.payment.amountPaise) return 'REFUNDED';
  // A cancelled order is owed the rest too, so it stays in the "needs refund" queue until it is all back.
  return order.status === 'CANCELLED' ? 'REFUND_PENDING' : 'PARTIALLY_REFUNDED';
}

// ---------- recording what Razorpay says ----------

// Applies one Razorpay refund entity ({ id, payment_id, amount, status, notes, ... }) to Firestore. Safe to repeat and to
// run out of order. `key` is our refund key when known; otherwise it is read from the entity's notes; a refund made in the
// Razorpay dashboard has neither and is recorded under "rp_<refund id>".
// Returns { applied, orderId, status, paymentStatus } or { unknown: true } when no order owns the payment.
async function applyRefundEntity(db, entity, { key } = {}) {
  const paymentId = entity?.payment_id;
  // `id` is missing only when we record our own refused request (status 'failed', no refund was ever created).
  if (!paymentId || (!entity.id && !key)) throw fail('invalid-argument', 'That refund could not be read.');

  let refundKey = key || (KEY.test(entity.notes?.refundKey || '') ? entity.notes.refundKey : null);
  if (!refundKey) {
    // Not one of ours by note. It may still be ours (notes can be dropped); otherwise it came from the dashboard.
    const known = await db.collection('refunds').where('razorpayRefundId', '==', entity.id).limit(1).get();
    refundKey = known.empty ? `rp_${entity.id}` : known.docs[0].id;
  }
  const refundRef = db.doc(`refunds/${refundKey}`);

  // The order: from our own record if there is one, otherwise from the payment id.
  let orderId = (await refundRef.get()).get('orderId');
  if (!orderId) {
    const owner = await db.collection('orders').where('payment.razorpayPaymentId', '==', paymentId).limit(1).get();
    if (owner.empty) return { unknown: true };
    orderId = owner.docs[0].id;
  }
  const orderRef = db.doc(`orders/${orderId}`);

  return db.runTransaction(async (tx) => {
    const [refundSnap, orderSnap] = await Promise.all([tx.get(refundRef), tx.get(orderRef)]);
    if (!orderSnap.exists) return { unknown: true };
    const order = orderSnap.data();

    const prev = refundSnap.exists ? refundSnap.get('status') : null;
    if (TERMINAL.has(prev)) return { applied: false, orderId, status: prev, paymentStatus: order.paymentStatus };

    const next = statusOf(entity.status);
    const amount = Number.isInteger(entity.amount) ? entity.amount : refundSnap.get('amountPaise');
    const reserved = refundSnap.exists && refundSnap.get('reserved') === true;
    const reservedAmount = reserved ? refundSnap.get('amountPaise') : 0;
    const now = FieldValue.serverTimestamp();

    const refundDoc = {
      orderId,
      razorpayPaymentId: paymentId,
      amountPaise: amount,
      status: next,
      speed: entity.speed_processed || entity.speed_requested || null,
      updatedAt: now,
    };
    if (entity.id) refundDoc.razorpayRefundId = entity.id;
    if (!refundSnap.exists) {
      // Made outside this code (the Razorpay dashboard). While in flight it counts against what is left to refund.
      Object.assign(refundDoc, { kind: 'dashboard', requestedBy: 'razorpay', reserved: next === 'PENDING', createdAt: now });
    }
    if (next === 'PROCESSED') refundDoc.processedAt = now;
    if (next === 'FAILED') refundDoc.failureReason = entity.failure_reason || entity.error_description || 'Razorpay could not complete this refund.';
    tx.set(refundRef, refundDoc, { merge: true });

    const orderUpdate = { updatedAt: now };
    if (entity.id) Object.assign(orderUpdate, { refundIds: FieldValue.arrayUnion(entity.id), lastRefundId: entity.id });
    let paymentStatus = order.paymentStatus;

    if (next === 'PROCESSED') {
      const refunded = (order.refundedPaise || 0) + amount;
      paymentStatus = paymentStatusAfter(order, refunded);
      Object.assign(orderUpdate, {
        refundedPaise: refunded,
        refundPendingPaise: Math.max(0, (order.refundPendingPaise || 0) - reservedAmount),
        paymentStatus,
        refundedAt: now,
        refundError: FieldValue.delete(),
      });
      // Money went back on an order that is still being fulfilled (for example Razorpay auto-refunded an uncaptured
      // payment, or someone refunded in the dashboard). Do not touch the order; tell a human.
      if (paymentStatus === 'REFUNDED' && order.status !== 'CANCELLED') {
        orderUpdate.refundAlert = 'The payment was refunded in full but this order is not cancelled.';
      }
    } else if (next === 'FAILED') {
      Object.assign(orderUpdate, {
        refundPendingPaise: Math.max(0, (order.refundPendingPaise || 0) - reservedAmount),
        refundError: refundDoc.failureReason,
      });
    } else if (!refundSnap.exists) {
      // A dashboard refund still in flight: remember it so a second one cannot be started on top of it.
      orderUpdate.refundPendingPaise = (order.refundPendingPaise || 0) + amount;
    }

    tx.update(orderRef, orderUpdate);
    return { applied: true, orderId, status: next, paymentStatus };
  });
}

// Pulls every refund Razorpay has for the order's payment into Firestore. This is how a refund made in the dashboard (or
// one whose webhook we missed) gets noticed. Returns how many refunds it looked at.
async function syncOrderRefunds(db, client, orderId) {
  const paymentId = (await db.doc(`orders/${orderId}`).get()).get('payment.razorpayPaymentId');
  if (!paymentId) return 0;
  const items = await client.listRefunds(paymentId);
  for (const entity of items) await applyRefundEntity(db, entity);
  return items.length;
}

// ---------- asking for a refund ----------

// Starts (or resumes) a refund and returns what happened.
//   amountPaise   omitted = refund everything still owed (a cancelled order); given = a partial refund of a delivered order
//   requestId     required with amountPaise: the staff screen's id for this one request, so pressing the button twice is one refund
//   requestedBy   'system' or a staff uid
async function requestRefund(db, client, { orderId, amountPaise, requestId, requestedBy, reason }) {
  const partial = amountPaise !== undefined && amountPaise !== null;
  if (partial && (!Number.isInteger(amountPaise) || amountPaise < 100)) throw fail('invalid-argument', 'Enter a refund of at least ₹1.');
  if (partial && !(typeof requestId === 'string' && SAFE_ID.test(requestId) && requestId.length <= 40)) throw fail('invalid-argument', 'Missing request id.');

  const orderRef = db.doc(`orders/${orderId}`);

  // 1. Reserve the amount. Nothing leaves the account in this step.
  const plan = await db.runTransaction(async (tx) => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) throw fail('not-found', 'We could not find that order.');
    const order = orderSnap.data();

    const paymentId = order.payment?.razorpayPaymentId;
    if (!paymentId || order.payment?.mock || !Number.isInteger(order.payment?.amountPaise)) {
      throw fail('failed-precondition', 'This order has no Razorpay payment to refund.');
    }
    if (order.paymentStatus === 'REFUNDED') return { done: true, orderId, paymentStatus: 'REFUNDED', replay: true };

    if (partial) {
      if (order.status === 'CANCELLED') throw fail('failed-precondition', 'A cancelled order is refunded in full, not in part.');
      if (!['PAID', 'PARTIALLY_REFUNDED'].includes(order.paymentStatus)) throw fail('failed-precondition', 'This order cannot be refunded right now.');
    } else if (order.status !== 'CANCELLED' || order.paymentStatus !== 'REFUND_PENDING') {
      throw fail('failed-precondition', 'Only a cancelled order with a pending refund can be refunded.');
    }

    // Which refund is this? A full refund resumes the one in flight, if any; after a FAILED one it gets a fresh key
    // (Razorpay would hand back the old failed refund for the old key).
    let key;
    let existing = null;
    if (partial) {
      key = `${orderId}_p_${requestId}`;
    } else if (order.activeRefundKey) {
      const active = await tx.get(db.doc(`refunds/${order.activeRefundKey}`));
      if (active.exists && !TERMINAL.has(active.get('status'))) {
        key = order.activeRefundKey;
        existing = active;
      }
    }
    if (!key && !partial) key = `${orderId}_full_${(order.refundAttempts || 0) + 1}`;
    if (!KEY.test(key)) throw fail('invalid-argument', 'That order id cannot be refunded automatically.');

    const refundRef = db.doc(`refunds/${key}`);
    existing = existing || (await tx.get(refundRef));
    if (existing.exists) {
      const data = existing.data();
      if (data.status === 'FAILED') throw fail('failed-precondition', data.failureReason || 'That refund failed. Start a new one.');
      return { key, orderId, paymentId, amountPaise: data.amountPaise, status: data.status, replay: true };
    }

    const amount = partial ? amountPaise : remainingPaise(order);
    if (amount <= 0) throw fail('failed-precondition', 'A refund for this order is already on its way.');
    if (amount > remainingPaise(order)) throw fail('invalid-argument', 'That is more than is left to refund on this order.');

    const now = FieldValue.serverTimestamp();
    tx.create(refundRef, {
      orderId,
      razorpayPaymentId: paymentId,
      amountPaise: amount,
      kind: partial ? 'partial' : 'full',
      status: 'REQUESTED',
      reserved: true,
      requestedBy,
      reason: reason || null,
      createdAt: now,
      updatedAt: now,
    });
    tx.update(orderRef, {
      refundPendingPaise: (order.refundPendingPaise || 0) + amount,
      refundError: FieldValue.delete(),
      ...(partial ? {} : { activeRefundKey: key, refundAttempts: (order.refundAttempts || 0) + 1 }),
      updatedAt: now,
    });
    return { key, orderId, paymentId, amountPaise: amount, status: 'REQUESTED', replay: false };
  });

  if (plan.done) return plan;
  if (plan.status !== 'REQUESTED') {
    // Already with Razorpay (pending): nothing to send.
    const order = (await orderRef.get()).data();
    return { orderId, refundKey: plan.key, refundStatus: plan.status, paymentStatus: order.paymentStatus, replay: true };
  }

  // 2. Ask Razorpay. The key makes a retry safe even if we never saw the first reply.
  let entity;
  try {
    entity = await client.createRefund(
      plan.paymentId,
      { amountPaise: plan.amountPaise, notes: { refundKey: plan.key, orderId, reason: (reason || '').slice(0, 200) } },
      plan.key,
    );
  } catch (err) {
    if (err.retryable) {
      // Unknown whether Razorpay acted. Leave it REQUESTED (amount stays reserved); trying again reuses the same key.
      await db.doc(`refunds/${plan.key}`).update({ lastError: err.message, updatedAt: FieldValue.serverTimestamp() });
      throw fail('unavailable', 'We could not reach Razorpay. Nothing was lost: try again in a minute.');
    }
    // Razorpay said no. Release the reservation and show staff why.
    await applyRefundEntity(db, { payment_id: plan.paymentId, status: 'failed', amount: plan.amountPaise, failure_reason: err.message }, { key: plan.key });
    throw fail('failed-precondition', `Razorpay did not accept the refund: ${err.message}`);
  }

  // 3. Record the answer.
  const result = await applyRefundEntity(db, entity, { key: plan.key });
  return { orderId, refundKey: plan.key, refundId: entity.id, refundStatus: result.status, paymentStatus: result.paymentStatus, replay: false };
}

module.exports = { createRazorpayClient, requestRefund, applyRefundEntity, syncOrderRefunds, remainingPaise, statusOf };
