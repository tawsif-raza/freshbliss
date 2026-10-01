'use strict';

// Tests for the Excel sync. Run: npm run test:excel   (uses the Firestore emulator)
//
// Microsoft is replaced by a fake `fetch`, so no network, tenant or secret is needed.
// The fake returns exactly what Microsoft's token and Excel endpoints return.

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

// Use the SAME firebase-admin copy the functions use (two copies cannot share FieldValue).
const fromFunctions = createRequire(path.join(__dirname, '..', 'functions', 'package.json'));
const { initializeApp, getApps } = fromFunctions('firebase-admin/app');
const { getFirestore, Timestamp } = fromFunctions('firebase-admin/firestore');
const sync = require('../functions/excelSync');
const { EXCEL_COLUMNS, orderToRow, safeCell, getAccessToken, appendRow, syncOrder, retryFailedSyncs, GraphError } = sync;

const SECRET = 'SUPER-SECRET-VALUE-9f3a';
const CFG = {
  tenantId: 'tenant-1',
  clientId: 'client-1',
  clientSecret: SECRET,
  driveId: 'b!drive',
  itemId: 'item1',
  tableName: 'OrdersTable',
  loginUrl: 'https://login.test',
  apiUrl: 'https://graph.test',
};

let db;
before(() => {
  process.env.GCLOUD_PROJECT = 'demo-freshbliss';
  if (getApps().length === 0) initializeApp({ projectId: 'demo-freshbliss' });
  db = getFirestore();
});

beforeEach(() => sync._clearTokenCache());

// ---------- helpers ----------

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const TOKEN_OK = () => json({ token_type: 'Bearer', expires_in: 3600, access_token: 'tok-1' });
const ROW_OK = () => json({ index: 3, values: [[]] }, 201);

// A fake Microsoft. `script` is a function (call) => Response (or throws). Every call is recorded.
function fakeMicrosoft(script) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const call = { url, method: init.method, headers: init.headers || {}, body: init.body, kind: String(url).includes('/oauth2/') ? 'token' : 'append' };
    calls.push(call);
    return script(call, calls.filter((c) => c.kind === call.kind).length);
  };
  return { fetchImpl, calls, of: (kind) => calls.filter((c) => c.kind === kind) };
}
const happy = () => fakeMicrosoft((c) => (c.kind === 'token' ? TOKEN_OK() : ROW_OK()));

// A sleep that does not wait, and remembers how long it was asked to.
const fakeSleep = () => {
  const waits = [];
  return { sleep: async (ms) => waits.push(ms), waits };
};

let n = 0;
let orderId;
beforeEach(() => {
  n += 1;
  orderId = `xl-${Date.now()}-${n}`;
});

const sampleOrder = (over = {}) => ({
  uid: 'alice',
  status: 'PAYMENT_CONFIRMED',
  paymentStatus: 'PAID',
  createdAt: { toDate: () => new Date('2026-09-30T18:45:00Z') }, // 00:15 the next day in India
  address: '12 MG Road, Indiranagar',
  pincode: '560100',
  zone: { name: 'Zone B' },
  items: [
    { productId: 'a', name: 'Classic Fresh Mix', size: 'large', qty: 2 },
    { productId: 'b', name: 'Tropical Bliss', size: 'regular', qty: 1 },
  ],
  pricing: { subtotal: 577, discount: 0, deliveryFee: 30, tip: 0, total: 607 },
  payment: { razorpayPaymentId: 'pay_123' },
  note: 'Ring twice',
  ...over,
});
const deps = (ms, extra = {}) => ({ config: CFG, fetchImpl: ms.fetchImpl, sleep: async () => {}, lookupCustomer: async () => ({ name: 'Asha', phone: '+91 99999 99999' }), ...extra });
const ledger = async () => (await db.doc(`excelSync/${orderId}`).get()).data();

