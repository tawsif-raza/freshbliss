import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { authErrorMessage, cleanOtp, normalizeIndianMobile, safeNextPath } from '../lib/authHelpers.js';

describe('where to go after signing in', () => {
  it('goes to the account page by default', () => {
    for (const v of [undefined, '', null, 42]) assert.equal(safeNextPath(v), '/account');
  });

  it('follows a path on this site, query string included', () => {
    assert.equal(safeNextPath('/checkout'), '/checkout');
    assert.equal(safeNextPath('/products/mango?size=1kg'), '/products/mango?size=1kg');
  });

  it('takes the first value when the link repeats ?next=', () => {
    assert.equal(safeNextPath(['/checkout', '/cart']), '/checkout');
  });

  it('never leaves the site', () => {
    for (const v of ['https://evil.com', '//evil.com', '/\\evil.com', 'javascript:alert(1)', 'evil.com', '/%0d%0a'.replace('%0d%0a', '\r\n')]) {
      assert.equal(safeNextPath(v), '/account', JSON.stringify(v));
    }
  });

  it('does not loop back to the login page', () => {
    for (const v of ['/login', '/login?next=/checkout', '/login#x']) assert.equal(safeNextPath(v), '/account', v);
    assert.equal(safeNextPath('/loginhelp'), '/loginhelp');
  });
});

describe('mobile numbers', () => {
  it('accepts a 10-digit Indian mobile however it is typed or pasted', () => {
    for (const v of ['9876543210', '98765 43210', '+91 98765-43210', '919876543210', '09876543210', ' (98765) 43210 ']) {
      assert.deepEqual(normalizeIndianMobile(v), { ok: true, e164: '+919876543210' }, v);
    }
  });

  it('asks for the number when it is empty', () => {
    assert.equal(normalizeIndianMobile('').ok, false);
    assert.match(normalizeIndianMobile('  ').message, /Enter your mobile/);
  });

  it('rejects numbers that cannot be a mobile', () => {
    for (const v of ['12345', '5876543210', '98765432', '98765432101', 'abcdefghij']) {
      const r = normalizeIndianMobile(v);
      assert.equal(r.ok, false, v);
      assert.ok(r.message);
    }
  });
});

describe('one-time code', () => {
  it('keeps only the first six digits', () => {
    assert.equal(cleanOtp('123 456'), '123456');
    assert.equal(cleanOtp('12-34-56-78'), '123456');
    assert.equal(cleanOtp('ab12'), '12');
    assert.equal(cleanOtp(undefined), '');
  });
});

describe('sign-in error messages', () => {
  it('explains the common failures in plain words', () => {
    for (const code of ['auth/popup-closed-by-user', 'auth/popup-blocked', 'auth/invalid-verification-code', 'auth/code-expired', 'auth/too-many-requests', 'auth/network-request-failed']) {
      const msg = authErrorMessage({ code });
      assert.ok(msg.length > 20, code);
      assert.doesNotMatch(msg, /auth\/|Firebase/i, code);
    }
  });

  it('never shows raw error text for an unknown failure', () => {
    const original = console.error;
    console.error = () => {};
    try {
      assert.equal(authErrorMessage(new Error('Firebase: Error (auth/weird-new-thing).')), 'Something went wrong while signing you in. Please try again.');
    } finally {
      console.error = original;
    }
  });
});
