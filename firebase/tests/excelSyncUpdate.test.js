'use strict';

// Tests for keeping Excel rows up to date. Run: npm run test:excel (uses the Firestore emulator).
//
// The S3 file is replaced by an in-memory workbook (helpers/fakeStore.js). Tests can sort
// it, edit it, delete from it, make AWS fail, and make "someone else" save at the worst moment.

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');

// Use the SAME firebase-admin copy the functions use (two copies cannot share FieldValue).
const fromFunctions = createRequire(path.join(__dirname, '..', 'functions', 'package.json'));
const { initializeApp, getApps } = fromFunctions('firebase-admin/app');
const { getFirestore, Timestamp } = fromFunctions('firebase-admin/firestore');
const sync = require('../functions/excelSync');
const update = require('../functions/excelSyncUpdate');
const { fakeStore, awsError } = require('./helpers/fakeStore');
const { EXCEL_COLUMNS, orderToRow, syncOrder, appendRow, FIRST_LIVE_COLUMN } = sync;
const { liveFieldsChanged, reconcileOrder, retryFailedUpdates } = update;

const CFG = { bucket: 'freshbliss-orders', key: 'orders/orders.xlsx', region: 'ap-south-1', accessKeyId: 'AKIAEXAMPLE', secretAccessKey: 'SECRET-xyz', endpoint: '' };
const PAYMENT = FIRST_LIVE_COLUMN; // "Payment status"
const STATUS = FIRST_LIVE_COLUMN + 1; // "Order status"
const UPDATED = FIRST_LIVE_COLUMN + 2; // "Last updated (IST)"

let db;
before(() => {
  process.env.GCLOUD_PROJECT = 'demo-freshbliss';
  if (getApps().length === 0) initializeApp({ projectId: 'demo-freshbliss' });
  db = getFirestore();
});

// ---------- helpers ----------

let n = 0;
const nextId = () => `up-${Date.now()}-${(n += 1)}-${Math.floor(Math.random() * 1e6)}`;

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

// An order in Firestore, its ledger note, and (optionally) its row in the fake workbook.
async function seed(store, over = {}, { ledger = 'DONE', addRow = true } = {}) {
  const id = nextId();
  const order = { ...baseOrder(), ...over };
  await db.doc(`orders/${id}`).set(order);
  if (ledger) {
    await db.doc(`excelSync/${id}`).set({ state: ledger, attempts: 1, updatedAt: Timestamp.now(), ...(ledger === 'DONE' ? { synced: { status: order.status, paymentStatus: order.paymentStatus } } : {}) });
  }
  if (addRow) await appendRow(CFG, id, orderToRow(id, order), { store });
  return id;
}
const setOrder = (id, fields) => db.doc(`orders/${id}`).update({ ...fields, updatedAt: Timestamp.now() });
const note = async (id) => (await db.doc(`excelSync/${id}`).get()).data();
const deps = (store, extra = {}) => ({ config: CFG, store, sleep: async () => {}, ...extra });
const addByHand = (store, id, order = baseOrder()) => appendRow(CFG, id, orderToRow(id, order), { store });

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

