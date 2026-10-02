'use strict';

// Razorpay has two completely separate worlds: TEST (rzp_test_ keys, pretend money) and
// LIVE (rzp_live_ keys, real money). Going live must be a deliberate act, never a side
// effect of pasting a different key. So the functions are told which world to use
// (RAZORPAY_MODE, default "test"), and refuse to take a payment if the key id does not
// belong to that world.
//
//   RAZORPAY_MODE=test  + rzp_test_...   ok (the default; nothing changes)
//   RAZORPAY_MODE=live  + rzp_live_...   ok (production)
//   anything else                        refused, with a reason for the log

const MODES = ['test', 'live'];

// Returns null when the key id and the mode agree, or a sentence saying what is wrong.
// Never includes the key itself.
function razorpayKeyProblem(keyId, mode) {
  if (!MODES.includes(mode)) return `RAZORPAY_MODE is "${mode}". It must be "test" or "live".`;
  if (typeof keyId !== 'string' || keyId.trim() === '') return 'RAZORPAY_KEY_ID is empty.';
  if (!keyId.startsWith(`rzp_${mode}_`)) {
    const other = mode === 'test' ? 'live' : 'test';
    return keyId.startsWith(`rzp_${other}_`)
      ? `RAZORPAY_MODE is "${mode}" but RAZORPAY_KEY_ID is a ${other} key. Change one so they match.`
      : `RAZORPAY_KEY_ID does not look like a Razorpay ${mode} key (it should start with rzp_${mode}_).`;
  }
  return null;
}

module.exports = { MODES, razorpayKeyProblem };
