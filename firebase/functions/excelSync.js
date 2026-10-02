'use strict';

// excelSync
// Copies every new FreshBliss order into an Excel workbook (a .xlsx file kept in an
// Amazon S3 bucket), so the business has a simple reporting sheet. Firestore stays
// the source of truth; the workbook is a COPY. If the copy fails, the order is
// untouched and nobody is affected: the failure is logged and recorded, and can be
// retried later.
//
// This file does the CREATE side (a new order becomes a new row) and holds the
// pieces the UPDATE side (excelSyncUpdate.js) shares: settings, the row layout, and
// the ledger. Talking to S3 and editing the workbook is in shared/s3Workbook.js.
//
// HOW IT WORKS
//   1. Firestore creates a new document in `orders`  ->  this function runs.
//   2. We turn the order into one row of cells (orderToRow).
//   3. We download the workbook from S3, add the row, and upload it again, but only
//      if nobody else changed it in the meantime (appendRow -> updateWorkbook).
//      If the order's ID is already in the sheet we add nothing, so a retry can never
//      create a duplicate row.
//   4. We note the result in a server-only Firestore collection, `excelSync/{orderId}`.
//
// SETUP: see docs/AWS_SETUP.md. Until it is done the settings below are empty and
// this function simply does nothing, so the rest of the app is unaffected.

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const { defineSecret, defineString } = require('firebase-functions/params');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { updateWorkbook } = require('./shared/s3Workbook');

// ---------- settings ----------
// Every one defaults to empty (or a sensible value), so the functions still LOAD (and
// the emulator still starts) before AWS is set up. Where to find each value: docs/AWS_SETUP.md.
const EXCEL_S3_BUCKET = defineString('EXCEL_S3_BUCKET', { default: '' }); // the bucket that holds the workbook
const EXCEL_S3_KEY = defineString('EXCEL_S3_KEY', { default: 'orders/orders.xlsx' }); // the workbook's path inside the bucket
const EXCEL_AWS_REGION = defineString('EXCEL_AWS_REGION', { default: 'ap-south-1' }); // the bucket's region
const EXCEL_AWS_ACCESS_KEY_ID = defineString('EXCEL_AWS_ACCESS_KEY_ID', { default: '' }); // the IAM user's access key ID
const EXCEL_AWS_SECRET_ACCESS_KEY = defineSecret('EXCEL_AWS_SECRET_ACCESS_KEY'); // the secret (kept in Secret Manager)
// Leave empty. Only set it to try the sync against a local S3 look-alike.
const EXCEL_S3_ENDPOINT = defineString('EXCEL_S3_ENDPOINT', { default: '' });

const REGION = 'asia-south1';

const STALE_PENDING_MS = 5 * 60 * 1000; // a "working on it" note older than this is assumed to be a crashed run

// ---------- what goes in the sheet ----------

// The columns, in order. The sheet's first row must have EXACTLY these headers in
// this order (a new workbook is created with them; docs/AWS_SETUP.md lists them).
// Add new columns at the END.
//
// The LAST THREE are the "live" columns: they change as the order moves along
// (excelSyncUpdate.js rewrites just these). They sit together at the end so one
// small write can update all three. Everything before them is written once.
const EXCEL_COLUMNS = [
  'Order ID',
  'Received (IST)',
  'Customer',
  'Phone',
  'Address',
  'Pincode',
  'Zone',
  'Items',
  'Subtotal (INR)',
  'Discount (INR)',
  'Delivery fee (INR)',
  'Tip (INR)',
  'Total (INR)',
  'Razorpay payment ID',
  'Note',
  // ---- live columns ----
  'Payment status',
  'Order status',
  'Last updated (IST)',
];
const LIVE_COLUMN_COUNT = 3;
const FIRST_LIVE_COLUMN = EXCEL_COLUMNS.length - LIVE_COLUMN_COUNT;

