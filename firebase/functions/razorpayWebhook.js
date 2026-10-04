'use strict';

// razorpayWebhook
// Razorpay's servers call this URL when a payment succeeds. It closes the gap
// that verifyPayment cannot: a customer who pays and then closes the tab, loses
// signal, or whose browser never reaches us. Razorpay still tells us, and we
// still create the order.
//
// Set up in the Razorpay dashboard (Settings > Webhooks), test mode:
//   URL:     <functions base>/razorpayWebhook   (needs a public URL; use a tunnel locally)
//   Secret:  any string you choose; put the SAME string in RAZORPAY_WEBHOOK_SECRET
//   Events:  order.paid, refund.created, refund.processed, refund.failed
//
// Security: the request is trusted ONLY if x-razorpay-signature equals
// HMAC-SHA256(RAZORPAY_WEBHOOK_SECRET, the raw request body). We check it before
// reading anything else, and we sign over the raw bytes, not a re-serialised copy.
//
// ---------------------------------------------------------------------------
// RACE CONDITIONS: what if the browser callback and the webhook arrive together?
// ---------------------------------------------------------------------------
// This is normal, not rare: Razorpay fires the webhook at about the same moment
// the customer's browser calls verifyPayment. Both end up in the same place,
// finalizeCheckout() -> confirmPayment() in shared/payments.js, working on the
// SAME checkout document. Nothing is double-counted because:
//
//  1. One transaction decides. confirmPayment reads the checkout, the products
//     and (on a replay) the order inside a Firestore transaction. Transactions
//     are serializable: if two overlap on the same documents, Firestore makes
//     one wait or retry until the other has committed.
//  2. The loser sees the winner's work. It re-reads the checkout, finds
//     status === 'PAID', and returns the existing order with `replay: true`.
//     It does not touch stock, the checkout or the order again.
//  3. A second lock on the order. The order id IS the checkout id and the
//     order is written with create(), which fails if it already exists. Even if
//     point 1 were somehow bypassed, a duplicate order cannot be written.
//  4. Repeat deliveries of the SAME event (Razorpay retries until it gets a 2xx)
//     are skipped up front using the paymentEvents ledger, keyed by the
//     x-razorpay-event-id header. This is only an optimisation. Points 1 to 3
//     are what guarantee correctness, so a lost ledger write is harmless.
//  5. Clearing the cart is idempotent (deleting a missing cart is a no-op), so
//     it does not matter that both callers do it.
//
// Result: exactly one order, stock decremented exactly once, whoever is first.
// ---------------------------------------------------------------------------
//
// Response codes matter. Razorpay retries any non-2xx for up to 24 hours:
//   400  bad signature or unreadable body (do not retry)
//   200  handled, or intentionally ignored (including "nothing to do")
//   500  something failed on OUR side, please retry

