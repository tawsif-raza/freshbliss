'use strict';

// Tests for the Excel sync (create side). Run: npm run test:excel   (uses the Firestore emulator)
//
// S3 is replaced by an in-memory file (helpers/fakeStore.js), so no network or AWS account is needed.
// The workbook layer itself (conflicts, retries, bad files) is tested in s3Workbook.test.js.

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
const { EXCEL_COLUMNS, orderToRow, safeCell, appendRow, syncOrder, retryFailedSyncs, missingSettings } = sync;
const { fakeStore, awsError } = require('./helpers/fakeStore');

const SECRET = 'SUPER-SECRET-VALUE-9f3a';
const CFG = { bucket: 'freshbliss-orders', key: 'orders/orders.xlsx', region: 'ap-south-1', accessKeyId: 'AKIAEXAMPLE', secretAccessKey: SECRET, endpoint: '' };

let db;
before(() => {
  process.env.GCLOUD_PROJECT = 'demo-freshbliss';
  if (getApps().length === 0) initializeApp({ projectId: 'demo-freshbliss' });
  db = getFirestore();
});

// ---------- helpers ----------

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
const deps = (store, extra = {}) => ({ config: CFG, store, sleep: async () => {}, lookupCustomer: async () => ({ name: 'Asha', phone: '+91 99999 99999' }), ...extra });
const ledger = async () => (await db.doc(`excelSync/${orderId}`).get()).data();