// ============================================================
describe('reconcileOrder: updating the row', () => {
  it('rewrites ONLY the three live cells; everything else in the row is left alone', async () => {
    const store = fakeStore();
    const id = await seed(store);
    await store.staff((sheet) => {
      sheet.getRow(2).getCell(15).value = 'Staff typed this note by hand'; // a manual edit in the Note column
      sheet.getRow(1).getCell(19).value = 'My column'; // a column staff added to the right
      sheet.getRow(2).getCell(19).value = 'extra staff column';
    });
    const before = await store.rowOf(id);
    await setOrder(id, { status: 'PREPARING' });
    const puts = store.puts;

    const r = await reconcileOrder(db, { orderId: id, deps: deps(store) });
    assert.deepEqual([r.status, r.rows], ['updated', 1]);

    const row = await store.rowOf(id);
    assert.equal(row[STATUS], 'PREPARING');
    assert.equal(row[PAYMENT], 'PAID');
    assert.notEqual(row[UPDATED], '', 'last-updated time is written');
    for (let i = 0; i < FIRST_LIVE_COLUMN; i++) assert.deepEqual(row[i], before[i], `column ${EXCEL_COLUMNS[i]} untouched`);
    assert.equal(row[14], 'Staff typed this note by hand', 'a hand-edited cell survives');
    assert.equal(row[18], 'extra staff column', 'an extra column to the right survives');
    assert.equal(store.puts - puts, 1, 'one save');
  });

  it('follows an order through its whole life, including cancel and refund', async () => {
    const store = fakeStore();
    const id = await seed(store);
    for (const fields of [
      { status: 'PREPARING' },
      { status: 'PACKED' },
      { status: 'OUT_FOR_DELIVERY' },
      { status: 'CANCELLED', paymentStatus: 'REFUND_PENDING' },
      { paymentStatus: 'REFUNDED' },
    ]) {
      await setOrder(id, fields);
      assert.equal((await reconcileOrder(db, { orderId: id, deps: deps(store) })).status, 'updated');
      const o = (await db.doc(`orders/${id}`).get()).data();
      const row = await store.rowOf(id);
      assert.equal(row[STATUS], o.status);
      assert.equal(row[PAYMENT], o.paymentStatus);
    }
    const row = await store.rowOf(id);
    assert.deepEqual([row[PAYMENT], row[STATUS]], ['REFUNDED', 'CANCELLED']);
    assert.deepEqual((await note(id)).synced, { status: 'CANCELLED', paymentStatus: 'REFUNDED' });
  });

  it('finds the right row after staff sort the sheet, and leaves every other order alone', async () => {
    const store = fakeStore();
    const ids = [];
    for (let i = 0; i < 5; i++) ids.push(await seed(store));
    // staff sort the sheet (newest first): every row number changes
    await store.staff((sheet) => {
      const values = [];
      sheet.eachRow((row, i) => i > 1 && values.push(row.values.slice(1)));
      values.reverse().forEach((v, i) => (sheet.getRow(i + 2).values = v));
    });

    const target = ids[2];
    await setOrder(target, { status: 'PACKED' });
    await reconcileOrder(db, { orderId: target, deps: deps(store) });

    for (const id of ids) assert.equal((await store.rowOf(id))[STATUS], id === target ? 'PACKED' : 'PAYMENT_CONFIRMED');
  });

  it('updates every copy if an order somehow appears twice', async () => {
    const store = fakeStore();
    const id = await seed(store);
    await store.staff((sheet) => sheet.addRow(sheet.getRow(2).values.slice(1)));
    await setOrder(id, { status: 'PREPARING' });
    const r = await reconcileOrder(db, { orderId: id, deps: deps(store) });
    assert.equal(r.rows, 2);
    assert.ok((await store.rows()).every((row) => row[STATUS] === 'PREPARING'));
  });

  it('does nothing, with no calls to AWS, when Excel already shows the right thing', async () => {
    const store = fakeStore();
    const id = await seed(store);
    const calls = store.calls.length;
    const r = await reconcileOrder(db, { orderId: id, deps: deps(store) });
    assert.deepEqual([r.status, r.reason], ['skipped', 'already up to date']);
    assert.equal(store.calls.length, calls);
  });

  it('a repeated event for the same change saves the file only once', async () => {
    const store = fakeStore();
    const id = await seed(store);
    await setOrder(id, { status: 'PACKED' });
    const puts = store.puts;
    await Promise.all([1, 2, 3].map(() => reconcileOrder(db, { orderId: id, deps: deps(store) })));
    await reconcileOrder(db, { orderId: id, deps: deps(store) });
    assert.equal((await store.rowOf(id))[STATUS], 'PACKED');
    assert.equal(store.puts - puts, 1, 'the others found it already right');
    const now = store.puts;
    await reconcileOrder(db, { orderId: id, deps: deps(store) });
    assert.equal(store.puts, now, 'nothing more to write');
  });

  it('when told to (the retry button) it re-checks the sheet, but still saves nothing that is already right', async () => {
    const store = fakeStore();
    const id = await seed(store);
    const gets = store.gets;
    const puts = store.puts;
    const r = await reconcileOrder(db, { orderId: id, force: true, deps: deps(store) });
    assert.equal(r.status, 'updated');
    assert.equal(store.gets - gets, 1, 'it looked');
    assert.equal(store.puts, puts, 'and found nothing to change');
  });

  it('fixes a row that staff edited by mistake, when told to', async () => {
    const store = fakeStore();
    const id = await seed(store);
    await store.staff((sheet) => (sheet.getRow(2).getCell(STATUS + 1).value = 'DELIVERED')); // someone typed over the status
    await reconcileOrder(db, { orderId: id, force: true, deps: deps(store) });
    assert.equal((await store.rowOf(id))[STATUS], 'PAYMENT_CONFIRMED');
  });
});

