'use strict';

// Tests for keeping Excel rows up to date. Run: npm run test:excel (uses the Firestore emulator).
//
// Microsoft Excel is replaced by a small in-memory TABLE that behaves like the real
// one for the three calls we make: add a row, read the Order ID column, and write a
// range of cells. Tests can sort it, edit it, delete from it and break it.

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');

// Use the SAME firebase-admin copy the functions use (two copies cannot share FieldValue).
const fromFunctions = createRequire(path.join(__dirname, '..', 'functions', 'package.json'));
const { initializeApp, getApps } = fromFunctions('firebase-admin/app');
const { getFirestore, Timestamp } = fromFunctions('firebase-admin/firestore');
const sync = require('../functions/excelSync');
const update = require('../functions/excelSyncUpdate');
const { EXCEL_COLUMNS, orderToRow, syncOrder, FIRST_LIVE_COLUMN } = sync;
const { liveFieldsChanged, parseRangeAddress, findRows, reconcileOrder, retryFailedUpdates } = update;

const CFG = { tenantId: 't', clientId: 'c', clientSecret: 'SECRET-xyz', driveId: 'b!drive', itemId: 'item1', tableName: 'OrdersTable', loginUrl: 'https://login.test', apiUrl: 'https://graph.test' };
const STATUS = FIRST_LIVE_COLUMN + 1; // "Order status" column index
const PAYMENT = FIRST_LIVE_COLUMN; // "Payment status"
const UPDATED = FIRST_LIVE_COLUMN + 2; // "Last updated (IST)"

let db;
before(() => {
  process.env.GCLOUD_PROJECT = 'demo-freshbliss';
  if (getApps().length === 0) initializeApp({ projectId: 'demo-freshbliss' });
  db = getFirestore();
});
beforeEach(() => sync._clearTokenCache());

// ---------- a fake Excel table ----------

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const letterToIndex = (letters) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

function fakeExcel() {
  const excel = { rows: [], calls: [], hooks: [] };
  excel.count = (method, needle = '') => excel.calls.filter((c) => c.method === method && c.url.includes(needle)).length;
  excel.fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const method = init.method || 'GET';
    excel.calls.push({ method, url: u });
    for (const hook of excel.hooks) {
      const override = await hook({ method, url: u });
      if (override) return override; // a hook can answer instead (to simulate a failure)
    }
    if (u.includes('/oauth2/')) return json({ token_type: 'Bearer', expires_in: 3600, access_token: 'tok' });
    if (method === 'POST' && u.endsWith('/rows/add')) {
      excel.rows.push(JSON.parse(init.body).values[0]);
      return json({ index: excel.rows.length - 1 }, 201);
    }
    if (method === 'GET' && u.includes("/columns('Order%20ID')/dataBodyRange")) {
      return json({ address: `Orders!A2:A${excel.rows.length + 1}`, values: excel.rows.map((r) => [r[0]]) });
    }
    const m = /\/worksheets\/([^/]+)\/range\(address='([A-Z]+)(\d+):([A-Z]+)(\d+)'\)$/.exec(u);
    if (method === 'PATCH' && m) {
      assert.equal(decodeURIComponent(m[1]), 'Orders');
      assert.equal(m[3], m[5], 'one row at a time');
      const row = excel.rows[Number(m[3]) - 2];
      const values = JSON.parse(init.body).values[0];
      assert.equal(values.length, letterToIndex(m[4]) - letterToIndex(m[2]) + 1, 'as many values as cells');
      values.forEach((v, i) => (row[letterToIndex(m[2]) + i] = v));
      return json({ address: `Orders!${m[2]}${m[3]}:${m[4]}${m[5]}` });
    }
    return json({ error: { code: 'unexpected', message: `${method} ${u}` } }, 404);
  };
  return excel;
}

// ---------- helpers ----------

let n = 0;
beforeEach(() => (n += 1));
const nextId = () => `up-${Date.now()}-${n}-${Math.floor(Math.random() * 1e6)}`;

