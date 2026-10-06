'use strict';

// Tests for the deployment preflight and the Razorpay mode guard.
// Run: npm run test:unit   (no emulator, no network, no Firebase project)

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseEnv, resolveProject, checkSettings } = require('../scripts/preflight');
const { razorpayKeyProblem } = require('../functions/shared/razorpayMode');

const GOOD = { RAZORPAY_KEY_ID: 'rzp_live_abc123', RAZORPAY_MODE: 'live', ENFORCE_APP_CHECK: 'true', EXCEL_S3_BUCKET: 'freshbliss-orders', EXCEL_AWS_ACCESS_KEY_ID: 'AKIAEXAMPLE' };
const check = (env, extra = {}) => checkSettings({ alias: 'production', projectId: 'freshbliss-prod', env, envFile: '.env.production', ...extra });

// ============================================================
describe('razorpayKeyProblem: a key may only be used in its own mode', () => {
  it('accepts a matching pair', () => {
    assert.equal(razorpayKeyProblem('rzp_test_abc', 'test'), null);
    assert.equal(razorpayKeyProblem('rzp_live_abc', 'live'), null);
  });
  it('refuses a live key in test mode and a test key in live mode, and says which way round', () => {
    assert.match(razorpayKeyProblem('rzp_live_abc', 'test'), /is a live key/);
    assert.match(razorpayKeyProblem('rzp_test_abc', 'live'), /is a test key/);
  });
  it('refuses an unknown mode, an empty key and something that is not a Razorpay key', () => {
    assert.match(razorpayKeyProblem('rzp_test_abc', 'prod'), /must be "test" or "live"/);
    assert.match(razorpayKeyProblem('', 'test'), /empty/);
    assert.match(razorpayKeyProblem(undefined, 'test'), /empty/);
    assert.match(razorpayKeyProblem('sk_live_abc', 'live'), /does not look like/);
  });
  it('never repeats the key in its message', () => {
    for (const [key, mode] of [['rzp_live_SECRETPART', 'test'], ['sk_live_SECRETPART', 'live']]) {
      assert.ok(!razorpayKeyProblem(key, mode).includes('SECRETPART'));
    }
  });
});

// ============================================================
describe('parseEnv', () => {
  it('reads KEY=value lines, ignoring comments, blanks and quotes', () => {
    const env = parseEnv('# a comment\n\nRAZORPAY_KEY_ID=rzp_live_x\r\nEXCEL_S3_BUCKET="my-bucket"\nEMPTY=\nNOEQUALS\n =bad\nURL=https://a.b/?c=d\n');
    assert.deepEqual(env, { RAZORPAY_KEY_ID: 'rzp_live_x', EXCEL_S3_BUCKET: 'my-bucket', EMPTY: '', URL: 'https://a.b/?c=d' });
  });
  it('copes with nothing at all', () => {
    assert.deepEqual(parseEnv(''), {});
    assert.deepEqual(parseEnv(undefined), {});
  });
});

// ============================================================
describe('resolveProject', () => {
  it('finds the project behind an alias', () => {
    assert.equal(resolveProject({ projects: { production: 'freshbliss-prod' } }, 'production'), 'freshbliss-prod');
  });
  it('explains how to create a missing alias', () => {
    assert.throws(() => resolveProject({ projects: { default: 'demo-freshbliss' } }, 'production'), /firebase use --add/);
    assert.throws(() => resolveProject({}, 'production'), /found: none/);
  });
});

