'use strict';

// The log-based alert that puts a failure on your phone instead of waiting for you to look in the logs
// (docs/GO_LIVE.md, section 11.1). Pure functions, so tests/alerts.test.js can check them without Google Cloud.
//
// What it watches: any log line of severity ERROR from a FreshBliss Cloud Function. The functions already log at
// ERROR for the things that matter and never for an ordinary customer mistake (a wrong promo code, an empty cart):
// a failed Razorpay order, a payment webhook that does not match its checkout, a refused Razorpay key, a failed Excel
// copy, a rate limiter that stopped counting.
//
// How loud: at most ONE email per hour while errors continue (a burst is one email, not fifty), and the incident
// closes by itself after a day without errors.

const POLICY_NAME = 'FreshBliss: Cloud Function errors';

// Cloud Functions v2 run on Cloud Run (resource type cloud_run_revision); v1 would be cloud_function.
const LOG_FILTER = ['(resource.type="cloud_run_revision" OR resource.type="cloud_function")', 'severity>=ERROR'].join(' AND ');

const DOCUMENTATION = [
  'A FreshBliss Cloud Function logged an ERROR.',
  '',
  '1. Open Logs Explorer for this project and run the query below to see what failed and which order or checkout it was.',
  '2. If it mentions Razorpay or a payment: check the Razorpay dashboard first. Money may have moved without an order being made (docs/GO_LIVE.md, section 12).',
  '3. If it mentions Excel: orders are fine; press "Retry Excel sync" in the staff dashboard once AWS is back.',
  '',
  `Query: ${LOG_FILTER}`,
].join('\n');

function buildPolicy({ channelNames = [] } = {}) {
  return {
    displayName: POLICY_NAME,
    combiner: 'OR',
    conditions: [{ displayName: 'A Cloud Function logged an ERROR', conditionMatchedLog: { filter: LOG_FILTER } }],
    alertStrategy: { notificationRateLimit: { period: '3600s' }, autoClose: '86400s' },
    notificationChannels: channelNames,
    documentation: { content: DOCUMENTATION, mimeType: 'text/markdown' },
    enabled: true,
  };
}

// ---------- low stock ----------

// A second, separate policy for "a box is running out" (functions/lowStock.js writes the log line). It is its own policy
// so a restock reminder never hides, or is hidden by, a real failure, and so the shop can switch it off on its own.
const STOCK_POLICY_NAME = 'FreshBliss: Low stock';

// The WARNING that lowStock.js logs: { event: 'LOW_STOCK' | 'OUT_OF_STOCK', productId, name, stock }.
const STOCK_LOG_FILTER = ['(resource.type="cloud_run_revision" OR resource.type="cloud_function")', 'severity=WARNING', 'jsonPayload.event=("LOW_STOCK" OR "OUT_OF_STOCK")'].join(' AND ');

const STOCK_DOCUMENTATION = [
  'A FreshBliss box is running low or has sold out.',
  '',
  '1. Open Logs Explorer for this project and run the query below: each line names the product (`name`, `productId`) and the `stock` left.',
  '2. `LOW_STOCK` means it just fell to the warning level; `OUT_OF_STOCK` means customers now see "Out of stock".',
  "3. Restock by editing the product's `stock` in the Firestore console (the storefront and the staff dashboard cannot change stock).",
  '',
  `Query: ${STOCK_LOG_FILTER}`,
].join('\n');

// Same shape as buildPolicy. At most one email an hour, so a busy evening that empties several boxes is one email whose
// logs list them all, and it closes by itself after a day without a new alert.
function buildStockPolicy({ channelNames = [] } = {}) {
  return {
    displayName: STOCK_POLICY_NAME,
    combiner: 'OR',
    conditions: [{ displayName: 'A box is running low or sold out', conditionMatchedLog: { filter: STOCK_LOG_FILTER } }],
    alertStrategy: { notificationRateLimit: { period: '3600s' }, autoClose: '86400s' },
    notificationChannels: channelNames,
    documentation: { content: STOCK_DOCUMENTATION, mimeType: 'text/markdown' },
    enabled: true,
  };
}

module.exports = { POLICY_NAME, LOG_FILTER, buildPolicy, STOCK_POLICY_NAME, STOCK_LOG_FILTER, buildStockPolicy };
