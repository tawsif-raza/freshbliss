'use strict';

// The pure rules of promo usage limits (functions/shared/promoLimits.js). Run: npm run test:unit (no emulator).
// The transaction that enforces them is tested in payments.test.js (npm run test:payments).

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readLimit, limitProblem, whoIs } = require('../functions/shared/promoLimits');

describe('readLimit', () => {
  it('reads a missing limit as unlimited, and whole numbers (0 included) as limits', () => {
    assert.equal(readLimit(undefined), 'unlimited');
    assert.equal(readLimit(null), 'unlimited');
    assert.equal(readLimit(0), 0);
    assert.equal(readLimit(5), 5);
  });

  it('calls anything else a mistake, never "unlimited"', () => {
    for (const bad of ['5', '', -1, 2.5, NaN, Infinity, true, {}, []]) assert.equal(readLimit(bad), 'invalid', String(bad));
  });
});

describe('limitProblem', () => {
  const promo = (over = {}) => ({ code: 'WELCOME10', ...over });

  it('has no problem when nothing is limited, or the counters are under the limits', () => {
    assert.equal(limitProblem(promo(), { usedCount: 9999, userUses: 9999 }), null);
    assert.equal(limitProblem(promo({ globalMaxUses: 3, maxUsesPerUser: 2 }), { usedCount: 2, userUses: 1 }), null);
    assert.equal(limitProblem(promo({ globalMaxUses: 3 })), null, 'counters default to 0');
  });

  it('stops at exactly the limit, not one use later', () => {
    assert.equal(limitProblem(promo({ globalMaxUses: 3 }), { usedCount: 3 }).kind, 'global');
    assert.equal(limitProblem(promo({ maxUsesPerUser: 1 }), { userUses: 1 }).kind, 'user');
  });

  it('puts the total limit first: a used-up code is used up for everyone', () => {
    assert.equal(limitProblem(promo({ globalMaxUses: 1, maxUsesPerUser: 1 }), { usedCount: 1, userUses: 1 }).kind, 'global');
  });

  it('words each case politely', () => {
    assert.equal(limitProblem(promo({ globalMaxUses: 1 }), { usedCount: 1 }).message, 'This promo code has reached its usage limit.');
    assert.equal(limitProblem(promo({ maxUsesPerUser: 1 }), { userUses: 1 }).message, 'You have already used the code WELCOME10.');
    assert.equal(limitProblem(promo({ maxUsesPerUser: 3 }), { userUses: 3 }).message, 'You have already used the code WELCOME10 the 3 times it allows.');
  });

  it('refuses a mistyped limit (kind "config")', () => {
    assert.equal(limitProblem(promo({ globalMaxUses: '10' })).kind, 'config');
    assert.equal(limitProblem(promo({ maxUsesPerUser: -1 })).kind, 'config');
  });

  it('treats 0 as used up', () => {
    assert.equal(limitProblem(promo({ globalMaxUses: 0 })).kind, 'global');
    assert.equal(limitProblem(promo({ maxUsesPerUser: 0 })).kind, 'user');
  });
});

describe('whoIs', () => {
  it('knows guests (anonymous accounts) from signed-in customers', () => {
    assert.deepEqual(whoIs({ uid: 'a', token: { firebase: { sign_in_provider: 'anonymous' } } }), { uid: 'a', anonymous: true });
    assert.deepEqual(whoIs({ uid: 'b', token: { firebase: { sign_in_provider: 'google.com' } } }), { uid: 'b', anonymous: false });
    assert.deepEqual(whoIs({ uid: 'c', token: {} }), { uid: 'c', anonymous: false });
    assert.deepEqual(whoIs(undefined), { uid: undefined, anonymous: false });
  });
});