// ============================================================
describe('the row', () => {
  it('has one value per column, in the documented order', () => {
    const row = orderToRow('ord1', sampleOrder(), { name: 'Asha', phone: '+91 99999 99999' });
    assert.equal(row.length, EXCEL_COLUMNS.length);
    assert.equal(row.length, 18);
    assert.deepEqual(row, [
      'ord1', '2026-10-01 00:15', 'Asha', "'+91 99999 99999", // a leading + would be read as a formula, so it gets the apostrophe
      '12 MG Road, Indiranagar', '560100', 'Zone B',
      '2 × Classic Fresh Mix (Large); 1 × Tropical Bliss (Regular)',
      577, 0, 30, 0, 607, 'pay_123', 'Ring twice',
      // live columns
      'PAID', 'PAYMENT_CONFIRMED', '2026-10-01 00:15',
    ]);
  });

  it('writes money as numbers so Excel can add it up', () => {
    const row = orderToRow('o', sampleOrder());
    for (const i of [8, 9, 10, 11, 12]) assert.equal(typeof row[i], 'number');
  });

  it('shows "Guest" when there is no customer name', () => {
    assert.equal(orderToRow('o', sampleOrder(), {})[2], 'Guest');
    assert.equal(orderToRow('o', sampleOrder(), { name: '', phone: '' })[3], '');
  });

  it('keeps going when the order is missing most fields', () => {
    const row = orderToRow('o', {});
    assert.equal(row.length, 18);
    assert.deepEqual(row.slice(8, 13), [0, 0, 0, 0, 0]);
  });

  it('stops customer text from running as an Excel formula', () => {
    for (const evil of ['=HYPERLINK("http://evil","click")', '+1+1', '-2+3', '@SUM(A1)', '\t=1', '\r=1']) {
      assert.equal(safeCell(evil), `'${evil}`, `neutralises ${JSON.stringify(evil)}`);
    }
    const row = orderToRow('o', sampleOrder({ address: '=1+1', note: '@bad' }));
    assert.equal(row[4], "'=1+1");
    assert.equal(row[14], "'@bad");
  });

  it('leaves normal text and numbers alone', () => {
    assert.equal(safeCell('12 MG Road'), '12 MG Road');
    assert.equal(safeCell('Flat 4-B'), 'Flat 4-B');
    assert.equal(safeCell(-5), -5);
    assert.equal(safeCell(0), 0);
  });

  it('cuts very long text so one order cannot make an enormous cell', () => {
    const row = orderToRow('o', sampleOrder({ address: 'x'.repeat(5000), note: 'y'.repeat(5000) }));
    assert.equal(row[4].length, 500);
    assert.equal(row[14].length, 500);
  });
});

// ============================================================
describe('the setup guide lists the same columns as the code', () => {
  it('has every header, in the same order, in the right column letter', () => {
    const guide = fs.readFileSync(path.join(__dirname, '..', 'docs', 'AZURE_SETUP.md'), 'utf8');
    EXCEL_COLUMNS.forEach((header, i) => {
      const letter = String.fromCharCode(65 + i);
      assert.ok(guide.includes(`| ${letter} | ${header} |`), `AZURE_SETUP.md should list "${header}" as column ${letter}`);
    });
  });
});

