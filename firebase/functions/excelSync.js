'use strict';

// excelSync
// Copies every new FreshBliss order into a Microsoft 365 Excel workbook, so the
// business has a simple reporting sheet. Firestore stays the source of truth;
// Excel is a COPY. If the copy fails, the order is untouched and nobody is
// affected: the failure is logged and recorded, and can be retried later.
//
// This file does the CREATE side (a new order becomes a new row) and holds the
// pieces the UPDATE side (excelSyncUpdate.js) shares: settings, the row layout,
// and callGraph(), the one function that talks to Microsoft.
//
// HOW IT WORKS
//   1. Firestore creates a new document in `orders`  ->  this function runs.
//   2. We turn the order into one row of cells (orderToRow).
//   3. We ask Microsoft for an access token using the app's ID and secret
//      ("client credentials", no person has to sign in) (getAccessToken).
//   4. We POST the row to the Microsoft Graph API, which appends it to the
//      Excel Table `OrdersTable` (appendRow).
//   5. We note the result in a server-only Firestore collection, `excelSync/{orderId}`.
//
// SETUP: see docs/AZURE_SETUP.md. Until it is done the settings below are empty
// and this function simply does nothing, so the rest of the app is unaffected.
//
// WHY A TABLE: Microsoft Graph cannot "append a row to a worksheet". It can append
// to an Excel TABLE, which grows by itself. So the Orders sheet needs a table
// named OrdersTable whose columns match EXCEL_COLUMNS below, in the same order.

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const { defineSecret, defineString } = require('firebase-functions/params');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

// ---------- settings ----------
// Every one defaults to empty, so the functions still LOAD (and the emulator
// still starts) before Azure is set up. Where to find each value: docs/AZURE_SETUP.md.
const GRAPH_TENANT_ID = defineString('GRAPH_TENANT_ID', { default: '' }); // "Directory (tenant) ID"
const GRAPH_CLIENT_ID = defineString('GRAPH_CLIENT_ID', { default: '' }); // "Application (client) ID"
const GRAPH_CLIENT_SECRET = defineSecret('GRAPH_CLIENT_SECRET'); // the secret VALUE (kept in Secret Manager)
const EXCEL_DRIVE_ID = defineString('EXCEL_DRIVE_ID', { default: '' }); // the OneDrive / SharePoint drive holding the file
const EXCEL_ITEM_ID = defineString('EXCEL_ITEM_ID', { default: '' }); // the workbook file itself
const EXCEL_TABLE_NAME = defineString('EXCEL_TABLE_NAME', { default: 'OrdersTable' });
// Only change these for a Microsoft cloud other than the standard one (for
// example Microsoft 365 China or US Government), or for testing.
const GRAPH_LOGIN_URL = defineString('GRAPH_LOGIN_URL', { default: 'https://login.microsoftonline.com' });
const GRAPH_API_URL = defineString('GRAPH_API_URL', { default: 'https://graph.microsoft.com' });

const REGION = 'asia-south1';

// How patient to be with Microsoft before giving up on one order.
const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 1000; // wait 1s, 2s, 4s between tries (unless Microsoft says how long)
const MAX_DELAY_MS = 15000;
const REQUEST_TIMEOUT_MS = 15000;
const TOKEN_SAFETY_MARGIN_MS = 5 * 60 * 1000; // renew a token 5 minutes before it expires
const STALE_PENDING_MS = 5 * 60 * 1000; // a "working on it" note older than this is assumed to be a crashed run

// ---------- what goes in the sheet ----------

// The columns, in order. The Excel table must have EXACTLY these headers in
// this order (docs/AZURE_SETUP.md lists them). Add new columns at the END.
//
// The LAST THREE are the "live" columns: they change as the order moves along
// (excelSyncUpdate.js rewrites just these). They sit together at the end so one
// small request can update all three. Everything before them is written once.
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

// SAFETY: Excel treats a cell that starts with = + - or @ as a FORMULA. A
// customer could type "=HYPERLINK(...)" as their address and it would run when
// staff open the sheet. A leading apostrophe makes Excel keep it as plain text.
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

// ---------- talking to Microsoft ----------

// A problem talking to Microsoft, with enough detail to log and to decide what to do.
//   stage          'token' | 'append' | 'lookup' | 'update'
//   retryable      trying again could help (and cannot create a duplicate row)
//   maybeAppended  we cannot be sure whether a row we tried to ADD reached Excel
class GraphError extends Error {
  constructor(message, { stage, status = null, code = null, retryable = false, maybeAppended = false, retryAfterMs = null } = {}) {
    super(message);
    this.name = 'GraphError';
    this.stage = stage;
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.maybeAppended = maybeAppended;
    this.retryAfterMs = retryAfterMs;
    this.hint = hintFor({ stage, status, code, message });
  }
}

