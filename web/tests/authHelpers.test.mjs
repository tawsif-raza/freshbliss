import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  allowGuestCheckout,
  authErrorMessage,
  cleanOtp,
  describeAccount,
  formatPhone,
  guestCheckoutAllowed,
  isGatedTarget,
  loginHref,
  needsSignIn,
  normalizeIndianMobile,
  safeNextPath,
} from '../lib/authHelpers.js';

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

describe('which pages ask for sign-in', () => {
  it('gates checkout only', () => {
    assert.equal(needsSignIn('/checkout'), true);
    for (const p of ['/', '/cart', '/products', '/account', '/login', '/checkout/other']) assert.equal(needsSignIn(p), false, p);
  });

  it('knows when a sign-in request comes from a gated page (so a guest option is offered)', () => {
    assert.equal(isGatedTarget('/checkout'), true);
    assert.equal(isGatedTarget('/checkout?promo=X#top'), true);
    assert.equal(isGatedTarget('/account'), false);
    assert.equal(isGatedTarget(undefined), false);
    assert.equal(isGatedTarget('https://evil.com/checkout'), false);
  });
});

describe('the login link', () => {
  it('brings the visitor back to where they were', () => {
    assert.equal(loginHref('/checkout'), '/login?next=%2Fcheckout');
    assert.equal(loginHref('/products/mango?size=1kg'), '/login?next=%2Fproducts%2Fmango%3Fsize%3D1kg');
  });

  it('is plain /login when there is nowhere to come back to', () => {
    for (const v of [undefined, '', '/account', '/login', '//evil.com', 'https://evil.com']) assert.equal(loginHref(v), '/login', String(v));
  });

  it('round-trips through safeNextPath', () => {
    const href = loginHref('/products/mango?size=1kg');
    const next = new URL(href, 'https://shop.test').searchParams.get('next');
    assert.equal(safeNextPath(next), '/products/mango?size=1kg');
  });
});

describe('continue as guest', () => {
  it('is remembered once chosen (in memory even where sessionStorage is blocked)', () => {
    assert.equal(guestCheckoutAllowed(), false);
    allowGuestCheckout();
    assert.equal(guestCheckoutAllowed(), true);
  });
});

describe('the account card', () => {
  it('shows a Google or Microsoft user by name, with email and provider', () => {
    const me = describeAccount({ displayName: ' Asha Rao ', email: 'asha@example.com', photoURL: 'https://x/y.png', providerData: [{ providerId: 'google.com' }] });
    assert.equal(me.title, 'Asha Rao');
    assert.equal(me.email, 'asha@example.com');
    assert.equal(me.provider, 'Google');
    assert.equal(me.initial, 'A');
    assert.equal(describeAccount({ displayName: 'B', providerData: [{ providerId: 'microsoft.com' }] }).provider, 'Microsoft');
  });

  it('shows a phone user by number', () => {
    const me = describeAccount({ phoneNumber: '+919876543210', providerData: [{ providerId: 'phone' }] });
    assert.equal(me.title, '+91 98765 43210');
    assert.equal(me.phone, '+91 98765 43210');
    assert.equal(me.provider, 'Mobile number');
    assert.equal(me.initial, '9');
  });

  it('falls back to the email on the provider, then to a plain label', () => {
    assert.equal(describeAccount({ providerData: [{ providerId: 'microsoft.com', email: 'm@example.com' }] }).title, 'm@example.com');
    const nobody = describeAccount(null);
    assert.equal(nobody.title, 'Your account');
    assert.equal(nobody.initial, 'Y');
  });

  it('formats only Indian numbers it recognises', () => {
    assert.equal(formatPhone('+919876543210'), '+91 98765 43210');
    assert.equal(formatPhone('+14155550123'), '+14155550123');
    assert.equal(formatPhone(undefined), '');
  });
});