// ============================================================
describe('getAccessToken', () => {
  it('asks Microsoft for an app-only token with the client credentials', async () => {
    const ms = happy();
    const token = await getAccessToken(CFG, { fetchImpl: ms.fetchImpl });
    assert.equal(token, 'tok-1');
    const [call] = ms.of('token');
    assert.equal(call.url, 'https://login.test/tenant-1/oauth2/v2.0/token');
    assert.equal(call.method, 'POST');
    assert.equal(call.headers['Content-Type'], 'application/x-www-form-urlencoded');
    const form = new URLSearchParams(call.body.toString());
    assert.equal(form.get('grant_type'), 'client_credentials');
    assert.equal(form.get('client_id'), 'client-1');
    assert.equal(form.get('client_secret'), SECRET);
    assert.equal(form.get('scope'), 'https://graph.test/.default');
  });

  it('reuses the token instead of asking again, and renews it before it expires', async () => {
    const ms = happy();
    let clock = 1_000_000;
    const now = () => clock;
    await getAccessToken(CFG, { fetchImpl: ms.fetchImpl, now });
    await getAccessToken(CFG, { fetchImpl: ms.fetchImpl, now });
    assert.equal(ms.of('token').length, 1, 'second call used the saved token');

    clock += 3600 * 1000 - 4 * 60 * 1000; // 4 minutes before it expires: inside the 5 minute margin
    await getAccessToken(CFG, { fetchImpl: ms.fetchImpl, now });
    assert.equal(ms.of('token').length, 2, 'renewed early');
  });

  it('explains a wrong secret and never repeats the secret', async () => {
    const ms = fakeMicrosoft(() =>
      json({ error: 'invalid_client', error_description: 'AADSTS7000215: Invalid client secret provided.\r\nTrace ID: abc\r\nTimestamp: 2026-10-01' }, 401),
    );
    const err = await getAccessToken(CFG, { fetchImpl: ms.fetchImpl }).catch((e) => e);
    assert.ok(err instanceof GraphError);
    assert.equal(err.stage, 'token');
    assert.equal(err.status, 401);
    assert.equal(err.retryable, false, 'a wrong secret will not fix itself');
    assert.match(err.message, /AADSTS7000215/);
    assert.doesNotMatch(err.message, /Trace ID/);
    assert.match(err.hint, /secret VALUE/);
    assert.ok(!JSON.stringify({ m: err.message, h: err.hint }).includes(SECRET));
  });

  it('treats Microsoft being busy as retryable, and escapes odd tenant ids', async () => {
    const busy = fakeMicrosoft(() => json({ error: 'temporarily_unavailable' }, 503));
    assert.equal((await getAccessToken(CFG, { fetchImpl: busy.fetchImpl }).catch((e) => e)).retryable, true);

    const ms = happy();
    await getAccessToken({ ...CFG, tenantId: '../evil?x=1', clientId: 'c2' }, { fetchImpl: ms.fetchImpl });
    assert.equal(ms.of('token')[0].url, 'https://login.test/..%2Fevil%3Fx%3D1/oauth2/v2.0/token');
  });
});