// Column number -> Excel letters: 0 = A, 25 = Z, 26 = AA.
function columnLetter(index) {
  let n = index;
  let letters = '';
  do {
    letters = String.fromCharCode(65 + (n % 26)) + letters;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letters;
}

// SAFETY: Excel treats a cell that starts with = + - or @ as a FORMULA once it is
// edited, exported to CSV and reopened, or pasted elsewhere. A customer could type
// "=HYPERLINK(...)" as their address and it would run for whoever opens it later.
// A leading apostrophe makes Excel keep it as plain text.
function safeCell(value) {
  if (typeof value !== 'string') return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

const clip = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');

// "2026-10-01 20:41" in Indian time, which is what the business reads.
function formatIst(timestamp) {
  const date = typeof timestamp?.toDate === 'function' ? timestamp.toDate() : null;
  if (!date) return '';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

// Turns one order into one row. The result is always EXCEL_COLUMNS.length long.
//   customer: { name, phone } looked up from Firebase Auth (may be empty)
// Money is written as NUMBERS so Excel can add it up.
function orderToRow(orderId, order, customer = {}) {
  const pricing = order.pricing || {};
  const size = (s) => String(s || '').replace(/^./, (c) => c.toUpperCase()); // "large" -> "Large"
  const items = (order.items || []).map((i) => `${i.qty} × ${i.name} (${size(i.size)})`).join('; ');

  return [
    orderId,
    formatIst(order.createdAt),
    customer.name || 'Guest', // orders do not store a name yet; see lookupCustomer
    customer.phone || '',
    clip(order.address, 500),
    order.pincode || '',
    order.zone?.name || '',
    clip(items, 2000),
    pricing.subtotal ?? 0,
    pricing.discount ?? 0,
    pricing.deliveryFee ?? 0,
    pricing.tip ?? 0,
    pricing.total ?? 0,
    order.payment?.razorpayPaymentId || '',
    clip(order.note, 500),
    // ---- live columns (kept in step by excelSyncUpdate.js) ----
    order.paymentStatus || '',
    order.status || '',
    formatIst(order.updatedAt || order.createdAt),
  ].map(safeCell);
}

// The order has no customer name or phone (guests sign in anonymously), so ask
// Firebase Auth. Once real login (for example phone sign-in) exists, these fill in.
// A lookup problem must never stop the sync, so any failure just gives "Guest".
async function lookupCustomer(uid) {
  try {
    const user = await getAuth().getUser(uid);
    return { name: user.displayName || '', phone: user.phoneNumber || '' };
  } catch {
    return { name: '', phone: '' };
  }
}

// ---------- talking to S3 ----------

// Adds one row to the bottom of the sheet, unless this order is already in it.
//   row  an array of cell values, one per column
// Returns { attempts, alreadyThere }. Throws a WorkbookError if it could not be done.
async function appendRow(cfg, orderId, row, deps = {}) {
  const { attempts, alreadyThere = false } = await updateWorkbook(
    cfg,
    {
      columns: EXCEL_COLUMNS,
      mutate: (sheet) => {
        // Looked at on every try. If an earlier try saved but its reply was lost, the row is there already.
        if (sheet.rowsFor(orderId).length > 0) return { changed: false, alreadyThere: true };
        sheet.append(row);
        return { changed: true };
      },
    },
    deps,
  );
  return { attempts, alreadyThere };
}

// ---------- reading the settings ----------

// Gathered when a function RUNS (secret values are only readable then).
function readConfig() {
  return {
    bucket: EXCEL_S3_BUCKET.value().trim(),
    key: EXCEL_S3_KEY.value().trim() || 'orders/orders.xlsx',
    region: EXCEL_AWS_REGION.value().trim() || 'ap-south-1',
    accessKeyId: EXCEL_AWS_ACCESS_KEY_ID.value().trim(),
    secretAccessKey: (EXCEL_AWS_SECRET_ACCESS_KEY.value() || '').trim(),
    endpoint: EXCEL_S3_ENDPOINT.value().trim(),
  };
}

// Which required settings are still empty?
function missingSettings(cfg) {
  const names = { bucket: 'EXCEL_S3_BUCKET', accessKeyId: 'EXCEL_AWS_ACCESS_KEY_ID', secretAccessKey: 'EXCEL_AWS_SECRET_ACCESS_KEY' };
  return Object.entries(names).filter(([key]) => !cfg[key]).map(([, name]) => name);
}

// ---------- the ledger: one note per order, so a row is never added twice ----------
// Firestore can deliver the same event more than once. appendRow already refuses to add
// an order that is in the sheet, but claiming the order first stops two runs doing the
// same work at the same time: we "claim" it in `excelSync/{orderId}`.
// Clients cannot read or write this collection (the security rules deny it).
//   state: PENDING (working on it) -> DONE, or FAILED
// (excelSyncUpdate.js adds its own fields to the same note: synced, updateState, ...)
//
// Returns { go: true } if we should add the row, else { go: false, reason }.
async function claim(db, orderId, { allowFailed }) {
  const ref = db.doc(`excelSync/${orderId}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = FieldValue.serverTimestamp();

    if (snap.exists) {
      const { state, updatedAt, attempts = 0 } = snap.data();
      if (state === 'DONE') return { go: false, reason: 'already in Excel' };
      if (state === 'PENDING' && Date.now() - (updatedAt?.toMillis?.() ?? 0) < STALE_PENDING_MS) {
        return { go: false, reason: 'another run is adding it' };
      }
      if (state === 'FAILED' && !allowFailed) return { go: false, reason: 'failed earlier; use retryExcelSync' };
      // FAILED (on a retry) or a PENDING note left by a crashed run: take it over.
      tx.update(ref, { state: 'PENDING', updatedAt: now, attempts: attempts + 1 });
      return { go: true };
    }

    tx.create(ref, { state: 'PENDING', createdAt: now, updatedAt: now, attempts: 1 });
    return { go: true };
  });
}

// What we store about a failure: plain text only, never the secret or the row.
function describeError(err) {
  return {
    message: String(err?.message || err).slice(0, 500),
    stage: err?.stage || 'unknown',
    status: err?.status ?? null,
    code: err?.code ?? null,
    hint: err?.hint || '',
  };
}

// ---------- the main job ----------

// Copies one order to Excel. NEVER throws: whatever goes wrong is logged and
// recorded, and the caller (the Firestore trigger) carries on as if nothing happened.
//   deps  lets tests replace the network, the clock and the customer lookup
// Returns { status: 'done' | 'skipped' | 'failed', ... } (handy for tests and the retry tool).
async function syncOrder(db, { orderId, order, allowFailed = false, deps = {} }) {
  try {
    const cfg = deps.config || readConfig();

    // Not set up yet: say so once and move on. This is normal during development.
    const missing = missingSettings(cfg);
    if (missing.length > 0) {
      logger.info('excelSync: Excel is not set up yet, so this order was not copied.', { orderId, missing });
      return { status: 'skipped', reason: 'not configured' };
    }
    if (!order) return { status: 'skipped', reason: 'no order data' };

    const mine = await claim(db, orderId, { allowFailed });
    if (!mine.go) {
      logger.info('excelSync: skipped.', { orderId, reason: mine.reason });
      return { status: 'skipped', reason: mine.reason };
    }

    const ref = db.doc(`excelSync/${orderId}`);
    try {
      // Use the order as it is NOW, not as it was when the event fired. If staff
      // moved it on in the meantime, the row starts out up to date.
      const fresh = await db.doc(`orders/${orderId}`).get();
      const current = fresh.exists ? fresh.data() : order;

      const customer = await (deps.lookupCustomer || lookupCustomer)(current.uid);
      const row = orderToRow(orderId, current, customer);
      const { attempts, alreadyThere } = await appendRow(cfg, orderId, row, deps);

      await ref.update({
        state: 'DONE',
        rowAddedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        error: FieldValue.delete(),
        // What the live columns show right now (excelSyncUpdate.js compares against this).
        synced: { status: current.status ?? null, paymentStatus: current.paymentStatus ?? null },
      });
      logger.info(alreadyThere ? 'excelSync: the order was already in Excel.' : 'excelSync: order added to Excel.', { orderId, attempts });
      return { status: 'done', attempts, alreadyThere };
    } catch (err) {
      const info = describeError(err);
      // The order is safe in Firestore. Only the Excel copy is missing.
      logger.error('excelSync: could not add the order to Excel. The order itself is fine.', { orderId, ...info });
      await ref
        .update({ state: 'FAILED', error: info, updatedAt: FieldValue.serverTimestamp() })
        .catch((e) => logger.error('excelSync: could not even record the failure.', { orderId, detail: e?.message }));
      return { status: 'failed', error: info };
    }
  } catch (err) {
    // Last safety net: something we did not expect. Still no crash.
    logger.error('excelSync: unexpected problem. The order itself is fine.', { orderId, ...describeError(err) });
    return { status: 'failed', error: describeError(err) };
  }
}

// Tries again for orders whose copy failed earlier (for example, the AWS key had
// been disabled and has now been replaced). Safe to repeat: an order that did reach
// the sheet is recognised by its ID and not added again.
async function retryFailedSyncs(db, { limit = 25, deps = {} } = {}) {
  const failed = await db.collection('excelSync').where('state', '==', 'FAILED').limit(limit).get();
  const result = { tried: 0, added: 0, stillFailing: 0 };

  for (const note of failed.docs) {
    const order = await db.doc(`orders/${note.id}`).get();
    if (!order.exists) continue;
    const r = await syncOrder(db, { orderId: note.id, order: order.data(), allowFailed: true, deps });
    result.tried += 1;
    if (r.status === 'done') result.added += 1;
    else result.stillFailing += 1;
  }
  return result;
}

// ---------- the function Firebase runs ----------

// Runs once for every NEW order. Orders are created only by the server (when a
// payment is confirmed, or an order is cancelled for stock), so this sees them all.
// It deliberately does NOT use `retry: true`: updateWorkbook handles its own retries.
// (The staff "retry" function, retryExcelSync, lives in excelSyncUpdate.js because
// it re-sends both missing rows and missed updates.)
exports.excelSync = onDocumentCreated(
  { document: 'orders/{orderId}', region: REGION, secrets: [EXCEL_AWS_SECRET_ACCESS_KEY], timeoutSeconds: 120 },
  async (event) => {
    await syncOrder(getFirestore(), { orderId: event.params.orderId, order: event.data?.data() });
  },
);

// Exported for the update function, the tests and the setup guide.
exports.REGION = REGION;
exports.EXCEL_AWS_SECRET_ACCESS_KEY = EXCEL_AWS_SECRET_ACCESS_KEY;
exports.EXCEL_COLUMNS = EXCEL_COLUMNS;
exports.FIRST_LIVE_COLUMN = FIRST_LIVE_COLUMN;
exports.LIVE_COLUMN_COUNT = LIVE_COLUMN_COUNT;
exports.columnLetter = columnLetter;
exports.formatIst = formatIst;
exports.orderToRow = orderToRow;
exports.safeCell = safeCell;
exports.readConfig = readConfig;
exports.missingSettings = missingSettings;
exports.describeError = describeError;
exports.appendRow = appendRow;
exports.syncOrder = syncOrder;
exports.retryFailedSyncs = retryFailedSyncs;