// ============================================================
describe('reconcileOrder: things that go wrong', () => {
  it('survives an update that arrives before the row exists, by waiting for it', async () => {
    const store = fakeStore();
    const id = await seed(store, {}, { ledger: 'PENDING', addRow: false }); // create is still running
    await setOrder(id, { status: 'PREPARING' });

    let polls = 0;
    const sleep = async () => {
      polls += 1;
      if (polls === 2) {
        // the create function finishes: row appears and the note flips to DONE (with the status it knew)
        await addByHand(store, id, { ...baseOrder(), status: 'PAYMENT_CONFIRMED' });
        await db.doc(`excelSync/${id}`).update({ state: 'DONE', synced: { status: 'PAYMENT_CONFIRMED', paymentStatus: 'PAID' } });
      }
    };
    const r = await reconcileOrder(db, { orderId: id, deps: deps(store, { sleep, rowWaitMs: 20000, rowPollMs: 2000 }) });
    assert.equal(r.status, 'updated');
    assert.equal(polls, 2, 'waited exactly until the row appeared');
    assert.equal((await store.rowOf(id))[STATUS], 'PREPARING');
  });

  it('also waits for the note itself when the order is brand new', async () => {
    const store = fakeStore();
    const id = await seed(store, {}, { ledger: null, addRow: false });
    await setOrder(id, { status: 'PREPARING' });
    let polls = 0;
    const sleep = async () => {
      polls += 1;
      if (polls === 1) {
        await addByHand(store, id);
        await db.doc(`excelSync/${id}`).set({ state: 'DONE', attempts: 1, updatedAt: Timestamp.now(), synced: { status: 'PAYMENT_CONFIRMED', paymentStatus: 'PAID' } });
      }
    };
    assert.equal((await reconcileOrder(db, { orderId: id, deps: deps(store, { sleep, rowWaitMs: 20000 }) })).status, 'updated');
  });

  it('records a failure (instead of waiting forever) if the row never shows up', async () => {
    const store = fakeStore();
    const id = await seed(store, {}, { ledger: 'PENDING', addRow: false });
    await setOrder(id, { status: 'PREPARING' });
    const r = await reconcileOrder(db, { orderId: id, deps: deps(store, { rowWaitMs: 6000, rowPollMs: 2000 }) });
    assert.equal(r.status, 'failed');
    assert.equal((await note(id)).updateState, 'FAILED');
    assert.equal(store.calls.length, 0);
  });

  it('has nothing to update when the row was never added, and does not wait for an old order', async () => {
    const store = fakeStore();
    const failedCreate = await seed(store, {}, { ledger: 'FAILED', addRow: false });
    await setOrder(failedCreate, { status: 'PREPARING' });
    const r1 = await reconcileOrder(db, { orderId: failedCreate, deps: deps(store) });
    assert.deepEqual([r1.status, r1.reason], ['skipped', 'no row in Excel']);

    let slept = 0;
    const old = await seed(store, { createdAt: Timestamp.fromMillis(Date.now() - 3600 * 1000) }, { ledger: null, addRow: false });
    const r2 = await reconcileOrder(db, { orderId: old, deps: deps(store, { sleep: async () => { slept += 1; } }) });
    assert.equal(r2.reason, 'no row in Excel');
    assert.equal(slept, 0, 'an old order with no note is not waited for');
    assert.equal(store.calls.length, 0);
  });

  it('does not add a row back if staff deleted it, and records that', async () => {
    const store = fakeStore();
    const id = await seed(store);
    await store.staff((sheet) => sheet.spliceRows(2, 1)); // deleted by hand
    await setOrder(id, { status: 'PACKED' });
    const puts = store.puts;
    const r = await reconcileOrder(db, { orderId: id, deps: deps(store) });
    assert.deepEqual([r.status, r.reason], ['skipped', 'row not found']);
    assert.equal((await store.rows()).length, 0, 'not re-added');
    assert.equal(store.puts, puts, 'nothing was saved');
    const n1 = await note(id);
    assert.equal(n1.updateState, 'ROW_MISSING');
    assert.match(n1.updateError.hint, /deleted by mistake/);
  });

  it('does nothing when AWS is not set up', async () => {
    const store = fakeStore();
    const id = await seed(store);
    await setOrder(id, { status: 'PACKED' });
    const calls = store.calls.length;
    const r = await reconcileOrder(db, { orderId: id, deps: deps(store, { config: { ...CFG, bucket: '' } }) });
    assert.deepEqual([r.status, r.reason], ['skipped', 'not configured']);
    assert.equal(store.calls.length, calls);
  });

  it('NEVER throws when AWS refuses: records FAILED with a hint and no secret, then the retry fixes it', async () => {
    const store = fakeStore();
    const id = await seed(store);
    await setOrder(id, { status: 'PACKED' });

    let broken = true;
    const realGet = store.get;
    store.get = async () => {
      if (broken) throw awsError('AccessDenied', 403);
      return realGet();
    };
    const r = await reconcileOrder(db, { orderId: id, deps: deps(store) });
    assert.equal(r.status, 'failed');
    const failed = await note(id);
    assert.equal(failed.updateState, 'FAILED');
    assert.equal(failed.updateError.stage, 'read');
    assert.match(failed.updateError.hint, /s3:ListBucket/);
    assert.ok(!JSON.stringify(failed).includes('SECRET-xyz'), 'the secret is not stored');
    broken = false;
    assert.equal((await store.rowOf(id))[STATUS], 'PAYMENT_CONFIRMED', 'Excel still shows the old status');

    const retried = await retryFailedUpdates(db, { limit: 500, deps: deps(store) });
    assert.ok(retried.updated >= 1);
    assert.equal((await store.rowOf(id))[STATUS], 'PACKED');
    const fixed = await note(id);
    assert.equal(fixed.updateState, 'DONE');
    assert.equal(fixed.updateError, undefined);
  });

  it('records FAILED, and leaves the file alone, if the header row was damaged', async () => {
    const store = fakeStore();
    const id = await seed(store);
    await store.staff((sheet) => (sheet.getRow(1).getCell(1).value = 'ID'));
    await setOrder(id, { status: 'PACKED' });
    const puts = store.puts;
    const r = await reconcileOrder(db, { orderId: id, deps: deps(store) });
    assert.equal(r.status, 'failed');
    assert.equal((await note(id)).updateError.code, 'bad-headers');
    assert.equal(store.puts, puts);
  });

  it('does not crash even if the ledger itself is broken', async () => {
    const brokenDb = { doc: () => ({ get: async () => { throw new Error('Firestore is down'); }, update: async () => { throw new Error('still down'); } }) };
    const r = await reconcileOrder(brokenDb, { orderId: 'x', deps: { config: CFG, store: fakeStore() } });
    assert.equal(r.status, 'failed');
  });
});

