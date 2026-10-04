'use strict';

// excelSyncUpdate
// Keeps the Excel row of an order up to date as the order moves along
// (PREPARING, PACKED, OUT_FOR_DELIVERY, DELIVERED, CANCELLED, REFUND_PENDING,
// REFUNDED). excelSync.js adds the row when the order is created; this file
// rewrites the three "live" cells at the end of that row: Payment status, Order
// status and Last updated. (The workbook is a .xlsx file in Amazon S3; see
// shared/s3Workbook.js.)
//
// HOW IT WORKS
//   1. An order document changes  ->  this function runs.
//   2. If neither `status` nor `paymentStatus` changed (for example only the
//      delivery code or rider was set), we stop here. No AWS calls.
//   3. FIND THE ROW. We download the workbook and look for our id in the Order ID
//      column (the first column). We never remember a row NUMBER: staff can sort or
//      filter the sheet in Excel, which moves rows around.
//   4. UPDATE THE CELLS. We change only the three live cells of that row, then upload
//      the workbook again, but only if nobody else saved it in the meantime (otherwise
//      we start over from their version). Anything else in the row, and any extra
//      columns staff add to the right, is left alone. If the cells already show the
//      right thing, nothing is uploaded.
//   5. Note the result in the order's `excelSync/{orderId}` note.
//
// It is built to survive these real-world problems, and NEVER throws:
//   - Updates arriving out of order. We write what the order says RIGHT NOW (we
//     re-read it from Firestore), then check again afterwards and correct ourselves
//     if it moved on while we were writing.
//   - An update arriving before the row exists (the order was only just created).
//     We wait up to 30 seconds for the row to appear.
//   - The same update arriving twice. We remember what Excel shows and do nothing
//     if it is already right.
//   - AWS being busy or slow. Same backoff as the create side (shared/s3Workbook.js).
//     Writing the same values twice is harmless, so every kind of hiccup is retried.
//   - A deleted row. We do NOT add it back; we record it.
//
// If it fails, the order is fine. The failure is logged and recorded, and the
// staff "Retry Excel sync" button (retryExcelSync, below) tries again.

const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { callableOptions } = require('./shared/hardening');
const { logger } = require('firebase-functions');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { requireStaff } = require('./shared/staff');
const { updateWorkbook } = require('./shared/s3Workbook');
const { REGION, EXCEL_AWS_SECRET_ACCESS_KEY, EXCEL_COLUMNS, FIRST_LIVE_COLUMN, orderToRow, readConfig, missingSettings, describeError, retryFailedSyncs } = require('./excelSync');

const ROW_WAIT_MS = 30000; // how long to wait for a brand-new order's row to appear
const ROW_POLL_MS = 2000;
const RECENT_ORDER_MS = 2 * 60 * 1000; // only wait for the row if the order is this new
const MAX_ROUNDS = 3; // re-write at most this many times if the order keeps changing under us

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------- small pure helpers ----------

// Did the part of the order that Excel shows change? (Only status and paymentStatus matter.)
function liveFieldsChanged(before, after) {
  if (!before || !after) return false;
  return before.status !== after.status || before.paymentStatus !== after.paymentStatus;
}

const readOrder = async (db, orderId) => {
  const snap = await db.doc(`orders/${orderId}`).get();
  return snap.exists ? snap.data() : null;
};

const sameLive = (a, b) => Boolean(a) && Boolean(b) && a.status === b.status && a.paymentStatus === b.paymentStatus;

// ---------- talking to Excel ----------

// Writes the three live cells for this order into every row that holds it.
// Returns how many rows hold the order (0 if it is not in the sheet).
async function writeLiveCells(cfg, orderId, order, deps) {
  // The new values for just the live columns, taken from the same row builder the
  // create side uses, so the two can never disagree.
  const live = orderToRow(orderId, order).slice(FIRST_LIVE_COLUMN);

  const { rows } = await updateWorkbook(
    cfg,
    {
      columns: EXCEL_COLUMNS,
      // May run more than once (if someone else saved first), so it looks at the sheet afresh each time.
      mutate: (sheet) => {
        const found = sheet.rowsFor(orderId);
        let changed = false;
        for (const row of found) changed = sheet.writeCells(row, FIRST_LIVE_COLUMN, live) || changed;
        return { changed, rows: found.length };
      },
    },
    deps,
  );
  return rows;
}