// ============================================================
describe('checkSettings', () => {
  it('passes a complete live setup with no warnings', () => {
    const r = check(GOOD);
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.warnings, []);
    assert.equal(r.mode, 'live');
  });

  it('refuses a demo project', () => {
    assert.match(checkSettings({ alias: 'production', projectId: 'demo-freshbliss', env: GOOD, envFile: 'x' }).errors[0], /demo project/);
  });

  it('refuses a key that does not match the mode (the live-key-in-test-mode slip)', () => {
    assert.match(check({ ...GOOD, RAZORPAY_MODE: 'test' }).errors[0], /is a live key/);
    assert.match(check({ ...GOOD, RAZORPAY_KEY_ID: 'rzp_test_abc' }).errors[0], /is a test key/);
  });

  it('treats a missing mode as test, and warns that nobody will be charged', () => {
    const r = check({ ...GOOD, RAZORPAY_MODE: undefined, RAZORPAY_KEY_ID: 'rzp_test_abc' });
    assert.deepEqual(r.errors, []);
    assert.equal(r.mode, 'test');
    assert.ok(r.warnings.some((w) => /NOT be charged/.test(w)));
    assert.match(check({ ...GOOD, RAZORPAY_MODE: undefined }).errors[0], /is a live key/, 'a live key with the default mode is refused, not charged by accident');
  });

  it('wants a key id', () => {
    assert.ok(check({ ...GOOD, RAZORPAY_KEY_ID: undefined }).errors.some((e) => /RAZORPAY_KEY_ID is missing/.test(e)));
  });

  it('refuses the emulator-only S3 endpoint', () => {
    assert.ok(check({ ...GOOD, EXCEL_S3_ENDPOINT: 'http://localhost:4566' }).errors.some((e) => /EXCEL_S3_ENDPOINT/.test(e)));
  });

  it('wants the AWS key id when a bucket is set, and only warns when Excel sync is off', () => {
    assert.ok(check({ ...GOOD, EXCEL_AWS_ACCESS_KEY_ID: '' }).errors.some((e) => /EXCEL_AWS_ACCESS_KEY_ID/.test(e)));
    const off = check({ RAZORPAY_KEY_ID: GOOD.RAZORPAY_KEY_ID, RAZORPAY_MODE: 'live', ENFORCE_APP_CHECK: 'true' });
    assert.deepEqual(off.errors, []);
    assert.ok(off.warnings.some((w) => /Excel/.test(w)));
  });

  it('REFUSES live (real money) mode without App Check, whether the switch is off or missing', () => {
    for (const env of [{ ...GOOD, ENFORCE_APP_CHECK: 'false' }, { ...GOOD, ENFORCE_APP_CHECK: undefined }]) {
      const r = check(env);
      assert.ok(r.errors.some((e) => /ENFORCE_APP_CHECK is off while RAZORPAY_MODE is "live"/.test(e) && /section 5\.5/.test(e)));
    }
  });

  it('only warns about App Check in test mode, so the rehearsal can start before the reCAPTCHA key exists', () => {
    const r = check({ ...GOOD, RAZORPAY_MODE: 'test', RAZORPAY_KEY_ID: 'rzp_test_abc', ENFORCE_APP_CHECK: undefined });
    assert.deepEqual(r.errors, []);
    assert.ok(r.warnings.some((w) => /ENFORCE_APP_CHECK is off/.test(w)));
  });

  it('refuses a switch value that is not exactly true or false (a typo must not silently mean off)', () => {
    for (const bad of ['yes', '1', 'True', 'on']) {
      assert.ok(check({ ...GOOD, ENFORCE_APP_CHECK: bad }).errors.some((e) => /must be "true" or "false"/.test(e)), bad);
    }
    assert.deepEqual(check({ ...GOOD, ENFORCE_APP_CHECK: 'true' }).errors, []);
  });

  it('refuses a secret written into the settings file, naming the fix', () => {
    for (const name of ['RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'EXCEL_AWS_SECRET_ACCESS_KEY', 'ERASURE_HASH_KEY']) {
      const r = check({ ...GOOD, [name]: 'hunter2' });
      assert.ok(r.errors.some((e) => e.includes(name) && /Secret Manager/.test(e)));
      assert.ok(!JSON.stringify(r).includes('hunter2'), 'the value is never repeated');
    }
  });

  it('warns about secrets it could not confirm, and warns when there is no settings file', () => {
    const r = check(GOOD, { secretsMissing: ['RAZORPAY_WEBHOOK_SECRET'], envFile: null });
    assert.deepEqual(r.errors, []);
    assert.ok(r.warnings.some((w) => /RAZORPAY_WEBHOOK_SECRET/.test(w) && /secrets:set/.test(w)));
    assert.ok(r.warnings.some((w) => /No functions\/\.env/.test(w)));
  });
});
