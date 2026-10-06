'use strict';

// Tests for the rate limits and the App Check switch. Run: npm run test:unit   (no emulator, no network)
//
// The database is a tiny in-memory fake with just enough of Firestore (doc, get, set, transactions).

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { LIMITS, clientAddress, keysFor, enforce, assertNotBlocked, recordFailure } = require('../functions/shared/rateLimit');
const { callableOptions, ENFORCE_APP_CHECK, REGION } = require('../functions/shared/hardening');

function fakeDb({ failWith } = {}) {
  const docs = new Map();
  const snap = (p) => ({ exists: docs.has(p), get: (f) => docs.get(p)?.[f] });
  const ref = (p) => ({ path: p, get: async () => snap(p) });
  return {
    docs,
    doc: ref,
    runTransaction: async (fn) => {
      if (failWith) throw failWith;
      return fn({ get: async (r) => snap(r.path), set: (r, data) => docs.set(r.path, data) });
    },
  };
}

const call = ({ uid = 'u1', ip = '203.0.113.7' } = {}) => ({ auth: uid ? { uid } : undefined, rawRequest: { headers: ip ? { 'x-forwarded-for': ip } : {} } });
const exhausted = (err) => {
  assert.equal(err.code, 'resource-exhausted');
  assert.ok(err.details.retryAfterSec >= 1);
  assert.match(err.message, /too often/);
  return true;
};