// ============================================================
describe('appendRow', () => {
  const ROW = ['a', 1];

  it('posts the row to the table "add rows" address', async () => {
    const ms = happy();
    const r = await appendRow(CFG, ROW, { fetchImpl: ms.fetchImpl });
    assert.equal(r.attempts, 1);
    const [call] = ms.of('append');
    assert.equal(call.url, 'https://graph.test/v1.0/drives/b!drive/items/item1/workbook/tables/OrdersTable/rows/add'.replace('b!drive', 'b!drive'));
    assert.equal(call.method, 'POST');
    assert.equal(call.headers.Authorization, 'Bearer tok-1');
    assert.deepEqual(JSON.parse(call.body), { index: null, values: [ROW] });
  });

  it('escapes ids so they cannot change the address', async () => {
    const ms = happy();
    await appendRow({ ...CFG, driveId: 'a/../b', itemId: 'x?y', tableName: 'My Table' }, ROW, { fetchImpl: ms.fetchImpl });
    assert.equal(ms.of('append')[0].url, 'https://graph.test/v1.0/drives/a%2F..%2Fb/items/x%3Fy/workbook/tables/My%20Table/rows/add');
  });

  it('on a 401 throws the saved token away, gets a new one, and succeeds', async () => {
    const ms = fakeMicrosoft((c, nth) => (c.kind === 'token' ? TOKEN_OK() : nth === 1 ? json({ error: { code: 'InvalidAuthenticationToken' } }, 401) : ROW_OK()));
    const r = await appendRow(CFG, ROW, { fetchImpl: ms.fetchImpl });
    assert.equal(r.attempts, 2);
    assert.equal(ms.of('token').length, 2, 'a fresh token was requested');
  });

  it('waits as long as Microsoft asks (Retry-After) when it is told to slow down', async () => {
    const ms = fakeMicrosoft((c, nth) => (c.kind === 'token' ? TOKEN_OK() : nth === 1 ? json({ error: { code: 'TooManyRequests' } }, 429, { 'retry-after': '2' }) : ROW_OK()));
    const { sleep, waits } = fakeSleep();
    const r = await appendRow(CFG, ROW, { fetchImpl: ms.fetchImpl, sleep });
    assert.equal(r.attempts, 2);
    assert.deepEqual(waits, [2000]);
  });

  it('never waits more than 15 seconds, even if told to', async () => {
    const ms = fakeMicrosoft((c, nth) => (c.kind === 'token' ? TOKEN_OK() : nth === 1 ? json({}, 429, { 'retry-after': '600' }) : ROW_OK()));
    const { sleep, waits } = fakeSleep();
    await appendRow(CFG, ROW, { fetchImpl: ms.fetchImpl, sleep });
    assert.deepEqual(waits, [15000]);
  });

  it('backs off 1s, 2s, 4s while the service is unavailable, then gives up after 4 tries', async () => {
    const ms = fakeMicrosoft((c) => (c.kind === 'token' ? TOKEN_OK() : json({ error: { code: 'serviceNotAvailable', message: 'busy' } }, 503)));
    const { sleep, waits } = fakeSleep();
    const err = await appendRow(CFG, ROW, { fetchImpl: ms.fetchImpl, sleep }).catch((e) => e);
    assert.equal(ms.of('append').length, 4);
    assert.deepEqual(waits, [1000, 2000, 4000]);
    assert.equal(err.status, 503);
    assert.equal(err.maybeAppended, false, '503 means it was not added');
  });

  it('retries a locked workbook (423) and a conflict (409)', async () => {
    for (const status of [423, 409]) {
      sync._clearTokenCache();
      const ms = fakeMicrosoft((c, nth) => (c.kind === 'token' ? TOKEN_OK() : nth === 1 ? json({ error: { code: 'resourceLocked' } }, status) : ROW_OK()));
      const r = await appendRow(CFG, ROW, { fetchImpl: ms.fetchImpl, sleep: async () => {} });
      assert.equal(r.attempts, 2, `retried after ${status}`);
    }
  });

  it('does not retry a wrong file (404) and explains how to fix it', async () => {
    const ms = fakeMicrosoft((c) => (c.kind === 'token' ? TOKEN_OK() : json({ error: { code: 'itemNotFound', message: 'Item not found' } }, 404)));
    const err = await appendRow(CFG, ROW, { fetchImpl: ms.fetchImpl, sleep: async () => {} }).catch((e) => e);
    assert.equal(ms.of('append').length, 1);
    assert.equal(err.status, 404);
    assert.match(err.hint, /EXCEL_DRIVE_ID/);
  });

  it('does not retry missing permission (403) and points at admin consent', async () => {
    const ms = fakeMicrosoft((c) => (c.kind === 'token' ? TOKEN_OK() : json({ error: { code: 'accessDenied' } }, 403)));
    const err = await appendRow(CFG, ROW, { fetchImpl: ms.fetchImpl, sleep: async () => {} }).catch((e) => e);
    assert.equal(ms.of('append').length, 1);
    assert.match(err.hint, /admin consent/);
  });

  it('explains a wrong column count (400)', async () => {
    const ms = fakeMicrosoft((c) => (c.kind === 'token' ? TOKEN_OK() : json({ error: { code: 'InvalidArgument' } }, 400)));
    const err = await appendRow(CFG, ROW, { fetchImpl: ms.fetchImpl }).catch((e) => e);
    assert.match(err.hint, /number of columns/);
  });

  it('does NOT retry a server error (500): the row may already be in Excel, so it flags that', async () => {
    const ms = fakeMicrosoft((c) => (c.kind === 'token' ? TOKEN_OK() : json({ error: { code: 'generalException' } }, 500)));
    const err = await appendRow(CFG, ROW, { fetchImpl: ms.fetchImpl, sleep: async () => {} }).catch((e) => e);
    assert.equal(ms.of('append').length, 1, 'one try only, so a duplicate row cannot be created');
    assert.equal(err.maybeAppended, true);
  });

  it('does NOT retry a timeout, for the same reason', async () => {
    const ms = fakeMicrosoft((c) => {
      if (c.kind === 'token') return TOKEN_OK();
      throw new DOMException('The operation timed out.', 'TimeoutError');
    });
    const err = await appendRow(CFG, ROW, { fetchImpl: ms.fetchImpl, sleep: async () => {} }).catch((e) => e);
    assert.equal(ms.of('append').length, 1);
    assert.equal(err.maybeAppended, true);
    assert.equal(err.code, 'timeout');
  });

  it('DOES retry when it could not even connect (nothing was sent)', async () => {
    const refused = () => Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    const ms = fakeMicrosoft((c, nth) => {
      if (c.kind === 'token') return TOKEN_OK();
      if (nth === 1) throw refused();
      return ROW_OK();
    });
    const r = await appendRow(CFG, ROW, { fetchImpl: ms.fetchImpl, sleep: async () => {} });
    assert.equal(r.attempts, 2);
  });

  it('retries the token request after a network problem (getting a token changes nothing)', async () => {
    const ms = fakeMicrosoft((c, nth) => {
      if (c.kind === 'token' && nth === 1) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });
      return c.kind === 'token' ? TOKEN_OK() : ROW_OK();
    });
    const r = await appendRow(CFG, ROW, { fetchImpl: ms.fetchImpl, sleep: async () => {} });
    assert.equal(r.attempts, 2);
  });

  it('does not retry a wrong secret', async () => {
    const ms = fakeMicrosoft(() => json({ error: 'invalid_client', error_description: 'AADSTS7000215: bad' }, 401));
    const err = await appendRow(CFG, ROW, { fetchImpl: ms.fetchImpl, sleep: async () => {} }).catch((e) => e);
    assert.equal(ms.of('token').length, 1);
    assert.equal(err.stage, 'token');
  });
});

