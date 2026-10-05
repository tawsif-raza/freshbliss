'use strict';

// Where Razorpay's API lives, and the one way to build the Razorpay client.
//
// REHEARSAL OVERRIDE (emulator only): scripts/rehearsal.js starts a local stand-in for Razorpay and points the functions at
// it with RAZORPAY_API_BASE=http://127.0.0.1:<port>. The override is honoured ONLY when the functions run inside the
// Firebase emulator (FUNCTIONS_EMULATOR=true, which Cloud Functions in production never sets) AND the address is on this
// machine. Anywhere else the variable is ignored, so a stray setting can never send real orders or refunds to the wrong
// place. tests/razorpayApi.test.js checks this.

const DEFAULT_BASE = 'https://api.razorpay.com';
const LOCAL = /^http:\/\/(127\.0\.0\.1|localhost)(:\d{2,5})?$/;

function apiBase(env = process.env) {
  const override = env.RAZORPAY_API_BASE;
  return env.FUNCTIONS_EMULATOR === 'true' && typeof override === 'string' && LOCAL.test(override) ? override : DEFAULT_BASE;
}

// The official SDK, pointed at apiBase().
function createRazorpay({ keyId, keySecret }, env = process.env) {
  const Razorpay = require('razorpay');
  const client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  const base = apiBase(env);
  if (base !== DEFAULT_BASE) client.api.rq.defaults.baseURL = base;
  return client;
}

module.exports = { DEFAULT_BASE, apiBase, createRazorpay };