// ============================================================
describe('reconcileOrder: AWS being slow or unreliable', () => {
  const stage = async (store) => {
    const id = await seed(store);
    await setOrder(id, { status: 'PREPARING' });
    return id;
  };

  it('waits and retries when told to slow down (Retry-After)', async () => {
    const store = fakeStore();
    const id = await stage(store);
    store.failNext('put', () => awsError('SlowDown', 503, { $response: { headers: { 'retry-after': '3' } } }));
    const waits = [];
    const r = await reconcileOrder(db, { orderId: id, deps: deps(store, { sleep: async (ms) => waits.push(ms) }) });
    assert.equal(r.status, 'updated');
    assert.deepEqual(waits, [3000]);
    assert.equal((await store.rowOf(id))[STATUS], 'PREPARING');
  });

  it('retries a server error and a timeout, because writing the same values twice is harmless', async () => {
    for (const failure of [() => awsError('InternalError', 500), () => Object.assign(new Error('timed out'), { name: 'TimeoutError' })]) {
      const store = fakeStore();
      const id = await stage(store);
      store.failNext('put', failure);
      const r = await reconcileOrder(db, { orderId: id, deps: deps(store) });
      assert.equal(r.status, 'updated');
      assert.equal((await store.rowOf(id))[STATUS], 'PREPARING');
    }
  });

  it('retries the read too, and backs off 1s, 2s while AWS is unavailable', async () => {
    const store = fakeStore();
    const id = await stage(store);
    store.failNext('get', () => awsError('ServiceUnavailable', 503), 2);
    const waits = [];
    const r = await reconcileOrder(db, { orderId: id, deps: deps(store, { sleep: async (ms) => waits.push(ms) }) });
    assert.equal(r.status, 'updated');
    assert.deepEqual(waits, [1000, 2000]);
  });

  it('gives up after 4 tries and records the failure', async () => {
    const store = fakeStore();
    const id = await stage(store);
    const gets = store.gets;
    store.failNext('get', () => awsError('ServiceUnavailable', 503), 10);
    const r = await reconcileOrder(db, { orderId: id, deps: deps(store) });
    assert.equal(r.status, 'failed');
    assert.equal(store.gets - gets, 4);
    assert.equal((await note(id)).updateState, 'FAILED');
  });

  it('does not retry missing permission (403), and says how to fix it', async () => {
    const store = fakeStore();
    const id = await stage(store);
    const gets = store.gets;
    store.failNext('get', () => awsError('AccessDenied', 403), 10);
    const r = await reconcileOrder(db, { orderId: id, deps: deps(store) });
    assert.equal(store.gets - gets, 1);
    assert.match(r.error.hint, /s3:GetObject/);
  });

  it('starts over when someone else saves the file first, and loses nothing of theirs', async () => {
    const store = fakeStore();
    const id = await stage(store);
    const other = nextId();
    store.once('put', () => addByHand(store, other)); // a new order lands at the worst moment
    const r = await reconcileOrder(db, { orderId: id, deps: deps(store) });
    assert.equal(r.status, 'updated');
    assert.equal((await store.rowOf(id))[STATUS], 'PREPARING');
    assert.ok(await store.rowOf(other), "the other writer's row is still there");
  });

  it('still hits the right row if staff sort the sheet between our read and our save', async () => {
    const store = fakeStore();
    const ids = [];
    for (let i = 0; i < 3; i++) ids.push(await seed(store));
    await setOrder(ids[0], { status: 'PREPARING' });
    store.once('put', () =>
      store.staff((sheet) => {
        const values = [];
        sheet.eachRow((row, i) => i > 1 && values.push(row.values.slice(1)));
        values.reverse().forEach((v, i) => (sheet.getRow(i + 2).values = v));
      }),
    );
    await reconcileOrder(db, { orderId: ids[0], deps: deps(store) });
    for (const id of ids) assert.equal((await store.rowOf(id))[STATUS], id === ids[0] ? 'PREPARING' : 'PAYMENT_CONFIRMED');
  });
});

