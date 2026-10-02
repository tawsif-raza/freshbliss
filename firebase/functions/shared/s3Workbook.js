'use strict';

// s3Workbook
// Keeps the Orders spreadsheet as ONE .xlsx file in an Amazon S3 bucket, and gives
// the Excel sync a safe way to change it. Used by excelSync.js and excelSyncUpdate.js.
//
// WHY IT IS SAFE TO CHANGE ONE FILE FROM MANY PLACES AT ONCE
// S3 cannot edit part of a file, so every change is: download the file, change a
// row, upload it again. Two changes at the same moment could overwrite each other.
// To prevent that, the upload says "only accept this if the file is STILL the version
// I downloaded" (an S3 conditional write, using the file's ETag). If someone else got
// in first, S3 refuses (412), and we start again from the new version. Nothing is lost.
//
// WHY A RETRY CAN NEVER ADD A ROW TWICE
// Adding a row first looks for the order's ID in the sheet and does nothing if it is
// already there. So after a timeout or a lost reply we can simply try again.
//
// It never touches Firestore and never throws anything but a WorkbookError.

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const SHEET_NAME = 'Orders';
const MAX_ATTEMPTS = 4; // tries when AWS is busy or unreachable
const MAX_CONFLICTS = 30; // times we start over because someone else saved first (a rush of orders: one writer wins each round)
const BASE_DELAY_MS = 1000; // wait 1s, 2s, 4s between tries (unless AWS says how long)
const MAX_DELAY_MS = 15000;
const REQUEST_TIMEOUT_MS = 15000;
const CONNECT_TIMEOUT_MS = 5000;
const MAX_ROWS_PER_ORDER = 5; // an order should be in the sheet once; this is just a safety cap

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------- errors ----------

// A problem reading or saving the workbook, with enough detail to log and to decide what to do.
//   stage      'read' | 'write'
//   retryable  trying again could help
class WorkbookError extends Error {
  constructor(message, { stage, status = null, code = null, retryable = false, retryAfterMs = null, hint } = {}) {
    super(message);
    this.name = 'WorkbookError';
    this.stage = stage;
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
    this.hint = hint ?? hintFor({ stage, status, code });
  }
}

// Plain-English next steps for the mistakes people make during setup.
function hintFor({ status, code }) {
  switch (code) {
    case 'NoSuchBucket':
      return 'AWS cannot find the bucket. Check EXCEL_S3_BUCKET and EXCEL_AWS_REGION.';
    case 'InvalidAccessKeyId':
      return 'AWS does not recognise this access key. Check EXCEL_AWS_ACCESS_KEY_ID, and that the key was not deleted or made inactive.';
    case 'SignatureDoesNotMatch':
      return 'The secret access key is wrong. Create a new access key and update EXCEL_AWS_SECRET_ACCESS_KEY (copy the secret, not the key ID).';
    case 'ExpiredToken':
    case 'InvalidToken':
      return 'These credentials have expired. Use a long-lived IAM user access key, as in docs/AWS_SETUP.md.';
    case 'RequestTimeTooSkewed':
      return 'The server clock is wrong by more than 15 minutes, so AWS refuses the request.';
    case 'PermanentRedirect':
    case 'AuthorizationHeaderMalformed':
      return 'The bucket is in a different AWS region. Set EXCEL_AWS_REGION to the bucket\'s region.';
    case 'bad-workbook':
    case 'bad-headers':
    case 'no-sheet':
      return ''; // these carry their own hint
    default:
  }
  if (status === 403 || code === 'AccessDenied') {
    return 'The AWS user is not allowed to use that file. Check its policy in docs/AWS_SETUP.md: it needs s3:GetObject and s3:PutObject on the file, and s3:ListBucket on the bucket (without ListBucket a file that does not exist yet shows up as "access denied").';
  }
  if (status === 404) return 'AWS cannot find the bucket or file. Check EXCEL_S3_BUCKET and EXCEL_S3_KEY.';
  if (code === 'SlowDown' || status === 503) return 'AWS asked us to slow down. It will be retried.';
  return '';
}

const NETWORK_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE', 'ECONNABORTED', 'ENETUNREACH', 'EHOSTUNREACH']);
const BUSY_CODES = new Set(['SlowDown', 'ServiceUnavailable', 'InternalError', 'RequestTimeout', 'ThrottlingException', 'TooManyRequestsException', 'RequestLimitExceeded']);
const BUSY_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