// Plain-English next steps for the mistakes people make during setup.
function hintFor({ stage, status, code, message }) {
  const text = `${code || ''} ${message || ''}`;
  if (/AADSTS7000215/.test(text)) return 'The client secret is wrong. Copy the secret VALUE (not the Secret ID) when you create it.';
  if (/AADSTS7000222/.test(text)) return 'The client secret has expired. Create a new one in Azure and update GRAPH_CLIENT_SECRET.';
  if (/AADSTS700016/.test(text)) return 'Microsoft does not know this Client ID in this tenant. Check GRAPH_CLIENT_ID and GRAPH_TENANT_ID.';
  if (/AADSTS90002|AADSTS900023/.test(text)) return 'The Tenant ID is wrong. Check GRAPH_TENANT_ID.';
  const onWorkbook = stage !== 'token';
  if (onWorkbook && (status === 403 || /accessDenied|Authorization_RequestDenied/i.test(text))) {
    return 'The app is not allowed to write to that file. Check the Graph permission (Files.ReadWrite.All) and that admin consent was granted.';
  }
  if (onWorkbook && (status === 404 || /itemNotFound/i.test(text))) {
    return 'Microsoft cannot find the file or table. Check EXCEL_DRIVE_ID, EXCEL_ITEM_ID and that the table is named as in EXCEL_TABLE_NAME.';
  }
  if (stage === 'append' && status === 400) {
    return 'Microsoft rejected the row. Most often the table has a different number of columns than EXCEL_COLUMNS in excelSync.js.';
  }
  if (stage === 'lookup' && status === 400) {
    return 'Microsoft could not read the Order ID column. Check the table has at least one data row and that its first column is "Order ID".';
  }
  if (stage === 'update' && status === 400) {
    return 'Microsoft rejected the update. Check the table still has the columns listed in docs/AZURE_SETUP.md, in the same order.';
  }
  if (status === 423 || /resourceLocked/i.test(text)) return 'The workbook is locked by another process. It will be retried.';
  return '';
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const encode = (value) => encodeURIComponent(String(value));

// How long Microsoft asked us to wait (the Retry-After header), or null if it did not
// say. The header is either a number of seconds or a date. Capped so one slow reply
// cannot hold us up for minutes.
function retryAfterMs(res) {
  const raw = res.headers?.get?.('retry-after');
  if (raw === null || raw === undefined || String(raw).trim() === '') return null; // no instruction: use our own backoff
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, MAX_DELAY_MS);
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.min(Math.max(date - Date.now(), 0), MAX_DELAY_MS) : null;
}

// Microsoft's errors are JSON. Reading one must never itself throw.
async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

