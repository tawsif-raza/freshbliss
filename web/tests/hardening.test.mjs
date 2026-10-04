import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { friendlyError } from '../lib/errors.js';

const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const headersFor = (source) => Object.fromEntries((vercel.headers.find((h) => h.source === source)?.headers ?? []).map((h) => [h.key, h.value]));
const all = headersFor('/(.*)');

// "script-src 'self' https://a" -> { 'script-src': ["'self'", 'https://a'] }
const directives = (csp) => Object.fromEntries(csp.split(';').map((d) => d.trim()).filter(Boolean).map((d) => { const [name, ...values] = d.split(/\s+/); return [name, values]; }));
const csp = directives(all['Content-Security-Policy'] ?? '');

describe('the Content Security Policy is ENFORCED, not just reported', () => {
  it('is sent as Content-Security-Policy, and there is no report-only copy left that nobody reads', () => {
    assert.ok(all['Content-Security-Policy']);
    assert.equal('Content-Security-Policy-Report-Only' in all, false);
  });

  it('closes the dangerous doors: no plugins, no framing of the shop, no base-tag tricks, no eval, https only', () => {
    assert.deepEqual(csp['object-src'], ["'none'"]);
    assert.deepEqual(csp['frame-ancestors'], ["'none'"]);
    assert.deepEqual(csp['base-uri'], ["'self'"]);
    assert.deepEqual(csp['default-src'], ["'self'"]);
    assert.ok('upgrade-insecure-requests' in csp);
    for (const [name, values] of Object.entries(csp)) assert.ok(!values.includes("'unsafe-eval'"), `${name} must not allow eval`);
    for (const name of ['script-src', 'connect-src', 'frame-src']) assert.ok(!csp[name].includes('*'), `${name} must not be a wildcard`);
  });

  // Everything the shop really talks to. If one of these is missing from the policy, that feature is BLOCKED in production.
  it('lets the payment sheet work: Razorpay script, frame, API and its form post', () => {
    assert.ok(csp['script-src'].includes('https://checkout.razorpay.com'));
    for (const h of ['https://checkout.razorpay.com', 'https://api.razorpay.com']) assert.ok(csp['frame-src'].includes(h), h);
    for (const h of ['https://api.razorpay.com', 'https://lumberjack.razorpay.com', 'https://checkout.razorpay.com']) assert.ok(csp['connect-src'].includes(h), h);
    assert.ok(csp['form-action'].includes('https://api.razorpay.com'));
  });

  it('lets App Check work: the reCAPTCHA script, its frame and its calls', () => {
    assert.ok(csp['script-src'].includes('https://www.google.com/recaptcha/'));
    assert.ok(csp['script-src'].includes('https://www.gstatic.com/recaptcha/'));
    assert.ok(csp['frame-src'].includes('https://www.google.com/recaptcha/'));
    assert.ok(csp['connect-src'].includes('https://www.google.com/recaptcha/'));
  });

  it('lets Firebase and the functions work: Firestore, sign-in and App Check tokens (googleapis), and the Mumbai functions', () => {
    for (const h of ['https://*.googleapis.com', 'https://*.cloudfunctions.net', 'https://*.run.app']) assert.ok(csp['connect-src'].includes(h), h);
  });

  it('lets the address finder, photos, fonts and inline styles work', () => {
    assert.ok(csp['connect-src'].includes('https://nominatim.openstreetmap.org'));
    assert.ok(csp['img-src'].includes('https:') && csp['img-src'].includes('data:'), 'owner photos can be on any https host, and the blur tile is a data: URL');
    assert.ok(csp['font-src'].includes("'self'"), 'next/font serves the fonts from this site');
    assert.ok(csp['style-src'].includes("'unsafe-inline'"), 'next/font and styled-jsx write inline styles');
    assert.ok(csp['script-src'].includes("'unsafe-inline'"), "Next's page bootstrap is an inline script (a nonce is not possible on statically built pages)");
  });

  it('keeps the other security headers', () => {
    assert.equal(all['X-Content-Type-Options'], 'nosniff');
    assert.equal(all['X-Frame-Options'], 'DENY');
    assert.match(all['Strict-Transport-Security'], /max-age=\d{7,}/);
    assert.match(all['Permissions-Policy'], /camera=\(\)/);
  });
});

describe('private pages stay out of search results', () => {
  for (const source of ['/admin/:path*', '/orders/:path*', '/cart', '/checkout', '/account']) {
    it(`${source} says noindex`, () => {
      assert.match(headersFor(source)['X-Robots-Tag'] ?? '', /noindex/);
    });
  }
});

describe('error messages for the customer', () => {
  const callable = (code, message) => Object.assign(new Error(message), { code });

  it('shows the rate-limit message as it is (it already says how long to wait)', () => {
    const msg = 'You are doing that too often. Please wait 42 seconds and try again.';
    assert.equal(friendlyError(callable('functions/resource-exhausted', `${msg} [429]`)), msg);
  });

  it('turns the bare "Unauthenticated" that App Check sends into something a person can act on', () => {
    for (const message of ['Unauthenticated', 'unauthenticated', 'Unauthenticated [401]']) {
      assert.match(friendlyError(callable('functions/unauthenticated', message)), /reload the page/i);
    }
  });

  it('still shows our own sign-in message when the server wrote one', () => {
    assert.equal(friendlyError(callable('functions/unauthenticated', 'Please sign in to check out.')), 'Please sign in to check out.');
  });
});