// ============================================================
describe('the row', () => {
  it('writes the delivery slot: the chosen window, "As soon as possible", or blank for an old order', () => {
    const at = (slot) => orderToRow('o', sampleOrder({ slot }))[EXCEL_COLUMNS.indexOf('Delivery slot')];
    assert.equal(at({ date: '2026-10-05', id: '1800-2000', label: '6 pm to 8 pm', startsAt: '2026-10-05T12:30:00.000Z' }), '2026-10-05 6 pm to 8 pm');
    assert.equal(at(null), 'As soon as possible');
    assert.equal(at(undefined), '');
    assert.equal(at({ date: 5 }), '', 'a malformed slot is left blank, never written as junk');
  });

  it('keeps the three live columns last, so a status change rewrites only those', () => {
    assert.deepEqual(EXCEL_COLUMNS.slice(-3), ['Payment status', 'Order status', 'Last updated (IST)']);
    assert.equal(EXCEL_COLUMNS.length - sync.FIRST_LIVE_COLUMN, 3);
    assert.equal(EXCEL_COLUMNS[sync.FIRST_LIVE_COLUMN - 1], 'Delivery slot');
  });

  it('has one value per column, in the documented order', () => {
    const row = orderToRow('ord1', sampleOrder(), { name: 'Asha', phone: '+91 99999 99999' });
    assert.equal(row.length, EXCEL_COLUMNS.length);
    assert.equal(row.length, 19);
    assert.deepEqual(row, [
      'ord1', '2026-10-01 00:15', 'Asha', "'+91 99999 99999", // a leading + would be read as a formula, so it gets the apostrophe
      '12 MG Road, Indiranagar', '560100', 'Zone B',
      '2 × Classic Fresh Mix (Large); 1 × Tropical Bliss (Regular)',
      577, 0, 30, 0, 607, 'pay_123', 'Ring twice',
      '', // an order with no `slot` field at all (made before slots existed)
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
    assert.equal(row.length, 19);
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
    const guide = fs.readFileSync(path.join(__dirname, '..', 'docs', 'AWS_SETUP.md'), 'utf8');
    EXCEL_COLUMNS.forEach((header, i) => {
      const letter = String.fromCharCode(65 + i);
      assert.ok(guide.includes(`| ${letter} | ${header} |`), `AWS_SETUP.md should list "${header}" as column ${letter}`);
    });
  });
});

// ============================================================
describe('the settings', () => {
  it('lists what is still missing, and needs only the bucket and the AWS key', () => {
    assert.deepEqual(missingSettings(CFG), []);
    assert.deepEqual(missingSettings({ ...CFG, bucket: '', secretAccessKey: '' }), ['EXCEL_S3_BUCKET', 'EXCEL_AWS_SECRET_ACCESS_KEY']);
    assert.deepEqual(missingSettings({ ...CFG, accessKeyId: '' }), ['EXCEL_AWS_ACCESS_KEY_ID']);
  });
});

// ============================================================
describe('syncOrder (the whole job, with the real Firestore emulator)', () => {
  it('adds the row once and records DONE', async () => {
    const store = fakeStore();
    const r = await syncOrder(db, { orderId, order: sampleOrder(), deps: deps(store) });
    assert.equal(r.status, 'done');
    const rows = await store.rows();
    assert.equal(rows.length, 1);
    assert.equal(rows[0][0], orderId);
    assert.equal(rows[0][2], 'Asha', 'customer name from the lookup');
    assert.equal(rows[0][12], 607);
    const note = await ledger();
    assert.equal(note.state, 'DONE');
    assert.ok(note.rowAddedAt);
    assert.deepEqual(note.synced, { status: 'PAYMENT_CONFIRMED', paymentStatus: 'PAID' });
  });

  it('ignores a second delivery of the same event: no duplicate row', async () => {
    const store = fakeStore();
    await syncOrder(db, { orderId, order: sampleOrder(), deps: deps(store) });
    const again = await syncOrder(db, { orderId, order: sampleOrder(), deps: deps(store) });
    assert.deepEqual([again.status, again.reason], ['skipped', 'already in Excel']);
    assert.equal((await store.rows()).length, 1);
  });

  it('adds only one row when the same event runs several times at once', async () => {
    const store = fakeStore();
    const results = await Promise.all([1, 2, 3].map(() => syncOrder(db, { orderId, order: sampleOrder(), deps: deps(store) })));
    assert.equal((await store.rows()).length, 1);
    assert.equal(results.filter((r) => r.status === 'done').length, 1);
  });

  it('adds the row only once even if the ledger is lost: the sheet itself is checked', async () => {
    const store = fakeStore();
    await appendRow(CFG, orderId, orderToRow(orderId, sampleOrder()), { store }); // the row is already there, but there is no ledger note
    const r = await syncOrder(db, { orderId, order: sampleOrder(), deps: deps(store) });
    assert.equal(r.status, 'done');
    assert.equal(r.alreadyThere, true);
    assert.equal((await store.rows()).length, 1);
    assert.equal((await ledger()).state, 'DONE');
  });

  it('still ends DONE, with one row, when the save worked but the reply was lost', async () => {
    const store = fakeStore();
    const realPut = store.put;
    let lost = true;
    store.put = async (...args) => {
      await realPut(...args);
      if (lost) {
        lost = false;
        throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
      }
    };
    const r = await syncOrder(db, { orderId, order: sampleOrder(), deps: deps(store) });
    assert.equal(r.status, 'done');
    assert.equal((await store.rows()).length, 1);
  });

  it('survives a short AWS outage by itself (SlowDown, then fine)', async () => {
    const store = fakeStore().failNext('get', () => awsError('SlowDown', 503), 2);
    const waits = [];
    const r = await syncOrder(db, { orderId, order: sampleOrder(), deps: deps(store, { sleep: async (ms) => waits.push(ms) }) });
    assert.equal(r.status, 'done');
    assert.deepEqual(waits, [1000, 2000]);
  });

  it('NEVER throws when AWS refuses: it records FAILED with a hint, and keeps the secret out', async () => {
    const store = fakeStore().failNext('get', () => awsError('AccessDenied', 403), 5);
    const r = await syncOrder(db, { orderId, order: sampleOrder(), deps: deps(store) });
    assert.equal(r.status, 'failed');
    const note = await ledger();
    assert.equal(note.state, 'FAILED');
    assert.equal(note.error.status, 403);
    assert.equal(note.error.stage, 'read');
    assert.match(note.error.hint, /s3:ListBucket/);
    assert.ok(!JSON.stringify(note).includes(SECRET), 'the secret is not stored');
    assert.ok(!JSON.stringify(note).includes('12 MG Road'), 'the customer address is not stored');
  });

  it('records a wrong-key failure without crashing', async () => {
    const store = fakeStore().failNext('get', () => awsError('SignatureDoesNotMatch', 403), 5);
    const r = await syncOrder(db, { orderId, order: sampleOrder(), deps: deps(store) });
    assert.equal(r.status, 'failed');
    assert.match((await ledger()).error.hint, /EXCEL_AWS_SECRET_ACCESS_KEY/);
  });

  it('records FAILED (and leaves the file alone) when the file in S3 is not a workbook', async () => {
    const store = fakeStore();
    store.replaceFile('garbage');
    const r = await syncOrder(db, { orderId, order: sampleOrder(), deps: deps(store) });
    assert.equal(r.status, 'failed');
    assert.equal((await ledger()).error.code, 'bad-workbook');
    assert.equal(store.puts, 0);
  });

  it('does nothing, and says so, when AWS is not set up yet', async () => {
    const store = fakeStore();
    const cfg = { ...CFG, bucket: '', secretAccessKey: '' };
    const r = await syncOrder(db, { orderId, order: sampleOrder(), deps: deps(store, { config: cfg }) });
    assert.deepEqual([r.status, r.reason], ['skipped', 'not configured']);
    assert.equal(store.calls.length, 0, 'no calls to AWS at all');
    assert.equal(await ledger(), undefined, 'no ledger note either');
  });

  it('does not crash even if the ledger itself is broken', async () => {
    const brokenDb = { runTransaction: async () => { throw new Error('Firestore is down'); }, doc: () => ({}) };
    const r = await syncOrder(brokenDb, { orderId, order: sampleOrder(), deps: deps(fakeStore()) });
    assert.equal(r.status, 'failed');
  });

  it('does not retry a FAILED order by itself on a repeated event, but does when asked', async () => {
    const store = fakeStore().failNext('get', () => awsError('AccessDenied', 403));
    await syncOrder(db, { orderId, order: sampleOrder(), deps: deps(store) });
    assert.equal((await ledger()).state, 'FAILED');

    const repeat = await syncOrder(db, { orderId, order: sampleOrder(), deps: deps(store) });
    assert.equal(repeat.status, 'skipped');
    assert.equal(store.gets, 1, 'AWS was not asked again');

    const retried = await syncOrder(db, { orderId, order: sampleOrder(), allowFailed: true, deps: deps(store) });
    assert.equal(retried.status, 'done');
    const note = await ledger();
    assert.equal(note.state, 'DONE');
    assert.equal(note.error, undefined, 'the old error is cleared');
    assert.equal(note.attempts, 2);
  });

  it('skips an order another run is adding right now, but takes over a stale note from a crashed run', async () => {
    const store = fakeStore();
    await db.doc(`excelSync/${orderId}`).set({ state: 'PENDING', attempts: 1, updatedAt: Timestamp.now() });
    assert.equal((await syncOrder(db, { orderId, order: sampleOrder(), deps: deps(store) })).reason, 'another run is adding it');
    assert.equal(store.calls.length, 0);

    await db.doc(`excelSync/${orderId}`).set({ state: 'PENDING', attempts: 1, updatedAt: Timestamp.fromMillis(Date.now() - 10 * 60 * 1000) });
    assert.equal((await syncOrder(db, { orderId, order: sampleOrder(), deps: deps(store) })).status, 'done');
  });
});

// ============================================================
describe('retryFailedSyncs', () => {
  it('re-sends failed orders, adds each only once, and has nothing left for a person to check', async () => {
    const a = `${orderId}-a`;
    const b = `${orderId}-b`;
    // orders stored in Firestore need a real Timestamp (the fake one in sampleOrder is only for in-memory use)
    for (const id of [a, b]) {
      await db.doc(`orders/${id}`).set(sampleOrder({ createdAt: Timestamp.fromDate(new Date('2026-09-30T18:45:00Z')) }));
      await db.doc(`excelSync/${id}`).set({ state: 'FAILED', attempts: 1, updatedAt: Timestamp.now() });
    }
    const store = fakeStore();
    await appendRow(CFG, b, orderToRow(b, sampleOrder()), { store }); // b actually reached the sheet earlier; the reply was lost

    const r = await retryFailedSyncs(db, { limit: 500, deps: deps(store) });
    assert.ok(r.added >= 2);
    assert.equal(r.checkInExcel, undefined, 'there is no "check by hand" list any more');
    for (const id of [a, b]) assert.equal((await db.doc(`excelSync/${id}`).get()).get('state'), 'DONE');
    const ids = (await store.rows()).map((row) => row[0]);
    assert.equal(ids.filter((x) => x === a).length, 1);
    assert.equal(ids.filter((x) => x === b).length, 1, 'no duplicate for the one that was already there');
  });
});