// ---------- the ledger: wait for the row ----------

// The row is added by excelSync.js. If this order is brand new, that may still be
// running, so wait for it (up to 30s). Returns the order's `excelSync` note, or null.
async function waitForRow(ref, order, deps) {
  const sleep = deps.sleep || wait;
  const waitMs = deps.rowWaitMs ?? ROW_WAIT_MS;
  const pollMs = deps.rowPollMs ?? ROW_POLL_MS;
  const isNew = Date.now() - (order.createdAt?.toMillis?.() ?? 0) < RECENT_ORDER_MS;

  let waited = 0;
  for (;;) {
    const snap = await ref.get();
    const note = snap.exists ? snap.data() : null;
    const settled = note && (note.state === 'DONE' || note.state === 'FAILED');
    const mayStillAppear = note?.state === 'PENDING' || (!note && isNew);
    if (settled || !mayStillAppear || waited >= waitMs) return note;
    await sleep(pollMs);
    waited += pollMs;
  }
}

// ---------- the main job ----------

// Brings one order's Excel row in line with the order as it is now. NEVER throws.
//   force  write even if Excel already looks right (used by the retry button)
//   deps   lets tests replace the network, clock and waiting
// Returns { status: 'updated' | 'skipped' | 'failed', reason?, ... }.
async function reconcileOrder(db, { orderId, force = false, deps = {} }) {
  try {
    const cfg = deps.config || readConfig();
    if (missingSettings(cfg).length > 0) {
      logger.info('excelSyncUpdate: Excel is not set up yet, so nothing was updated.', { orderId });
      return { status: 'skipped', reason: 'not configured' };
    }

    let order = await readOrder(db, orderId);
    if (!order) return { status: 'skipped', reason: 'order not found' };

    // Is there a row to update?
    const ref = db.doc(`excelSync/${orderId}`);
    const note = await waitForRow(ref, order, deps);
    if (note?.state !== 'DONE') {
      if (note?.state === 'PENDING') {
        // The row still was not there after waiting. Mark it so the retry button tries again.
        const info = { message: 'The order row was still being added to Excel, so the update was not applied.', stage: 'read', status: null, code: 'row-pending', hint: '' };
        await ref.update({ updateState: 'FAILED', updateError: info, updatedAt: FieldValue.serverTimestamp() });
        logger.warn('excelSyncUpdate: the row is not in Excel yet; the update will be applied on retry.', { orderId });
        return { status: 'failed', error: info };
      }
      // No note, or the row's creation failed: there is nothing to update. When the row IS
      // added (by the retry button) it is written from the order as it is then.
      logger.info('excelSyncUpdate: the order is not in Excel, so there is nothing to update.', { orderId, rowState: note?.state ?? 'none' });
      return { status: 'skipped', reason: 'no row in Excel' };
    }

    let synced = note.synced || null; // what Excel was last told

    for (let round = 1; round <= MAX_ROUNDS; round++) {
      const want = { status: order.status ?? null, paymentStatus: order.paymentStatus ?? null };

      // Already right (a repeated event, or the create side already wrote the latest)?
      if (!force && round === 1 && sameLive(synced, want)) {
        if (note.updateState === 'FAILED') await ref.update({ updateState: 'DONE', updateError: FieldValue.delete() });
        return { status: 'skipped', reason: 'already up to date' };
      }

      const rows = await writeLiveCells(cfg, orderId, order, deps);
      if (rows === 0) {
        // The row was in the ledger but is not in the sheet: staff probably deleted it.
        // We do not add it back (that could undo a deliberate delete); we record it.
        const info = { message: 'The order is not in the Excel sheet (the row may have been deleted).', stage: 'read', status: null, code: 'row-missing', hint: 'If the row was deleted by mistake, add it back by hand. Updates for this order are skipped.' };
        await ref.update({ updateState: 'ROW_MISSING', updateError: info, updatedAt: FieldValue.serverTimestamp() });
        logger.warn('excelSyncUpdate: the order is not in the Excel sheet, so nothing was updated.', { orderId });
        return { status: 'skipped', reason: 'row not found' };
      }

      synced = want;
      await ref.update({
        synced: want,
        updateState: 'DONE',
        updatedInExcelAt: FieldValue.serverTimestamp(),
        updateError: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      logger.info('excelSyncUpdate: Excel row updated.', { orderId, status: want.status, paymentStatus: want.paymentStatus, rows, round });

      // Check again: did the order move on while we were writing? If another update
      // ran at the same moment, whichever wrote LAST might have written an older value.
      // Looking again and re-writing makes the final result always the latest.
      const latest = await readOrder(db, orderId);
      if (!latest || sameLive(want, latest)) return { status: 'updated', rows, rounds: round };
      order = latest;
    }
    return { status: 'updated', rounds: MAX_ROUNDS };
  } catch (err) {
    // The order is safe in Firestore. Only the Excel copy is stale.
    const info = describeError(err);
    logger.error('excelSyncUpdate: could not update the order in Excel. The order itself is fine.', { orderId, ...info });
    await db
      .doc(`excelSync/${orderId}`)
      .update({ updateState: 'FAILED', updateError: info, updatedAt: FieldValue.serverTimestamp() })
      .catch((e) => logger.error('excelSyncUpdate: could not even record the failure.', { orderId, detail: e?.message }));
    return { status: 'failed', error: info };
  }
}

// Tries again for orders whose Excel update failed earlier.
async function retryFailedUpdates(db, { limit = 25, deps = {} } = {}) {
  const failed = await db.collection('excelSync').where('updateState', '==', 'FAILED').limit(limit).get();
  const result = { tried: 0, updated: 0, stillFailing: 0 };

  for (const note of failed.docs) {
    const r = await reconcileOrder(db, { orderId: note.id, force: true, deps });
    result.tried += 1;
    if (r.status === 'updated') result.updated += 1;
    else result.stillFailing += 1;
  }
  return result;
}

// ---------- the functions Firebase runs ----------

// Runs whenever an order changes. Orders change for many reasons (a delivery code
// is set, a timestamp is added...), so first check whether status or paymentStatus
// is one of the things that changed. If not, do nothing at all.
exports.excelSyncUpdate = onDocumentUpdated(
  { document: 'orders/{orderId}', region: REGION, secrets: [EXCEL_AWS_SECRET_ACCESS_KEY], timeoutSeconds: 120 },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!liveFieldsChanged(before, after)) return;
    await reconcileOrder(getFirestore(), { orderId: event.params.orderId });
  },
);

// Staff-only: the "Retry Excel sync" button on the dashboard calls this. Safe to
// press at any time: if everything is already in Excel it does nothing.
//   1. adds rows that are missing (orders whose first copy failed)
//   2. fixes rows that are out of date (status changes that failed to reach Excel)
// Never creates duplicate rows: an order already in the sheet is recognised by its ID.
exports.retryExcelSync = onCall(callableOptions({ secrets: [EXCEL_AWS_SECRET_ACCESS_KEY], timeoutSeconds: 300 }), async (request) => {
  requireStaff(request);
  if (missingSettings(readConfig()).length > 0) {
    throw new HttpsError('failed-precondition', 'Excel sync is not set up yet. See docs/AWS_SETUP.md.');
  }
  const db = getFirestore();
  const rowsAdded = await retryFailedSyncs(db); // first, so the rows exist...
  const rowsUpdated = await retryFailedUpdates(db); // ...then bring them up to date
  return { rowsAdded, rowsUpdated };
});

// Exported for the tests.
exports.liveFieldsChanged = liveFieldsChanged;
exports.reconcileOrder = reconcileOrder;
exports.retryFailedUpdates = retryFailedUpdates;