// Make one HTTP call and turn "the call itself failed" into a GraphError.
// Whether that is safe to retry depends on what the call does:
//   token       getting a token changes nothing, so any hiccup is safe to retry.
//   idempotent  reading, or writing the SAME values again, is harmless to repeat,
//               so any hiccup is safe to retry (this covers lookup and update).
//   append      adding a row is NOT harmless to repeat. If we never connected
//               (connection refused, DNS failure) nothing was sent, so it is safe.
//               A TIMEOUT or a dropped connection might have happened AFTER Excel
//               added the row, so it is NOT retried (a retry could add the order
//               twice); it is flagged `maybeAppended` instead.
async function send(stage, fetchImpl, url, init, idempotent = false) {
  try {
    return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (err) {
    const cause = err?.cause?.code || err?.code || '';
    const neverConnected = ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'].includes(cause);
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    const safe = stage === 'token' || idempotent || neverConnected;
    throw new GraphError(timedOut ? 'The request to Microsoft timed out.' : `Could not reach Microsoft (${cause || err?.message || 'network error'}).`, {
      stage,
      code: timedOut ? 'timeout' : cause || 'network',
      retryable: safe,
      maybeAppended: stage === 'append' && !safe,
    });
  }
}

// --- the access token ---
// A token is good for about an hour, so keep it and reuse it across orders
// instead of asking Microsoft every time. (Kept per running instance.)
const tokenCache = new Map(); // "tenant|client" -> { token, expiresAt }

// Asks Microsoft for an app-only token. No person signs in: the app proves who
// it is with its Client ID and Client Secret ("client credentials").
//   cfg   { tenantId, clientId, clientSecret, loginUrl, apiUrl }
async function getAccessToken(cfg, { fetchImpl = fetch, now = Date.now } = {}) {
  const key = `${cfg.tenantId}|${cfg.clientId}`;
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt - TOKEN_SAFETY_MARGIN_MS > now()) return cached.token;

  const res = await send('token', fetchImpl, `${cfg.loginUrl}/${encode(cfg.tenantId)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      scope: `${cfg.apiUrl}/.default`, // "everything this app was granted in Azure"
      grant_type: 'client_credentials',
    }),
  });

  const body = await readJson(res);
  if (!res.ok || !body.access_token) {
    // Microsoft's description has a code like AADSTS7000215 on its first line and
    // trace ids after it. Keep only the first line. (It never contains the secret.)
    const firstLine = String(body.error_description || body.error || `HTTP ${res.status}`).split('\n')[0];
    throw new GraphError(`Microsoft would not give a token: ${firstLine}`, {
      stage: 'token',
      status: res.status,
      code: body.error || null,
      retryable: res.status === 429 || res.status >= 500,
      retryAfterMs: retryAfterMs(res),
    });
  }

  tokenCache.set(key, { token: body.access_token, expiresAt: now() + (Number(body.expires_in) || 3600) * 1000 });
  return body.access_token;
}

// The Graph address of the workbook, to build other addresses from.
function workbookUrl(cfg) {
  return `${cfg.apiUrl}/v1.0/drives/${encode(cfg.driveId)}/items/${encode(cfg.itemId)}/workbook`;
}

// THE ONE FUNCTION THAT CALLS MICROSOFT'S EXCEL API. Adding a row, finding a row
// and updating cells all go through here, so they share the same rules:
//   - get a token (saved one if still good)
//   - on a 401, throw the saved token away and try once with a fresh one
//   - on "busy / slow down" (409, 423, 429, 503) wait and try again, up to 4 tries,
//     using Microsoft's Retry-After if it gave one, else 1s, 2s, 4s
//   - give up straight away on mistakes that retrying cannot fix (404, 403, 400)
//
//   stage       'append' | 'lookup' | 'update' (used in logs and hints)
//   idempotent  true when repeating the call is harmless (a read, or writing the same
//               values again). Then server errors and timeouts are retried too. For
//               adding a row it is false, so those are NOT retried (no duplicate rows).
// Returns { attempts, data } (data = Microsoft's reply as an object). Throws a GraphError.
async function callGraph(cfg, { stage, method, url, body, idempotent = false }, { fetchImpl = fetch, sleep = wait, now = Date.now } = {}) {
  const tokenKey = `${cfg.tenantId}|${cfg.clientId}`;
  const retryStatuses = idempotent ? [408, 409, 423, 429, 500, 502, 503, 504] : [409, 423, 429, 503];
  let triedFreshToken = false;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const token = await getAccessToken(cfg, { fetchImpl, now });
      const res = await send(
        stage,
        fetchImpl,
        url,
        {
          method,
          headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
          body: body === undefined ? undefined : JSON.stringify(body),
        },
        idempotent,
      );
      if (res.ok) return { attempts: attempt, data: await readJson(res) };

      const failure = await readJson(res);
      const status = res.status;
      throw new GraphError(`Excel refused the request: ${failure.error?.message || `HTTP ${status}`}`, {
        stage,
        status,
        code: failure.error?.code || null,
        retryable: retryStatuses.includes(status),
        // Only a failed ADD can leave us unsure. A 5xx other than 503 might have partly worked.
        maybeAppended: !idempotent && status >= 500 && status !== 503,
        retryAfterMs: retryAfterMs(res),
      });
    } catch (e) {
      const err = e instanceof GraphError ? e : new GraphError(String(e?.message || e), { stage, maybeAppended: !idempotent });

      // A 401 usually means the saved token went stale. Throw it away and try
      // once more with a brand new one.
      if (err.stage !== 'token' && err.status === 401 && !triedFreshToken) {
        triedFreshToken = true;
        tokenCache.delete(tokenKey);
        continue;
      }
      if (!err.retryable || attempt === MAX_ATTEMPTS) throw err;
      await sleep(err.retryAfterMs ?? Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS));
    }
  }
  throw new GraphError('Gave up talking to Microsoft.', { stage, maybeAppended: !idempotent }); // not reachable
}

// Adds one row to the bottom of the Excel table.
//   row  an array of cell values, one per table column
// Returns { attempts }. Throws a GraphError if it could not be done.
async function appendRow(cfg, row, deps = {}) {
  const url = `${workbookUrl(cfg)}/tables/${encode(cfg.tableName)}/rows/add`;
  // index: null means "add at the end".
  const { attempts } = await callGraph(cfg, { stage: 'append', method: 'POST', url, body: { index: null, values: [row] }, idempotent: false }, deps);
  return { attempts };
}

// ---------- reading the settings ----------

// Gathered when a function RUNS (secret values are only readable then).
function readConfig() {
  return {
    tenantId: GRAPH_TENANT_ID.value().trim(),
    clientId: GRAPH_CLIENT_ID.value().trim(),
    clientSecret: (GRAPH_CLIENT_SECRET.value() || '').trim(),
    driveId: EXCEL_DRIVE_ID.value().trim(),
    itemId: EXCEL_ITEM_ID.value().trim(),
    tableName: EXCEL_TABLE_NAME.value().trim() || 'OrdersTable',
    loginUrl: GRAPH_LOGIN_URL.value().trim().replace(/\/+$/, ''),
    apiUrl: GRAPH_API_URL.value().trim().replace(/\/+$/, ''),
  };
}

// Which required settings are still empty?
function missingSettings(cfg) {
  const names = { tenantId: 'GRAPH_TENANT_ID', clientId: 'GRAPH_CLIENT_ID', clientSecret: 'GRAPH_CLIENT_SECRET', driveId: 'EXCEL_DRIVE_ID', itemId: 'EXCEL_ITEM_ID' };
  return Object.entries(names).filter(([key]) => !cfg[key]).map(([, name]) => name);
}

// ---------- the ledger: one note per order, so a row is never added twice ----------
// Firestore can deliver the same event more than once, and Excel cannot reject a
// duplicate row. So before adding a row we "claim" the order in `excelSync/{orderId}`.
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
      const { attempts } = await appendRow(cfg, row, deps);

      await ref.update({
        state: 'DONE',
        rowAddedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        error: FieldValue.delete(),
        maybeAppended: FieldValue.delete(),
        // What the live columns show right now (excelSyncUpdate.js compares against this).
        synced: { status: current.status ?? null, paymentStatus: current.paymentStatus ?? null },
      });
      logger.info('excelSync: order added to Excel.', { orderId, attempts });
      return { status: 'done', attempts };
    } catch (err) {
      const info = describeError(err);
      // The order is safe in Firestore. Only the Excel copy is missing.
      logger.error('excelSync: could not add the order to Excel. The order itself is fine.', { orderId, ...info });
      await ref
        .update({ state: 'FAILED', error: info, maybeAppended: Boolean(err?.maybeAppended), updatedAt: FieldValue.serverTimestamp() })
        .catch((e) => logger.error('excelSync: could not even record the failure.', { orderId, detail: e?.message }));
      return { status: 'failed', error: info, maybeAppended: Boolean(err?.maybeAppended) };
    }
  } catch (err) {
    // Last safety net: something we did not expect. Still no crash.
    logger.error('excelSync: unexpected problem. The order itself is fine.', { orderId, ...describeError(err) });
    return { status: 'failed', error: describeError(err) };
  }
}

// Tries again for orders whose copy failed earlier (for example, the secret had
// expired and has now been renewed). Skips ones where we are not sure the row
// is missing; those need a human to look in Excel.
async function retryFailedSyncs(db, { limit = 25, deps = {} } = {}) {
  const failed = await db.collection('excelSync').where('state', '==', 'FAILED').limit(limit).get();
  const result = { tried: 0, added: 0, stillFailing: 0, checkInExcel: [] };

  for (const note of failed.docs) {
    if (note.get('maybeAppended')) {
      result.checkInExcel.push(note.id);
      continue;
    }
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
// It deliberately does NOT use `retry: true`: syncOrder handles its own retries,
// and an automatic re-run could add a duplicate row.
// (The staff "retry" function, retryExcelSync, lives in excelSyncUpdate.js because
// it re-sends both missing rows and missed updates.)
exports.excelSync = onDocumentCreated(
  { document: 'orders/{orderId}', region: REGION, secrets: [GRAPH_CLIENT_SECRET], timeoutSeconds: 120 },
  async (event) => {
    await syncOrder(getFirestore(), { orderId: event.params.orderId, order: event.data?.data() });
  },
);

// Exported for the update function, the tests and the setup guide.
exports.REGION = REGION;
exports.GRAPH_CLIENT_SECRET = GRAPH_CLIENT_SECRET;
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
exports.workbookUrl = workbookUrl;
exports.encode = encode;
exports.getAccessToken = getAccessToken;
exports.callGraph = callGraph;
exports.appendRow = appendRow;
exports.syncOrder = syncOrder;
exports.retryFailedSyncs = retryFailedSyncs;
exports.GraphError = GraphError;
exports._clearTokenCache = () => tokenCache.clear();