// How long AWS asked us to wait (the Retry-After header), or null. Capped so one
// slow reply cannot hold us up for minutes.
function retryAfterMsOf(err) {
  const raw = err?.$response?.headers?.['retry-after'];
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, MAX_DELAY_MS);
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.min(Math.max(date - Date.now(), 0), MAX_DELAY_MS) : null;
}

// Sorts whatever the AWS SDK (or the network) threw into one of three kinds:
//   conflict    someone else saved the file first. Start again from their version.
//   transient   busy, slow or unreachable. Wait and try again.
//   fatal       a mistake retrying cannot fix (wrong key, no permission, no bucket).
function classify(err, stage) {
  if (err instanceof WorkbookError) return err;
  const code = err?.Code || err?.name || null;
  const status = err?.$metadata?.httpStatusCode ?? err?.statusCode ?? null;
  const cause = err?.cause?.code || err?.code || '';

  const conflict = code === 'PreconditionFailed' || code === 'ConditionalRequestConflict' || status === 412;
  const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError' || code === 'RequestTimeout';
  const network = NETWORK_CODES.has(cause);
  const busy = BUSY_CODES.has(code) || BUSY_STATUSES.has(status) || timedOut || network;

  const message = timedOut
    ? 'The request to AWS timed out.'
    : network
      ? `Could not reach AWS (${cause}).`
      : `AWS refused the request: ${String(err?.message || code || `HTTP ${status}`).slice(0, 300)}`;

  const wrapped = new WorkbookError(message, {
    stage,
    status,
    code: conflict ? 'conflict' : timedOut ? 'timeout' : network ? cause : code,
    retryable: conflict || busy,
    retryAfterMs: retryAfterMsOf(err),
  });
  wrapped.conflict = conflict;
  return wrapped;
}

// ---------- talking to S3 ----------

//   cfg  { bucket, key, region, accessKeyId, secretAccessKey, endpoint }
function makeClient(cfg) {
  const { S3Client } = require('@aws-sdk/client-s3');
  return new S3Client({
    region: cfg.region,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    // `endpoint` is empty in real use. It exists so the sync can be tried against a local
    // S3 look-alike, which needs path-style addresses.
    ...(cfg.endpoint ? { endpoint: cfg.endpoint, forcePathStyle: true } : {}),
    maxAttempts: 1, // we do our own retrying, below, so the rules are in one place
    requestHandler: { requestTimeout: REQUEST_TIMEOUT_MS, connectionTimeout: CONNECT_TIMEOUT_MS },
  });
}

// The two things we ever do to the file: read it (with its version) and replace it
// (only if it is still that version). Tests swap this for an in-memory file.
function s3Store(cfg, { client } = {}) {
  const { GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
  const s3 = client || makeClient(cfg);

  return {
    // -> { body: Buffer, etag } or null when the file does not exist yet.
    async get() {
      try {
        const res = await s3.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: cfg.key }));
        return { body: Buffer.from(await res.Body.transformToByteArray()), etag: res.ETag };
      } catch (err) {
        if (err?.name === 'NoSuchKey') return null;
        throw err;
      }
    },
    // { ifMatch: etag }  save only if the file is still that version
    // { ifNoneMatch: '*' } save only if the file does not exist yet
    async put(body, { ifMatch, ifNoneMatch }) {
      await s3.send(
        new PutObjectCommand({
          Bucket: cfg.bucket,
          Key: cfg.key,
          Body: body,
          ContentType: XLSX_TYPE,
          ...(ifMatch ? { IfMatch: ifMatch } : {}),
          ...(ifNoneMatch ? { IfNoneMatch: ifNoneMatch } : {}),
        }),
      );
    },
  };
}

// ---------- a download link for staff ----------

const DOWNLOAD_LINK_SECONDS = 15 * 60;

// "freshbliss-orders-2026-10-02.xlsx", with the date in Indian time.
function downloadFilename(date) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  return `freshbliss-orders-${day}.xlsx`;
}