const baseOrder = () => ({
  uid: 'alice',
  status: 'PAYMENT_CONFIRMED',
  paymentStatus: 'PAID',
  address: '12 MG Road',
  pincode: '560100',
  zone: { name: 'Zone B' },
  items: [{ productId: 'a', name: 'Classic Fresh Mix', size: 'large', qty: 1 }],
  pricing: { subtotal: 199, discount: 0, deliveryFee: 30, tip: 0, total: 229 },
  payment: { razorpayPaymentId: 'pay_1' },
  note: '',
  createdAt: Timestamp.now(),
  updatedAt: Timestamp.now(),
});

// An order in Firestore, its ledger note, and (optionally) its row in the fake Excel.
async function seed(excel, over = {}, { ledger = 'DONE', addRow = true } = {}) {
  const id = nextId();
  const order = { ...baseOrder(), ...over };
  await db.doc(`orders/${id}`).set(order);
  if (ledger) {
    await db.doc(`excelSync/${id}`).set({ state: ledger, attempts: 1, updatedAt: Timestamp.now(), ...(ledger === 'DONE' ? { synced: { status: order.status, paymentStatus: order.paymentStatus } } : {}) });
  }
  if (addRow) excel.rows.push(orderToRow(id, order));
  return id;
}
const setOrder = (id, fields) => db.doc(`orders/${id}`).update({ ...fields, updatedAt: Timestamp.now() });
const note = async (id) => (await db.doc(`excelSync/${id}`).get()).data();
const rowOf = (excel, id) => excel.rows.find((r) => r[0] === id);
const deps = (excel, extra = {}) => ({ config: CFG, fetchImpl: excel.fetchImpl, sleep: async () => {}, ...extra });

// ============================================================
describe('what counts as a change worth copying', () => {
  it('cares only about status and paymentStatus', () => {
    const o = { status: 'PACKED', paymentStatus: 'PAID', pin: '1234' };
    assert.equal(liveFieldsChanged(o, { ...o, status: 'OUT_FOR_DELIVERY' }), true);
    assert.equal(liveFieldsChanged(o, { ...o, paymentStatus: 'REFUND_PENDING' }), true);
    assert.equal(liveFieldsChanged(o, { ...o, pin: '9999', rider: { name: 'x' }, updatedAt: 1 }), false);
    assert.equal(liveFieldsChanged(o, { ...o }), false);
  });
  it('ignores events with no before or after', () => {
    assert.equal(liveFieldsChanged(undefined, { status: 'A' }), false);
    assert.equal(liveFieldsChanged({ status: 'A' }, undefined), false);
  });
});

describe('reading Microsoft\'s range addresses', () => {
  it('handles plain, quoted, absolute and single-cell addresses', () => {
    assert.deepEqual(parseRangeAddress('Orders!A2:A9'), { sheet: 'Orders', firstRow: 2 });
    assert.deepEqual(parseRangeAddress("'My Orders'!$A$2:$A$9"), { sheet: 'My Orders', firstRow: 2 });
    assert.deepEqual(parseRangeAddress("'Bob''s Orders'!A5"), { sheet: "Bob's Orders", firstRow: 5 });
    assert.equal(parseRangeAddress('nonsense'), null);
    assert.equal(parseRangeAddress(undefined), null);
  });

  it('turns a column of ids into sheet row numbers', () => {
    const data = { address: 'Orders!A2:A5', values: [['a'], ['b'], ['c'], ['b']] };
    assert.deepEqual(findRows(data, 'b'), [{ sheet: 'Orders', row: 3 }, { sheet: 'Orders', row: 5 }]);
    assert.deepEqual(findRows(data, 'zzz'), []);
    assert.deepEqual(findRows({ address: 'Orders!A7:A7', values: [["'x"]] }, 'x'), [{ sheet: 'Orders', row: 7 }], 'ignores the safety apostrophe');
  });

  it('refuses a reply it cannot make sense of', () => {
    assert.throws(() => findRows({ values: [] }, 'a'), /could not read/);
    assert.throws(() => findRows({ address: 'Orders!A2:A3' }, 'a'), /could not read/);
  });
});