// ============================================================
describe('reconcileOrder: updates that race each other', () => {
  it('fixes itself if the order moved on while it was writing', async () => {
    const store = fakeStore();
    const id = await seed(store);
    await setOrder(id, { status: 'PREPARING' });
    store.once('put', () => setOrder(id, { status: 'PACKED' })); // staff clicked again mid-write
    const r = await reconcileOrder(db, { orderId: id, deps: deps(store) });
    assert.equal(r.rounds, 2);
    assert.equal((await store.rowOf(id))[STATUS], 'PACKED', 'ends on the latest status, not the one it started with');
    assert.equal((await note(id)).synced.status, 'PACKED');
  });

  it('several updates at the same moment still end on the latest status', async () => {
    const store = fakeStore();
    const id = await seed(store);
    await setOrder(id, { status: 'PACKED' });
    await Promise.all([1, 2, 3, 4].map(() => reconcileOrder(db, { orderId: id, deps: deps(store) })));
    const row = await store.rowOf(id);
    assert.equal(row[STATUS], 'PACKED');
    assert.equal(row[PAYMENT], 'PAID');
  });

  it('many orders updated at the same moment all end up right', async () => {
    const store = fakeStore();
    const ids = [];
    for (let i = 0; i < 8; i++) ids.push(await seed(store));
    for (const id of ids) await setOrder(id, { status: 'OUT_FOR_DELIVERY' });
    await Promise.all(ids.map((id) => reconcileOrder(db, { orderId: id, deps: deps(store, { random: () => 0.5 }) })));
    for (const id of ids) assert.equal((await store.rowOf(id))[STATUS], 'OUT_FOR_DELIVERY');
  });
});

// ============================================================
describe('the create side starts with the latest data', () => {
  it('writes the order as it is NOW, not as it was when the event fired', async () => {
    const store = fakeStore();
    const id = nextId();
    await db.doc(`orders/${id}`).set({ ...baseOrder(), status: 'PACKED' }); // moved on already
    const stale = { ...baseOrder(), status: 'PAYMENT_CONFIRMED' }; // what the create event carried
    const r = await syncOrder(db, { orderId: id, order: stale, deps: { ...deps(store), lookupCustomer: async () => ({ name: 'Asha', phone: '' }) } });
    assert.equal(r.status, 'done');
    assert.equal((await store.rowOf(id))[STATUS], 'PACKED');
    assert.deepEqual((await note(id)).synced, { status: 'PACKED', paymentStatus: 'PAID' });
  });

  it('records what it wrote, so the update side can tell Excel is already right', async () => {
    const store = fakeStore();
    const id = nextId();
    await db.doc(`orders/${id}`).set(baseOrder());
    await syncOrder(db, { orderId: id, order: baseOrder(), deps: { ...deps(store), lookupCustomer: async () => ({}) } });
    const r = await reconcileOrder(db, { orderId: id, deps: deps(store) });
    assert.equal(r.reason, 'already up to date');
  });
});