// A short-lived link that lets whoever holds it download the workbook from S3, and nothing else.
// The link is signed here, on the server; it carries the access key ID and a signature, never the
// secret. The browser saves it as a file (the `attachment` header) instead of showing it.
//   deps  { client, now, presign } so tests can replace S3, the clock and the signing
// Returns { url, filename, expiresAt } or null if the workbook does not exist yet.
// Throws a WorkbookError (for example when the key has no permission).
async function createDownloadLink(cfg, { expiresIn = DOWNLOAD_LINK_SECONDS } = {}, deps = {}) {
  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  const client = deps.client || makeClient(cfg);
  const now = deps.now ? deps.now() : new Date();

  // Signing happens on this machine and never talks to AWS, so a link to a file that is not
  // there would only fail later in the browser. Ask for a single byte first, to be able to say so now.
  // (Asking for the file, not just its header, tells "no such file" apart from "no such bucket".)
  try {
    const probe = await client.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: cfg.key, Range: 'bytes=0-0' }));
    await probe.Body?.transformToByteArray?.();
  } catch (err) {
    if (err?.name === 'NoSuchKey') return null;
    throw classify(err, 'read');
  }

  const filename = downloadFilename(now);
  const presign = deps.presign || require('@aws-sdk/s3-request-presigner').getSignedUrl;
  try {
    const url = await presign(
      client,
      new GetObjectCommand({
        Bucket: cfg.bucket,
        Key: cfg.key,
        ResponseContentDisposition: `attachment; filename="${filename}"`,
        ResponseContentType: XLSX_TYPE,
      }),
      { expiresIn, signingDate: now },
    );
    return { url, filename, expiresAt: new Date(now.getTime() + expiresIn * 1000).toISOString() };
  } catch (err) {
    throw classify(err, 'read');
  }
}

// ---------- the sheet ----------

// What is in a cell, as plain text. Excel stores text, numbers, formulas and rich text differently.
function plain(value) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('');
  if ('result' in value) return plain(value.result);
  if ('text' in value) return plain(value.text);
  if (value instanceof Date) return value.toISOString();
  return '';
}

const MONEY_COLUMN = /\(INR\)$/;
const COLUMN_WIDTHS = { 'Order ID': 26, 'Received (IST)': 18, Customer: 18, Phone: 15, Address: 38, Items: 38, Note: 28, 'Razorpay payment ID': 24, 'Last updated (IST)': 18 };

// The few things the Excel sync needs to do to the sheet. exceljs stays in here.
class OrdersSheet {
  constructor(sheet) {
    this.sheet = sheet;
  }

