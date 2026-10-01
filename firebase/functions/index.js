'use strict';

const { initializeApp } = require('firebase-admin/app');

// Start the Admin SDK once. Functions use it to write data that clients cannot.
initializeApp();

exports.createCheckout = require('./createCheckout').createCheckout;
exports.verifyPayment = require('./verifyPayment').verifyPayment;
exports.razorpayWebhook = require('./razorpayWebhook').razorpayWebhook;
exports.updateOrderStatus = require('./updateOrderStatus').updateOrderStatus;
exports.cancelOrder = require('./cancelOrder').cancelOrder;
exports.processRefund = require('./processRefund').processRefund;

// Copies each new order into an Excel workbook and keeps its status up to date
// (see docs/AZURE_SETUP.md and docs/EXCEL_SYNC.md). Does nothing until Azure is set up.
exports.excelSync = require('./excelSync').excelSync;
exports.excelSyncUpdate = require('./excelSyncUpdate').excelSyncUpdate; // keeps each row's status in step
exports.retryExcelSync = require('./excelSyncUpdate').retryExcelSync; // staff "Retry Excel sync" button

// Local-only helper for the admin page. Only exported inside the emulator, so
// `firebase deploy` (which does not set this variable) never publishes it.
if (process.env.FUNCTIONS_EMULATOR === 'true') {
  exports.devGrantStaff = require('./devGrantStaff').devGrantStaff;
}