const { onRequest } = require('firebase-functions/v2/https');
const { HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const { defineSecret } = require('firebase-functions/params');
const { getFirestore } = require('firebase-admin/firestore');
const { FieldValue } = require('firebase-admin/firestore');
const { finalizeCheckout, hmacMatches } = require('./shared/payments');
const { applyRefundEntity } = require('./shared/refunds');

// Local: put it in functions/.secret.local  (RAZORPAY_WEBHOOK_SECRET=...)
const RAZORPAY_WEBHOOK_SECRET = defineSecret('RAZORPAY_WEBHOOK_SECRET');

// The event that means "this order was paid".
//
// Capture mode: "authorized" means the bank approved the payment, but the money is only taken ("captured") once Razorpay
// captures it. Razorpay refunds a payment that is never captured, so confirming an order on payment.authorized could ship
// fruit for money we never got. order.paid is sent only once the payment IS captured, so it is the only event we act on
// (and one that says captured:false is refused below). Keep Automatic capture on anyway (Dashboard > Account & Settings >
// Payment Capture): the browser callback (verifyPayment) fires at authorization, and docs/GO_LIVE.md section 6 makes
// checking this setting a launch step.
const HANDLED_EVENTS = new Set(['order.paid']);

// Refund events (Dashboard > Webhooks > tick these too). They keep the order's paymentStatus in step with Razorpay,
// whether the refund was sent by autoRefund, by staff, or made by hand in the dashboard.
const REFUND_EVENTS = new Set(['refund.created', 'refund.processed', 'refund.failed']);

const EVENT_ID = /^[A-Za-z0-9_-]{1,100}$/;
const RAZORPAY_ID = /^[A-Za-z0-9_]{1,60}$/;

// Pull the two ids we need out of the event, whichever shape it has.
//   order.paid:         payload.order.entity (the order) + payload.payment.entity
//   payment.authorized: payload.payment.entity, which carries order_id
function readEvent(event) {
  const payment = event && event.payload && event.payload.payment && event.payload.payment.entity;
  const order = event && event.payload && event.payload.order && event.payload.order.entity;
  const razorpayOrderId = event.event === 'order.paid' ? order && order.id : payment && payment.order_id;
  const razorpayPaymentId = payment && payment.id;
  const amountPaise = payment && payment.amount;
  if (!RAZORPAY_ID.test(razorpayOrderId || '') || !RAZORPAY_ID.test(razorpayPaymentId || '')) return null;
  return { razorpayOrderId, razorpayPaymentId, amountPaise };
}

// Write one line to the audit ledger. Failing to write it must never fail the
// webhook, because the payment itself has already been handled safely.
async function recordEvent(db, eventId, data) {
  if (!eventId) return;
  try {
    await db.doc(`paymentEvents/${eventId}`).create({ ...data, receivedAt: FieldValue.serverTimestamp() });
  } catch (err) {
    if (err && err.code !== 6) logger.warn('Could not write paymentEvents ledger', { eventId, detail: err.message }); // 6 = already exists
  }
}

// refund.created / refund.processed / refund.failed: record what Razorpay says about one refund (shared/refunds.js).
async function handleRefundEvent(db, event, eventId) {
  if (eventId && (await db.doc(`paymentEvents/${eventId}`).get()).exists) return { status: 200, body: 'Duplicate' };

  const entity = event.payload && event.payload.refund && event.payload.refund.entity;
  if (!entity || !RAZORPAY_ID.test(entity.id || '') || !RAZORPAY_ID.test(entity.payment_id || '')) {
    logger.error('Razorpay refund webhook: missing refund or payment id', { event: event.event });
    return { status: 200, body: 'Ignored' };
  }

  let result;
  try {
    result = await applyRefundEntity(db, entity);
  } catch (err) {
    if (err instanceof HttpsError) {
      logger.error('Razorpay refund webhook could not be applied', { refundId: entity.id, code: err.code, message: err.message });
      await recordEvent(db, eventId, { event: event.event, refundId: entity.id, outcome: `REJECTED_${err.code}` });
      return { status: 200, body: 'Not applied' };
    }
    throw err; // temporary trouble: 500 so Razorpay retries
  }

  if (result.unknown) logger.warn('Razorpay refund webhook for an unknown payment', { refundId: entity.id });
  await recordEvent(db, eventId, { event: event.event, refundId: entity.id, orderId: result.orderId || null, outcome: result.unknown ? 'UNKNOWN_PAYMENT' : result.status });
  return { status: 200, body: result.unknown ? 'Unknown payment' : 'Refund recorded' };
}

// The whole webhook, as a plain function (no HTTP objects) so it is easy to test.
// Returns { status, body } for the wrapper below to send.
async function handleWebhook(db, { rawBody, signature, eventId, secret }) {
  // 1. Signature first. Nothing in the body is trusted until this passes.
  if (!rawBody || !hmacMatches(secret, rawBody, signature)) {
    logger.warn('Razorpay webhook rejected: bad signature');
    return { status: 400, body: 'Invalid signature' };
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return { status: 400, body: 'Unreadable body' };
  }

  // 2. Refund events update the order's refund state; only "paid" events create orders. Everything else gets a 200 so
  // Razorpay stops sending it.
  if (REFUND_EVENTS.has(event.event)) return handleRefundEvent(db, event, EVENT_ID.test(eventId || '') ? eventId : null);
  if (!HANDLED_EVENTS.has(event.event)) return { status: 200, body: 'Ignored' };

  const ids = readEvent(event);
  if (!ids) {
    logger.error('Razorpay webhook: missing order or payment id', { event: event.event });
    return { status: 200, body: 'Ignored' };
  }
  const safeEventId = EVENT_ID.test(eventId || '') ? eventId : null;

  // A payment that Razorpay says is not captured is not money in the bank (see the capture note above).
  if (event.payload.payment.entity.captured === false) {
    await recordEvent(db, safeEventId, { event: event.event, outcome: 'NOT_CAPTURED' });
    return { status: 200, body: 'Not captured' };
  }

  // 3. Same event delivered twice? Answer from the ledger and stop (see point 4 above).
  if (safeEventId && (await db.doc(`paymentEvents/${safeEventId}`).get()).exists) {
    return { status: 200, body: 'Duplicate' };
  }

  // 4. Find OUR checkout from Razorpay's order id. We use the id we stored when
  // we created the order, never the notes in the payload.
  const found = await db
    .collection('checkouts')
    .where('payment.razorpayOrderId', '==', ids.razorpayOrderId)
    .limit(1)
    .get();
  if (found.empty) {
    // Not one of ours (or created elsewhere). Acknowledge so Razorpay does not retry for a day.
    logger.warn('Razorpay webhook for an unknown order', { razorpayOrderId: ids.razorpayOrderId });
    await recordEvent(db, safeEventId, { event: event.event, razorpayOrderId: ids.razorpayOrderId, outcome: 'UNKNOWN_ORDER' });
    return { status: 200, body: 'Unknown order' };
  }
  const checkoutId = found.docs[0].id;

  // 5. The amount paid must match what we asked for. A mismatch should never
  // happen; if it does, do NOT create an order, flag it for a human to review.
  if (found.docs[0].get('payment.amountPaise') !== ids.amountPaise) {
    logger.error('Razorpay webhook amount mismatch', { checkoutId, expected: found.docs[0].get('payment.amountPaise'), got: ids.amountPaise });
    await recordEvent(db, safeEventId, { event: event.event, checkoutId, outcome: 'AMOUNT_MISMATCH' });
    return { status: 200, body: 'Amount mismatch' };
  }

  // 6. Do the work. This is the same call verifyPayment makes (race notes above).
  let result;
  try {
    result = await finalizeCheckout(db, { checkoutId, razorpayPaymentId: ids.razorpayPaymentId });
  } catch (err) {
    if (err instanceof HttpsError) {
      // A permanent answer, e.g. "this checkout can no longer be paid". Retrying cannot change it.
      logger.error('Razorpay webhook could not confirm checkout', { checkoutId, code: err.code, message: err.message });
      await recordEvent(db, safeEventId, { event: event.event, checkoutId, outcome: `REJECTED_${err.code}` });
      return { status: 200, body: 'Not confirmed' };
    }
    throw err; // temporary trouble (e.g. Firestore unavailable): let the wrapper return 500 so Razorpay retries
  }

  await recordEvent(db, safeEventId, {
    event: event.event,
    checkoutId,
    outcome: result.replay ? 'ALREADY_PROCESSED' : result.status,
  });
  return { status: 200, body: result.replay ? 'Already processed' : 'Processed' };
}

exports.razorpayWebhook = onRequest(
  { region: 'asia-south1', secrets: [RAZORPAY_WEBHOOK_SECRET] },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.set('Allow', 'POST').status(405).send('POST only');
      return;
    }
    try {
      const { status, body } = await handleWebhook(getFirestore(), {
        rawBody: req.rawBody, // the exact bytes Razorpay sent; the signature covers these
        signature: req.get('x-razorpay-signature'),
        eventId: req.get('x-razorpay-event-id'),
        secret: RAZORPAY_WEBHOOK_SECRET.value(),
      });
      res.status(status).send(body);
    } catch (err) {
      logger.error('Razorpay webhook failed', { detail: err && err.message });
      res.status(500).send('Please retry');
    }
  },
);

// Exported so the tests can call it without an HTTP server.
exports.handleWebhook = handleWebhook;
