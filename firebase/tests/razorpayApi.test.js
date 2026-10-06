'use strict';

// The rehearsal override for Razorpay's address must be impossible to trigger outside the emulator.
// Run: npm run test:unit

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_BASE, apiBase, createRazorpay } = require('../functions/shared/razorpayApi');

describe('apiBase', () => {
  it('is Razorpay itself by default', () => {
    assert.equal(apiBase({}), DEFAULT_BASE);
  });

  it('honours the override inside the emulator, for an address on this machine', () => {
    assert.equal(apiBase({ FUNCTIONS_EMULATOR: 'true', RAZORPAY_API_BASE: 'http://127.0.0.1:9777' }), 'http://127.0.0.1:9777');
    assert.equal(apiBase({ FUNCTIONS_EMULATOR: 'true', RAZORPAY_API_BASE: 'http://localhost:9777' }), 'http://localhost:9777');
  });

  it('IGNORES the override outside the emulator (production never sets FUNCTIONS_EMULATOR)', () => {
    assert.equal(apiBase({ RAZORPAY_API_BASE: 'http://127.0.0.1:9777' }), DEFAULT_BASE);
    assert.equal(apiBase({ FUNCTIONS_EMULATOR: 'false', RAZORPAY_API_BASE: 'http://127.0.0.1:9777' }), DEFAULT_BASE);
  });

  it('IGNORES an address that is not on this machine, even inside the emulator', () => {
    for (const evil of ['https://evil.example', 'http://127.0.0.1.evil.example', 'http://evil.example/127.0.0.1', 'https://127.0.0.1:9777', 'http://127.0.0.1:9777/v1', '']) {
      assert.equal(apiBase({ FUNCTIONS_EMULATOR: 'true', RAZORPAY_API_BASE: evil }), DEFAULT_BASE, evil);
    }
  });
});

describe('createRazorpay', () => {
  it('points the SDK at Razorpay normally and at the local stand-in only when allowed', () => {
    const real = createRazorpay({ keyId: 'rzp_test_x', keySecret: 's' }, {});
    assert.equal(real.api.rq.defaults.baseURL, DEFAULT_BASE);
    const local = createRazorpay({ keyId: 'rzp_test_x', keySecret: 's' }, { FUNCTIONS_EMULATOR: 'true', RAZORPAY_API_BASE: 'http://127.0.0.1:9777' });
    assert.equal(local.api.rq.defaults.baseURL, 'http://127.0.0.1:9777');
  });
});
