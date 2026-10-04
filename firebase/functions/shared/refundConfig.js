'use strict';

// Settings the two refund-sending functions share (autoRefund and processRefund), so they cannot disagree.
//
// RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET  the same key pair createCheckout uses (refunds need the secret, not just the id).
// AUTO_REFUNDS                           the kill switch. true (default): a cancelled order's refund is sent to Razorpay by
//                                        itself. false: nothing is sent until staff press "Refund" on the admin page.

const { defineBoolean, defineSecret, defineString } = require('firebase-functions/params');
const { createRazorpayClient } = require('./refunds');

const RAZORPAY_KEY_ID = defineString('RAZORPAY_KEY_ID');
const RAZORPAY_KEY_SECRET = defineSecret('RAZORPAY_KEY_SECRET');
const AUTO_REFUNDS = defineBoolean('AUTO_REFUNDS', { default: true });

const makeClient = () => createRazorpayClient({ keyId: RAZORPAY_KEY_ID.value(), keySecret: RAZORPAY_KEY_SECRET.value() });

module.exports = { RAZORPAY_KEY_SECRET, AUTO_REFUNDS, makeClient };