describe('who a request is counted as', () => {
  it('uses the LAST x-forwarded-for entry, because the caller can type everything before it', () => {
    const request = { rawRequest: { headers: { 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 203.0.113.7' } } };
    assert.equal(clientAddress(request), clientAddress(call({ ip: '203.0.113.7' })));
    assert.notEqual(clientAddress(request), clientAddress(call({ ip: '1.1.1.1' })));
  });

  it('never keeps the address itself, only a hash', () => {
    const h = clientAddress(call({ ip: '203.0.113.7' }));
    assert.match(h, /^[0-9a-f]{32}$/);
    assert.ok(!h.includes('203'));
  });

  it('counts by user and by address; signed-out or unknown-address requests just have fewer keys', () => {
    assert.deepEqual(keysFor(call()).map((k) => k.scope), ['uid', 'ip']);
    assert.deepEqual(keysFor(call({ uid: null })).map((k) => k.scope), ['ip']);
    assert.deepEqual(keysFor({ auth: { uid: 'u1' }, rawRequest: { headers: {} } }).map((k) => k.scope), ['uid']);
  });
});

describe('enforce (calls per window)', () => {
  const { limit } = LIMITS.createCheckout.uid;

  it('lets a normal customer through, then stops the call after the limit', async () => {
    const db = fakeDb();
    for (let i = 0; i < limit; i++) await enforce(db, call(), 'createCheckout', { now: 1000 + i });
    await assert.rejects(enforce(db, call(), 'createCheckout', { now: 2000 }), exhausted);
  });

  it('tells the caller how long to wait, which shrinks as the window runs out', async () => {
    const db = fakeDb();
    for (let i = 0; i < limit; i++) await enforce(db, call(), 'createCheckout', { now: 0 });
    await assert.rejects(enforce(db, call(), 'createCheckout', { now: 0 }), (e) => e.details.retryAfterSec === 600);
    await assert.rejects(enforce(db, call(), 'createCheckout', { now: 590_000 }), (e) => e.details.retryAfterSec === 10);
  });

  it('starts counting again once the window is over', async () => {
    const db = fakeDb();
    for (let i = 0; i < limit; i++) await enforce(db, call(), 'createCheckout', { now: 0 });
    await enforce(db, call(), 'createCheckout', { now: LIMITS.createCheckout.uid.windowSec * 1000 });
  });

  it('keeps users apart', async () => {
    const db = fakeDb();
    for (let i = 0; i < limit; i++) await enforce(db, call({ uid: 'a', ip: null }), 'createCheckout', { now: 0 });
    await assert.rejects(enforce(db, call({ uid: 'a', ip: null }), 'createCheckout', { now: 0 }), exhausted);
    await enforce(db, call({ uid: 'b', ip: null }), 'createCheckout', { now: 0 });
  });

  it('also stops one address that spreads its calls over many free anonymous accounts', async () => {
    const db = fakeDb();
    const ipLimit = LIMITS.createCheckout.ip.limit;
    for (let i = 0; i < ipLimit; i++) await enforce(db, call({ uid: `bot${i}` }), 'createCheckout', { now: 0 });
    await assert.rejects(enforce(db, call({ uid: 'bot-new' }), 'createCheckout', { now: 0 }), exhausted);
  });

  it('keeps each limit separate', async () => {
    const db = fakeDb();
    for (let i = 0; i < limit; i++) await enforce(db, call(), 'createCheckout', { now: 0 });
    await enforce(db, call(), 'previewCheckout', { now: 0 });
  });

  it('writes a document the TTL policy can clean up, and no raw address', async () => {
    const db = fakeDb();
    await enforce(db, call(), 'previewCheckout', { now: 5000 });
    const paths = [...db.docs.keys()];
    assert.ok(paths.every((p) => p.startsWith('rateLimits/previewCheckout__')));
    assert.ok(paths.every((p) => !p.includes('203.0.113.7')));
    for (const doc of db.docs.values()) {
      assert.equal(doc.count, 1);
      assert.ok(doc.expiresAt instanceof Date && doc.expiresAt.getTime() > 5000 + LIMITS.previewCheckout.uid.windowSec * 1000);
    }
  });

  it('LETS THE CUSTOMER THROUGH if counting itself breaks (a broken counter must not stop payments)', async () => {
    await enforce(fakeDb({ failWith: new Error('firestore is down') }), call(), 'createCheckout');
  });
});

describe('wrong promo codes', () => {
  const { limit } = LIMITS.badPromo.uid;

  it('are fine until the caller has used up their guesses; then everything waits, even a right code', async () => {
    const db = fakeDb();
    for (let i = 0; i < limit; i++) {
      await assertNotBlocked(db, call(), 'badPromo', { now: 0 });
      await recordFailure(db, call(), 'badPromo', { now: 0 });
    }
    await assert.rejects(assertNotBlocked(db, call(), 'badPromo', { now: 1000 }), exhausted);
  });

  it('forgives after the window, and checking alone never counts', async () => {
    const db = fakeDb();
    for (let i = 0; i < limit; i++) await recordFailure(db, call(), 'badPromo', { now: 0 });
    await assertNotBlocked(db, call(), 'badPromo', { now: LIMITS.badPromo.uid.windowSec * 1000 });
    const fresh = fakeDb();
    for (let i = 0; i < 100; i++) await assertNotBlocked(fresh, call(), 'badPromo', { now: 0 });
    assert.equal(fresh.docs.size, 0);
  });

  it('a counter that cannot be written never throws into the customer', async () => {
    await recordFailure(fakeDb({ failWith: new Error('down') }), call(), 'badPromo');
  });
});

describe('App Check', () => {
  it('every callable function is declared with callableOptions (App Check switch, region)', () => {
    const dir = path.join(__dirname, '..', 'functions');
    const offenders = [];
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
      if (['devGrantStaff.js', 'createMockOrder.js'].includes(file)) continue; // emulator-only, never deployed
      const text = fs.readFileSync(path.join(dir, file), 'utf8').replace(/^\s*\/\/.*$/gm, ''); // without whole-line comments
      for (const match of text.matchAll(/onCall\(\s*([^\n]*)/g)) {
        if (!match[1].startsWith('callableOptions(')) offenders.push(`${file}: onCall(${match[1]}`);
      }
    }
    assert.deepEqual(offenders, []);
  });

  it("callableOptions keeps the region, adds the switch and passes the function's own settings through", () => {
    const o = callableOptions({ timeoutSeconds: 30 });
    assert.equal(o.region, REGION);
    assert.equal(o.timeoutSeconds, 30);
    assert.equal(typeof o.enforceAppCheck.value, 'function', 'a deploy setting (ENFORCE_APP_CHECK), not a hard-coded value');
  });

  it('is OFF unless ENFORCE_APP_CHECK says true (so a deploy before the reCAPTCHA key exists cannot lock customers out)', () => {
    const before = process.env.ENFORCE_APP_CHECK;
    try {
      delete process.env.ENFORCE_APP_CHECK;
      assert.equal(ENFORCE_APP_CHECK.value(), false);
      process.env.ENFORCE_APP_CHECK = 'true';
      assert.equal(ENFORCE_APP_CHECK.value(), true);
    } finally {
      if (before === undefined) delete process.env.ENFORCE_APP_CHECK;
      else process.env.ENFORCE_APP_CHECK = before;
    }
  });
});
