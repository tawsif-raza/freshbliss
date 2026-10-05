'use strict';

// A local stand-in for Razorpay's API, for the rehearsal (scripts/rehearsal.js). NOT Razorpay: it only imitates the parts
// of its behaviour the shop depends on, closely enough that the real functions can be exercised end to end:
//
//   POST /v1/orders                       create an order (HTTP Basic auth with the key id and secret is checked)
//   POST /v1/payments/:id/refund          create a refund; honours the X-Refund-Idempotency header like the real API
//                                         (same key and body = the original refund, same key and a different body = 409);
//                                         refuses a refund greater than what is left of the payment (400)
//   GET  /v1/payments/:id/refunds         list a payment's refunds
//
// and it plays Razorpay's other half: pay() returns what the checkout window hands the browser (payment id and the
// HMAC signature), and webhooks are POSTed to the functions emulator, signed with the webhook secret exactly as Razorpay does.
//
// What it cannot tell you: that Razorpay's REAL API accepts these requests. Its shapes follow Razorpay's documentation,
// but only a run in Razorpay Test mode (docs/GO_LIVE.md section 9) proves that.

const http = require('node:http');
const crypto = require('node:crypto');

function createFakeRazorpay({ keyId, keySecret, webhookSecret, webhookUrl, refundDelayMs = 150 }) {
  const orders = new Map(); // order id -> order
  const payments = new Map(); // payment id -> { id, orderId, amount, refunded }
  const refunds = []; // every refund created, in order
  const byKey = new Map(); // idempotency key -> { body, refund }
  const log = []; // every request: { method, path, status, idempotency }
  const webhooks = []; // every webhook we sent: { event, status, body }
  const failures = []; // queued refund failures: { status, description }
  let counter = 0;
  let eventCounter = 0;
  let server;

  const id = (prefix) => `${prefix}_Rh${Date.now().toString(36)}${(counter += 1).toString(36)}`.slice(0, 40);

  async function sendWebhook(event, payload, { eventId } = {}) {
    const rawBody = Buffer.from(JSON.stringify({ entity: 'event', account_id: 'acc_rehearsal', event, payload, created_at: Math.floor(Date.now() / 1000) }));
    const signature = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-razorpay-signature': signature, 'x-razorpay-event-id': eventId || `evt_rh${Date.now().toString(36)}${(eventCounter += 1)}` },
      body: rawBody,
    });
    const body = await res.text();
    webhooks.push({ event, status: res.status, body });
    return { status: res.status, body };
  }

  const paymentEntity = (p, extra = {}) => ({ id: p.id, entity: 'payment', amount: p.amount, currency: 'INR', status: 'captured', captured: true, order_id: p.orderId, ...extra });
  const refundEntity = (r) => ({ id: r.id, entity: 'refund', payment_id: r.payment_id, amount: r.amount, currency: 'INR', status: r.status, notes: r.notes, speed_requested: 'normal', speed_processed: 'normal', created_at: r.created_at });

  function reply(res, status, body) {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  }
  const error = (res, status, description, code = 'BAD_REQUEST_ERROR') => reply(res, status, { error: { code, description, source: 'business', step: 'payment_initiation', reason: 'input_validation_failed' } });

  async function handle(req, res) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const text = Buffer.concat(chunks).toString('utf8');
    const url = new URL(req.url, 'http://x');
    const entry = { method: req.method, path: url.pathname, status: 0, idempotency: req.headers['x-refund-idempotency'] || null };
    log.push(entry);
    const done = (status, body) => {
      entry.status = status;
      reply(res, status, body);
    };
    const fail = (status, description, code) => {
      entry.status = status;
      error(res, status, description, code);
    };

    const expected = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
    if (req.headers.authorization !== expected) return fail(401, 'Authentication failed', 'BAD_REQUEST_ERROR');

    let body = {};
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        return fail(400, 'The request body is not valid JSON');
      }
    }

    if (req.method === 'POST' && url.pathname === '/v1/orders') {
      if (!Number.isInteger(body.amount) || body.amount < 100) return fail(400, 'Order amount less than minimum amount allowed');
      if (body.currency !== 'INR') return fail(400, 'The currency provided is not supported');
      const order = { id: id('order'), entity: 'order', amount: body.amount, amount_paid: 0, currency: 'INR', receipt: body.receipt ?? null, status: 'created', notes: body.notes ?? [] };
      orders.set(order.id, order);
      return done(200, order);
    }

    const refundRoute = url.pathname.match(/^\/v1\/payments\/([^/]+)\/refund$/);
    if (req.method === 'POST' && refundRoute) {
      const payment = payments.get(refundRoute[1]);
      if (!payment) return fail(400, 'The id provided does not exist');
      const key = req.headers['x-refund-idempotency'];
      if (key !== undefined && !/^[A-Za-z0-9_-]{10,}$/.test(key)) return fail(400, 'The idempotency key must be at least 10 characters long and contain only letters, numbers, hyphens and underscores');
      if (key && byKey.has(key)) {
        const seen = byKey.get(key);
        if (JSON.stringify(seen.body) !== JSON.stringify(body)) return fail(409, 'Different request with the same idempotency key has already been processed.');
        return done(200, refundEntity(seen.refund));
      }
      const queued = failures.shift();
      if (queued) return fail(queued.status, queued.description);
      const amount = body.amount ?? payment.amount - payment.refunded;
      if (!Number.isInteger(amount) || amount < 100) return fail(400, 'The refund amount provided is invalid');
      if (amount > payment.amount - payment.refunded) return fail(400, 'The refund amount provided is greater than the amount captured');
      payment.refunded += amount;
      const refund = { id: id('rfnd'), payment_id: payment.id, amount, status: 'pending', notes: body.notes ?? [], created_at: Math.floor(Date.now() / 1000), speed: body.speed };
      refunds.push(refund);
      if (key) byKey.set(key, { body, refund });
      // Razorpay tells the shop about it, a moment later.
      setTimeout(async () => {
        try {
          await sendWebhook('refund.created', { refund: { entity: refundEntity(refund) }, payment: { entity: paymentEntity(payment) } });
          refund.status = 'processed';
          await sendWebhook('refund.processed', { refund: { entity: refundEntity(refund) }, payment: { entity: paymentEntity(payment) } });
        } catch (err) {
          console.error('  (fake Razorpay could not deliver a refund webhook:', err.message, ')');
        }
      }, refundDelayMs);
      return done(200, refundEntity(refund));
    }

    const listRoute = url.pathname.match(/^\/v1\/payments\/([^/]+)\/refunds$/);
    if (req.method === 'GET' && listRoute) {
      if (!payments.has(listRoute[1])) return fail(400, 'The id provided does not exist');
      const items = refunds.filter((r) => r.payment_id === listRoute[1]).map(refundEntity);
      return done(200, { entity: 'collection', count: items.length, items });
    }

    return fail(404, 'The requested URL was not found on the server');
  }

  return {
    orders,
    payments,
    refunds,
    log,
    webhooks,
    start: (port) =>
      new Promise((resolve, reject) => {
        server = http.createServer((req, res) => handle(req, res).catch((err) => reply(res, 500, { error: { description: err.message } })));
        server.once('error', reject);
        server.listen(port, '127.0.0.1', resolve);
      }),
    stop: () => new Promise((resolve) => server.close(resolve)),

    // What the checkout window gives the browser after the customer pays: the ids and Razorpay's signature.
    pay(razorpayOrderId) {
      const order = orders.get(razorpayOrderId);
      if (!order) throw new Error(`fake Razorpay has no order ${razorpayOrderId}`);
      const payment = { id: id('pay'), orderId: order.id, amount: order.amount, refunded: 0 };
      payments.set(payment.id, payment);
      order.status = 'paid';
      order.amount_paid = order.amount;
      const response = {
        razorpay_order_id: order.id,
        razorpay_payment_id: payment.id,
        razorpay_signature: crypto.createHmac('sha256', keySecret).update(`${order.id}|${payment.id}`).digest('hex'),
      };
      return {
        response,
        payment,
        // order.paid, as Razorpay sends it once the payment is captured.
        sendOrderPaid: (opts) =>
          sendWebhook('order.paid', { order: { entity: { ...order } }, payment: { entity: paymentEntity(payment) } }, opts),
      };
    },

    sendWebhook,
    failNextRefund: (status = 400, description = 'The payment has not been captured') => failures.push({ status, description }),
    refundsFor: (paymentId) => refunds.filter((r) => r.payment_id === paymentId),
  };
}

module.exports = { createFakeRazorpay };