// ============================================================
describe('reconcileOrder: updating the row', () => {
  it('rewrites ONLY the three live cells; everything else in the row is left alone', async () => {
    const excel = fakeExcel();
    const id = await seed(excel);
    const before = [...rowOf(excel, id)];
    rowOf(excel, id)[14] = 'Staff typed this note by hand'; // a manual edit in the Note column
    rowOf(excel, id)[18] = 'extra staff column'; // a column staff added to the right of the table
    await setOrder(id, { status: 'PREPARING' });

    const r = await reconcileOrder(db, { orderId: id, deps: deps(excel) });
    assert.deepEqual([r.status, r.rows], ['updated', 1]);

    const row = rowOf(excel, id);
    assert.equal(row[STATUS], 'PREPARING');
    assert.equal(row[PAYMENT], 'PAID');
    assert.notEqual(row[UPDATED], '', 'last-updated time is written');
    for (let i = 0; i < FIRST_LIVE_COLUMN; i++) {
      if (i === 14) continue;
      assert.deepEqual(row[i], before[i], `column ${EXCEL_COLUMNS[i]} untouched`);
    }
    assert.equal(row[14], 'Staff typed this note by hand', 'a hand-edited cell survives');
    assert.equal(row[18], 'extra staff column', 'an extra column to the right survives');
    assert.equal(excel.count('PATCH'), 1, 'one small write');
  });

  it('follows an order through its whole life, including cancel and refund', async () => {
    const excel = fakeExcel();
    const id = await seed(excel);
    for (const fields of [
      { status: 'PREPARING' },
      { status: 'PACKED' },
      { status: 'OUT_FOR_DELIVERY' },
      { status: 'CANCELLED', paymentStatus: 'REFUND_PENDING' },
      { paymentStatus: 'REFUNDED' },
    ]) {
      await setOrder(id, fields);
      assert.equal((await reconcileOrder(db, { orderId: id, deps: deps(excel) })).status, 'updated');
      const o = (await db.doc(`orders/${id}`).get()).data();
      assert.equal(rowOf(excel, id)[STATUS], o.status);
      assert.equal(rowOf(excel, id)[PAYMENT], o.paymentStatus);
    }
    assert.deepEqual([rowOf(excel, id)[PAYMENT], rowOf(excel, id)[STATUS]], ['REFUNDED', 'CANCELLED']);
    assert.deepEqual((await note(id)).synced, { status: 'CANCELLED', paymentStatus: 'REFUNDED' });
  });

  it('finds the right row after staff sort the table, and leaves every other order alone', async () => {
    const excel = fakeExcel();
    const ids = [];
    for (let i = 0; i < 5; i++) ids.push(await seed(excel));
    excel.rows.reverse(); // staff sorted the table: the row numbers all changed
    excel.rows.push(excel.rows.shift()); // ...and again

    const target = ids[2];
    await setOrder(target, { status: 'PACKED' });
    await reconcileOrder(db, { orderId: target, deps: deps(excel) });

    for (const id of ids) assert.equal(rowOf(excel, id)[STATUS], id === target ? 'PACKED' : 'PAYMENT_CONFIRMED');
  });

  it('updates every copy if an order somehow appears twice', async () => {
    const excel = fakeExcel();
    const id = await seed(excel);
    excel.rows.push([...rowOf(excel, id)]);
    await setOrder(id, { status: 'PREPARING' });
    const r = await reconcileOrder(db, { orderId: id, deps: deps(excel) });
    assert.equal(r.rows, 2);
    assert.ok(excel.rows.every((row) => row[STATUS] === 'PREPARING'));
  });

  it('does nothing, with no Microsoft calls, when Excel already shows the right thing', async () => {
    const excel = fakeExcel();
    const id = await seed(excel);
    const r = await reconcileOrder(db, { orderId: id, deps: deps(excel) });
    assert.deepEqual([r.status, r.reason], ['skipped', 'already up to date']);
    assert.equal(excel.calls.length, 0);
  });

  it('a repeated event for the same change makes only one write', async () => {
    const excel = fakeExcel();
    const id = await seed(excel);
    await setOrder(id, { status: 'PACKED' });
    await Promise.all([1, 2, 3].map(() => reconcileOrder(db, { orderId: id, deps: deps(excel) })));
    await reconcileOrder(db, { orderId: id, deps: deps(excel) });
    assert.equal(rowOf(excel, id)[STATUS], 'PACKED');
    const writesNow = excel.count('PATCH');
    await reconcileOrder(db, { orderId: id, deps: deps(excel) });
    assert.equal(excel.count('PATCH'), writesNow, 'nothing more to write');
  });

  it('writes anyway when told to (the retry button)', async () => {
    const excel = fakeExcel();
    const id = await seed(excel);
    const r = await reconcileOrder(db, { orderId: id, force: true, deps: deps(excel) });
    assert.equal(r.status, 'updated');
    assert.equal(excel.count('PATCH'), 1);
  });
});