// ============================================================
describe('syncOrder (the whole job, with the real Firestore emulator)', () => {
  it('adds the row once and records DONE', async () => {
    const ms = happy();
    const r = await syncOrder(db, { orderId, order: sampleOrder(), deps: deps(ms) });
    assert.equal(r.status, 'done');
    assert.equal(ms.of('append').length, 1);
    const sent = JSON.parse(ms.of('append')[0].body).values[0];
    assert.equal(sent[0], orderId);
    assert.equal(sent[2], 'Asha', 'customer name from the lookup');
    assert.equal(sent[12], 607);
    const note = await ledger();
    assert.equal(note.state, 'DONE');
    assert.ok(note.rowAddedAt);
  });

  it('ignores a second delivery of the same event: no duplicate row', async () => {
    const ms = happy();
    await syncOrder(db, { orderId, order: sampleOrder(), deps: deps(ms) });
    const again = await syncOrder(db, { orderId, order: sampleOrder(), deps: deps(ms) });
    assert.deepEqual([again.status, again.reason], ['skipped', 'already in Excel']);
    assert.equal(ms.of('append').length, 1);
  });

  it('adds only one row when the same event runs several times at once', async () => {
    const ms = happy();
    const results = await Promise.all([1, 2, 3].map(() => syncOrder(db, { orderId, order: sampleOrder(), deps: deps(ms) })));
    assert.equal(ms.of('append').length, 1);
    assert.equal(results.filter((r) => r.status === 'done').length, 1);
  });

  it('NEVER throws when Excel fails: it records FAILED with a hint, and keeps the secret out', async () => {
    const ms = fakeMicrosoft((c) => (c.kind === 'token' ? TOKEN_OK() : json({ error: { code: 'itemNotFound', message: 'Item not found' } }, 404)));
    const r = await syncOrder(db, { orderId, order: sampleOrder(), deps: deps(ms) });
    assert.equal(r.status, 'failed');
    const note = await ledger();
    assert.equal(note.state, 'FAILED');
    assert.equal(note.error.status, 404);
    assert.equal(note.error.stage, 'append');
    assert.match(note.error.hint, /EXCEL_DRIVE_ID/);
    assert.equal(note.maybeAppended, false);
    assert.ok(!JSON.stringify(note).includes(SECRET), 'the secret is not stored');
    assert.ok(!JSON.stringify(note).includes('12 MG Road'), 'the customer address is not stored');
  });

  it('records a wrong-secret failure without crashing', async () => {
    const ms = fakeMicrosoft(() => json({ error: 'invalid_client', error_description: 'AADSTS7000215: Invalid client secret' }, 401));
    const r = await syncOrder(db, { orderId, order: sampleOrder(), deps: deps(ms) });
    assert.equal(r.status, 'failed');
    assert.match((await ledger()).error.hint, /secret VALUE/);
  });

  it('does nothing, and says so, when Azure is not set up yet', async () => {
    const ms = happy();
    const cfg = { ...CFG, tenantId: '', clientSecret: '' };
    const r = await syncOrder(db, { orderId, order: sampleOrder(), deps: deps(ms, { config: cfg }) });
    assert.deepEqual([r.status, r.reason], ['skipped', 'not configured']);
    assert.equal(ms.calls.length, 0, 'no network calls at all');
    assert.equal(await ledger(), undefined, 'no ledger note either');
  });

  it('does not crash even if the ledger itself is broken', async () => {
    const brokenDb = { runTransaction: async () => { throw new Error('Firestore is down'); }, doc: () => ({}) };
    const r = await syncOrder(brokenDb, { orderId, order: sampleOrder(), deps: deps(happy()) });
    assert.equal(r.status, 'failed');
  });

  it('does not retry a FAILED order by itself on a repeated event, but does when asked', async () => {
    let healthy = false;
    const ms = fakeMicrosoft((c) => (c.kind === 'token' ? TOKEN_OK() : healthy ? ROW_OK() : json({ error: { code: 'itemNotFound' } }, 404)));
    await syncOrder(db, { orderId, order: sampleOrder(), deps: deps(ms) });
    assert.equal((await ledger()).state, 'FAILED');

    const repeat = await syncOrder(db, { orderId, order: sampleOrder(), deps: deps(ms) });
    assert.equal(repeat.status, 'skipped');
    assert.equal(ms.of('append').length, 1);

    healthy = true;
    const retried = await syncOrder(db, { orderId, order: sampleOrder(), allowFailed: true, deps: deps(ms) });
    assert.equal(retried.status, 'done');
    const note = await ledger();
    assert.equal(note.state, 'DONE');
    assert.equal(note.error, undefined, 'the old error is cleared');
    assert.equal(note.attempts, 2);
  });

  it('skips an order another run is adding right now, but takes over a stale note from a crashed run', async () => {
    const ms = happy();
    await db.doc(`excelSync/${orderId}`).set({ state: 'PENDING', attempts: 1, updatedAt: Timestamp.now() });
    assert.equal((await syncOrder(db, { orderId, order: sampleOrder(), deps: deps(ms) })).reason, 'another run is adding it');
    assert.equal(ms.calls.length, 0);

    await db.doc(`excelSync/${orderId}`).set({ state: 'PENDING', attempts: 1, updatedAt: Timestamp.fromMillis(Date.now() - 10 * 60 * 1000) });
    assert.equal((await syncOrder(db, { orderId, order: sampleOrder(), deps: deps(ms) })).status, 'done');
  });

  it('flags a timeout as "maybe in Excel" so nobody blindly re-sends it', async () => {
    const ms = fakeMicrosoft((c) => {
      if (c.kind === 'token') return TOKEN_OK();
      throw new DOMException('timed out', 'TimeoutError');
    });
    const r = await syncOrder(db, { orderId, order: sampleOrder(), deps: deps(ms) });
    assert.equal(r.maybeAppended, true);
    assert.equal((await ledger()).maybeAppended, true);
  });
});