  // The sheet row numbers that hold this order (normally one).
  rowsFor(orderId) {
    const rows = [];
    const column = this.sheet.getColumn(1).values; // [ , header, id, id, ...]; row r is at index r
    for (let r = 2; r < column.length; r++) {
      // A cell may carry the safety apostrophe (see safeCell in excelSync.js); ignore it when comparing.
      if (plain(column[r]).replace(/^'/, '') === orderId) rows.push(r);
    }
    return rows.slice(0, MAX_ROWS_PER_ORDER);
  }

  // Adds a row at the bottom. `values` has one entry per column.
  append(values) {
    this.sheet.addRow(values);
  }

  // Writes `values` into the cells of `row` starting at the 0-based column `firstColumn`.
  // Returns true if any cell actually changed.
  writeCells(row, firstColumn, values) {
    let changed = false;
    values.forEach((value, i) => {
      const cell = this.sheet.getRow(row).getCell(firstColumn + i + 1);
      if (plain(cell.value) !== plain(value)) {
        cell.value = value;
        changed = true;
      }
    });
    return changed;
  }
}

// Finds (or, in a brand-new file, creates) the Orders sheet and checks its headers.
function openSheet(workbook, columns) {
  let sheet = workbook.getWorksheet(SHEET_NAME);

  if (!sheet && workbook.worksheets.length === 0) {
    sheet = workbook.addWorksheet(SHEET_NAME, { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = columns.map((header) => ({ header, key: header, width: COLUMN_WIDTHS[header] ?? 16 }));
    sheet.getRow(1).font = { bold: true };
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
    columns.forEach((header, i) => {
      if (MONEY_COLUMN.test(header)) sheet.getColumn(i + 1).numFmt = '#,##0.00';
    });
    return new OrdersSheet(sheet);
  }

  if (!sheet) {
    throw new WorkbookError(`The workbook has no sheet called "${SHEET_NAME}".`, {
      stage: 'read',
      code: 'no-sheet',
      hint: `Rename the sheet back to "${SHEET_NAME}", or restore an earlier version of the file from S3.`,
    });
  }

  // Staff may add columns to the RIGHT of ours, but ours must stay put: the sync writes by position.
  const wrong = columns.find((header, i) => plain(sheet.getRow(1).getCell(i + 1).value).trim() !== header);
  if (wrong) {
    throw new WorkbookError(`The sheet's header row has been changed (expected "${wrong}" in its usual place).`, {
      stage: 'read',
      code: 'bad-headers',
      hint: 'Put the first columns back in their original order with their original names, or restore an earlier version of the file from S3 (docs/EXCEL_SYNC.md).',
    });
  }
  return new OrdersSheet(sheet);
}

async function openWorkbook(current, columns) {
  const ExcelJS = require('exceljs'); // loaded here, not at the top: it is large and only the sync needs it
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FreshBliss';
  if (current) {
    try {
      await workbook.xlsx.load(current.body);
    } catch (err) {
      throw new WorkbookError(`The file in S3 could not be opened as an Excel workbook: ${String(err?.message || err).slice(0, 200)}`, {
        stage: 'read',
        code: 'bad-workbook',
        hint: 'Restore an earlier version of the file from S3 (versioning keeps them), or delete the file so a fresh one is created.',
      });
    }
  }
  return { workbook, sheet: openSheet(workbook, columns) };
}

// ---------- the one function that changes the workbook ----------

// Downloads the file (or starts a new one), lets `mutate` change the sheet, and saves
// it if (and only if) something changed. If someone else saved in between, starts over.
//
//   columns  the header row (EXCEL_COLUMNS)
//   mutate   (sheet: OrdersSheet) => { changed: boolean, ...anything to hand back }
//            It may run more than once (after a conflict or a retry), so it must look at
//            the sheet each time rather than remember what it saw.
//   deps     { store, sleep, random } so tests can replace S3, waiting and chance
//
// Retry rules:
//   - someone else saved first (412 / 409)       start over after a short random pause, up to 30 times
//   - busy, slow, unreachable (503, 5xx, timeout) wait 1s, 2s, 4s (or what AWS asks), up to 4 tries
//   - wrong key, no permission, no bucket, bad file   give up at once; a hint says how to fix it
//
// Returns { attempts, ...whatever mutate returned }. Throws a WorkbookError.
async function updateWorkbook(cfg, { columns, mutate }, deps = {}) {
  const store = deps.store || s3Store(cfg);
  const sleep = deps.sleep || wait;
  const random = deps.random || Math.random;

  let failures = 0;
  let conflicts = 0;
  for (let attempt = 1; ; attempt++) {
    let stage = 'read';
    try {
      const current = await store.get();
      const { workbook, sheet } = await openWorkbook(current, columns);

      const outcome = mutate(sheet);
      if (!outcome.changed) return { attempts: attempt, ...outcome };

      stage = 'write';
      const body = Buffer.from(await workbook.xlsx.writeBuffer());
      await store.put(body, current ? { ifMatch: current.etag } : { ifNoneMatch: '*' });
      return { attempts: attempt, ...outcome };
    } catch (e) {
      const err = classify(e, stage);

      if (err.conflict) {
        if (++conflicts > MAX_CONFLICTS) {
          err.retryable = false;
          err.hint = 'Too many changes were being saved at the same moment. It will work on the next try.';
          throw err;
        }
        await sleep(Math.round(random() * 150 * Math.min(conflicts, 8))); // a little random, so writers do not collide again and again
        continue;
      }

      if (!err.retryable || ++failures >= MAX_ATTEMPTS) throw err;
      await sleep(err.retryAfterMs ?? Math.min(BASE_DELAY_MS * 2 ** (failures - 1), MAX_DELAY_MS));
    }
  }
}

module.exports = { WorkbookError, OrdersSheet, SHEET_NAME, MAX_ATTEMPTS, MAX_CONFLICTS, DOWNLOAD_LINK_SECONDS, makeClient, s3Store, createDownloadLink, downloadFilename, classify, updateWorkbook };