// ============================================================
describe('reconcileOrder: things that go wrong', () => {
  it('survives an update that arrives before the row exists, by waiting for it', async () => {
    const excel = fakeExcel();
    const id = await seed(excel, {}, { ledger: 'PENDING', addRow: false }); // create is still running
    await setOrder(id, { status: 'PREPARING' });

    let polls = 0;
    const sleep = async () => {
      polls += 1;
      if (polls === 2) {
        // the create function finishes: row appears and the note flips to DONE (with the status it knew)
        excel.rows.push(orderToRow(id, { ...baseOrder(), status: 'PAYMENT_CONFIRMED' }));
        await db.doc(`excelSync/${id}`).update({ state: 'DONE', synced: { status: 'PAYMENT_CONFIRMED', paymentStatus: 'PAID' } });
      }
    };
    const r = await reconcileOrder(db, { orderId: id, deps: deps(excel, { sleep, rowWaitMs: 20000, rowPollMs: 2000 }) });
    assert.equal(r.status, 'updated');
    assert.equal(polls, 2, 'waited exactly until the row appeared');
    assert.equal(rowOf(excel, id)[STATUS], 'PREPARING');
  });

  it('also waits for the note itself when the order is brand new', async () => {
    const excel = fakeExcel();
    const id = await seed(excel, {}, { ledger: null, addRow: false });
    await setOrder(id, { status: 'PREPARING' });
    let polls = 0;
    const sleep = async () => {
      polls += 1;
      if (polls === 1) {
        excel.rows.push(orderToRow(id, baseOrder()));
        await db.doc(`excelSync/${id}`).set({ state: 'DONE', attempts: 1, updatedAt: Timestamp.now(), synced: { status: 'PAYMENT_CONFIRMED', paymentStatus: 'PAID' } });
      }
    };
    assert.equal((await reconcileOrder(db, { orderId: id, deps: deps(excel, { sleep, rowWaitMs: 20000 }) })).status, 'updated');
  });

  it('records a failure (instead of waiting forever) if the row never shows up', async () => {
    const excel = fakeExcel();
    const id = await seed(excel, {}, { ledger: 'PENDING', addRow: false });
    await setOrder(id, { status: 'PREPARING' });
    const r = await reconcileOrder(db, { orderId: id, deps: deps(excel, { rowWaitMs: 6000, rowPollMs: 2000 }) });
    assert.equal(r.status, 'failed');
    assert.equal((await note(id)).updateState, 'FAILED');
    assert.equal(excel.calls.length, 0);
  });

  it('has nothing to update when the row was never added, and does not wait for an old order', async () => {
    const excel = fakeExcel();
    const failedCreate = await seed(excel, {}, { ledger: 'FAILED', addRow: false });
    await setOrder(failedCreate, { status: 'PREPARING' });
    const r1 = await reconcileOrder(db, { orderId: failedCreate, deps: deps(excel) });
    assert.deepEqual([r1.status, r1.reason], ['skipped', 'no row in Excel']);

    let slept = 0;
    const old = await seed(excel, { createdAt: Timestamp.fromMillis(Date.now() - 3600 * 1000) }, { ledger: null, addRow: false });
    const r2 = await reconcileOrder(db, { orderId: old, deps: deps(excel, { sleep: async () => { slept += 1; } }) });
    assert.equal(r2.reason, 'no row in Excel');
    assert.equal(slept, 0, 'an old order with no note is not waited for');
    assert.equal(excel.calls.length, 0);
  });

  it('does not add a row back if staff deleted it, and records that', async () => {
    const excel = fakeExcel();
    const id = await seed(excel);
    excel.rows.length = 0; // deleted by hand
    await setOrder(id, { status: 'PACKED' });
    const r = await reconcileOrder(db, { orderId: id, deps: deps(excel) });
    assert.deepEqual([r.status, r.reason], ['skipped', 'row not found']);
    assert.equal(excel.rows.length, 0, 'not re-added');
    assert.equal(excel.count('POST', '/rows/add'), 0, 'no row was added');
    const n1 = await note(id);
    assert.equal(n1.updateState, 'ROW_MISSING');
    assert.match(n1.updateError.hint, /deleted by mistake/);
  });

  it('does nothing when Azure is not set up', async () => {
    const excel = fakeExcel();
    const id = await seed(excel);
    await setOrder(id, { status: 'PACKED' });
    const r = await reconcileOrder(db, { orderId: id, deps: deps(excel, { config: { ...CFG, tenantId: '' } }) });
    assert.deepEqual([r.status, r.reason], ['skipped', 'not configured']);
    assert.equal(excel.calls.length, 0);
  });

  it('NEVER throws when Excel fails: records FAILED with a hint and no secret, then the retry fixes it', async () => {
    const excel = fakeExcel();
    const id = await seed(excel);
    await setOrder(id, { status: 'PACKED' });

    let broken = true;
    excel.hooks.push(({ method, url }) => (broken && method === 'GET' && url.includes('dataBodyRange') ? json({ error: { code: 'itemNotFound', message: 'Item not found' } }, 404) : null));
    const r = await reconcileOrder(db, { orderId: id, deps: deps(excel) });
    assert.equal(r.status, 'failed');
    const failed = await note(id);
    assert.equal(failed.updateState, 'FAILED');
    assert.equal(failed.updateError.stage, 'lookup');
    assert.match(failed.updateError.hint, /EXCEL_DRIVE_ID/);
    assert.ok(!JSON.stringify(failed).includes('SECRET-xyz'), 'the secret is not stored');
    assert.equal(rowOf(excel, id)[STATUS], 'PAYMENT_CONFIRMED', 'Excel still shows the old status');

    broken = false; // Microsoft is back
    const retried = await retryFailedUpdates(db, { limit: 500, deps: deps(excel) });
    assert.ok(retried.updated >= 1);
    assert.equal(rowOf(excel, id)[STATUS], 'PACKED');
    const fixed = await note(id);
    assert.equal(fixed.updateState, 'DONE');
    assert.equal(fixed.updateError, undefined);
  });

  it('does not crash even if the ledger itself is broken', async () => {
    const brokenDb = { doc: () => ({ get: async () => { throw new Error('Firestore is down'); }, update: async () => { throw new Error('still down'); } }) };
    const r = await reconcileOrder(brokenDb, { orderId: 'x', deps: { config: CFG, fetchImpl: fakeExcel().fetchImpl } });
    assert.equal(r.status, 'failed');
  });
});

