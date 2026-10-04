'use strict';

const { initializeApp } = require('firebase-admin/app');
const { setGlobalOptions } = require('firebase-functions/v2');

// Every function runs in Mumbai (asia-south1), next to the Firestore database and the shoppers in
// Bengaluru. Each function also names its region itself; this default is the safety net so a
// function added later cannot quietly deploy to the default region (us-central1), where it would
// be slow and, for Firestore triggers, would not match the database's location.
// tests/regions.test.js fails if any function is anywhere else.
// (It must run before the functions below are created, so it stays above them.)
setGlobalOptions({ region: 'asia-south1' });

// Start the Admin SDK once. Functions use it to write data that clients cannot.
initializeApp();

exports.createCheckout = require('./createCheckout').createCheckout;
exports.previewCheckout = require('./previewCheckout').previewCheckout; // prices a cart for the checkout page, charges nothing
exports.verifyPayment = require('./verifyPayment').verifyPayment;
exports.razorpayWebhook = require('./razorpayWebhook').razorpayWebhook;
exports.updateOrderStatus = require('./updateOrderStatus').updateOrderStatus;
exports.cancelOrder = require('./cancelOrder').cancelOrder;
exports.cancelMyOrder = require('./cancelOrder').cancelMyOrder; // the customer's own cancel, until the order is packed
exports.processRefund = require('./processRefund').processRefund;
exports.claimGuestOrders = require('./claimGuestOrders').claimGuestOrders; // moves a guest's orders to the account they sign in to

// Copies each new order into an Excel workbook (a .xlsx file in Amazon S3) and keeps its
// status up to date (see docs/AWS_SETUP.md and docs/EXCEL_SYNC.md). Does nothing until AWS is set up.
exports.excelSync = require('./excelSync').excelSync;
exports.excelSyncUpdate = require('./excelSyncUpdate').excelSyncUpdate; // keeps each row's status in step
exports.retryExcelSync = require('./excelSyncUpdate').retryExcelSync; // staff "Retry Excel sync" button
exports.getOrdersDownloadUrl = require('./getOrdersDownloadUrl').getOrdersDownloadUrl; // staff "Download orders sheet" button

// Local-only helper for the admin page. Only exported inside the emulator, so
// `firebase deploy` (which does not set this variable) never publishes it.
if (process.env.FUNCTIONS_EMULATOR === 'true') {
  exports.devGrantStaff = require('./devGrantStaff').devGrantStaff;
  exports.createMockOrder = require('./createMockOrder').createMockOrder; // checkout without Razorpay, for local testing
}