// ============================================================
describe('retryFailedSyncs', () => {
  it('re-sends fixable failures and lists the ones that need a human to check Excel', async () => {
    const fixable = `${orderId}-fix`;
    const unsure = `${orderId}-unsure`;
    // orders stored in Firestore need a real Timestamp (the fake one in sampleOrder is only for in-memory use)
    for (const id of [fixable, unsure]) await db.doc(`orders/${id}`).set(sampleOrder({ createdAt: Timestamp.fromDate(new Date('2026-09-30T18:45:00Z')) }));
    await db.doc(`excelSync/${fixable}`).set({ state: 'FAILED', maybeAppended: false, attempts: 1, updatedAt: Timestamp.now() });
    await db.doc(`excelSync/${unsure}`).set({ state: 'FAILED', maybeAppended: true, attempts: 1, updatedAt: Timestamp.now() });

    const ms = happy();
    const r = await retryFailedSyncs(db, { limit: 500, deps: deps(ms) });
    assert.ok(r.added >= 1);
    assert.ok(r.checkInExcel.includes(unsure), 'the unsure one is listed, not re-sent');
    assert.equal((await db.doc(`excelSync/${fixable}`).get()).get('state'), 'DONE');
    assert.equal((await db.doc(`excelSync/${unsure}`).get()).get('state'), 'FAILED');
    const sentIds = ms.of('append').map((c) => JSON.parse(c.body).values[0][0]);
    assert.ok(sentIds.includes(fixable));
    assert.ok(!sentIds.includes(unsure));
  });
});