// ============================================================
describe('reconcileOrder: Microsoft being slow or unreliable', () => {
  const stage = async (excel) => {
    const id = await seed(excel);
    await setOrder(id, { status: 'PREPARING' });
    return id;
  };

  it('waits and retries when told to slow down (429 with Retry-After)', async () => {
    const excel = fakeExcel();
    const id = await stage(excel);
    let first = true;
    excel.hooks.push(({ method }) => {
      if (method === 'PATCH' && first) {
        first = false;
        return json({ error: { code: 'TooManyRequests' } }, 429, { 'retry-after': '3' });
      }
      return null;
    });
    const waits = [];
    const r = await reconcileOrder(db, { orderId: id, deps: deps(excel, { sleep: async (ms) => waits.push(ms) }) });
    assert.equal(r.status, 'updated');
    assert.deepEqual(waits, [3000]);
    assert.equal(rowOf(excel, id)[STATUS], 'PREPARING');
  });

  it('retries a server error (500) and a timeout, because writing the same values twice is harmless', async () => {
    for (const failure of [() => json({ error: { code: 'generalException' } }, 500), () => { throw new DOMException('timed out', 'TimeoutError'); }]) {
      sync._clearTokenCache();
      const excel = fakeExcel();
      const id = await stage(excel);
      let first = true;
      excel.hooks.push(({ method }) => {
        if (method === 'PATCH' && first) {
          first = false;
          return failure();
        }
        return null;
      });
      const r = await reconcileOrder(db, { orderId: id, deps: deps(excel) });
      assert.equal(r.status, 'updated');
      assert.equal(excel.count('PATCH'), 2, 'one failed write, one good write');
    }
  });

  it('retries the lookup too, and backs off 1s, 2s while Microsoft is unavailable', async () => {
    const excel = fakeExcel();
    const id = await stage(excel);
    let fails = 2;
    excel.hooks.push(({ method, url }) => (method === 'GET' && url.includes('dataBodyRange') && fails-- > 0 ? json({ error: { code: 'serviceNotAvailable' } }, 503) : null));
    const waits = [];
    const r = await reconcileOrder(db, { orderId: id, deps: deps(excel, { sleep: async (ms) => waits.push(ms) }) });
    assert.equal(r.status, 'updated');
    assert.deepEqual(waits, [1000, 2000]);
  });

  it('gives up after 4 tries and records the failure', async () => {
    const excel = fakeExcel();
    const id = await stage(excel);
    excel.hooks.push(({ method, url }) => (method === 'GET' && url.includes('dataBodyRange') ? json({ error: { code: 'serviceNotAvailable' } }, 503) : null));
    const r = await reconcileOrder(db, { orderId: id, deps: deps(excel) });
    assert.equal(r.status, 'failed');
    assert.equal(excel.count('GET', 'dataBodyRange'), 4);
    assert.equal((await note(id)).updateState, 'FAILED');
  });

  it('does not retry missing permission (403), and says how to fix it', async () => {
    const excel = fakeExcel();
    const id = await stage(excel);
    excel.hooks.push(({ method, url }) => (method === 'GET' && url.includes('dataBodyRange') ? json({ error: { code: 'accessDenied' } }, 403) : null));
    const r = await reconcileOrder(db, { orderId: id, deps: deps(excel) });
    assert.equal(excel.count('GET', 'dataBodyRange'), 1);
    assert.match(r.error.hint, /admin consent/);
  });
});

