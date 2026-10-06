'use strict';

// lowStock: tells the shop when a box is running out, so it can be restocked before customers hit "Out of stock".
//
// It runs on every change to a product, but acts only when stock CROSSES a line (shared/stockAlerts.js decides): once when it
// first falls to the threshold or below, once when it reaches zero. All it does is write one log line,
//     "Stock is low"  { event: 'LOW_STOCK' | 'OUT_OF_STOCK', productId, name, stock, threshold }
// at WARNING level. Google Cloud Monitoring turns that line into an email (monitoring/alertPolicy.js, npm run setup-alerts;
// docs/GO_LIVE.md, section 11.1). It is a warning, not an ERROR, so it never mixes with the real-failure alert.
//
// It never changes the product or any order, and a failure here cannot affect a sale: it is a separate trigger that runs
// after the stock was already taken.

const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { defineInt } = require('firebase-functions/params');
const { logger } = require('firebase-functions');
const { REGION } = require('./shared/hardening');
const { DEFAULT_THRESHOLD, thresholdOf, stockAlertFor } = require('./shared/stockAlerts');

// Set LOW_STOCK_THRESHOLD in functions/.env.<alias> to change it (docs/GO_LIVE.md, section 4.2).
const LOW_STOCK_THRESHOLD = defineInt('LOW_STOCK_THRESHOLD', { default: DEFAULT_THRESHOLD });

exports.lowStock = onDocumentUpdated({ document: 'products/{productId}', region: REGION }, (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  const threshold = thresholdOf(LOW_STOCK_THRESHOLD.value());
  const alert = stockAlertFor(before, after, threshold);
  if (!alert) return;
  logger.warn('Stock is low', { event: alert, productId: event.params.productId, name: String(after.name ?? '').slice(0, 80), stock: after.stock, threshold });
});