// ============================================================
describe('reconcileOrder: updates that race each other', () => {
  it('fixes itself if the order moved on while it was writing', async () => {
    const excel = fakeExcel();
    const id = await seed(excel);
    await setOrder(id, { status: 'PREPARING' });

    let done = false;
    excel.hooks.push(async ({ method }) => {
      if (method === 'PATCH' && !done) {
        done = true;
        await setOrder(id, { status: 'PACKED' }); // staff clicked again mid-write
      }
      return null;
    });
    const r = await reconcileOrder(db, { orderId: id, deps: deps(excel) });
    assert.equal(r.rounds, 2);
    assert.equal(rowOf(excel, id)[STATUS], 'PACKED', 'ends on the latest status, not the one it started with');
    assert.equal((await note(id)).synced.status, 'PACKED');
  });

  it('several updates at the same moment still end on the latest status', async () => {
    const excel = fakeExcel();
    const id = await seed(excel);
    await setOrder(id, { status: 'PACKED' });
    await Promise.all([1, 2, 3, 4].map(() => reconcileOrder(db, { orderId: id, deps: deps(excel) })));
    assert.equal(rowOf(excel, id)[STATUS], 'PACKED');
    assert.equal(rowOf(excel, id)[PAYMENT], 'PAID');
  });
});

// ============================================================
describe('the create side starts with the latest data', () => {
  it('writes the order as it is NOW, not as it was when the event fired', async () => {
    const excel = fakeExcel();
    const id = nextId();
    await db.doc(`orders/${id}`).set({ ...baseOrder(), status: 'PACKED' }); // moved on already
    const stale = { ...baseOrder(), status: 'PAYMENT_CONFIRMED' }; // what the create event carried
    const r = await syncOrder(db, { orderId: id, order: stale, deps: { ...deps(excel), lookupCustomer: async () => ({ name: 'Asha', phone: '' }) } });
    assert.equal(r.status, 'done');
    assert.equal(rowOf(excel, id)[STATUS], 'PACKED');
    assert.deepEqual((await note(id)).synced, { status: 'PACKED', paymentStatus: 'PAID' });
  });

  it('records what it wrote, so the update side can tell Excel is already right', async () => {
    const excel = fakeExcel();
    const id = nextId();
    await db.doc(`orders/${id}`).set(baseOrder());
    await syncOrder(db, { orderId: id, order: baseOrder(), deps: { ...deps(excel), lookupCustomer: async () => ({}) } });
    const r = await reconcileOrder(db, { orderId: id, deps: deps(excel) });
    assert.equal(r.reason, 'already up to date');
  });
});
