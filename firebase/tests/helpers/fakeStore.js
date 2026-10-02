'use strict';

// A stand-in for the one S3 file the Excel sync uses, for tests. It behaves like S3
// where it matters: every save gets a new ETag, and a save that says "only if the file
// is still version X" (If-Match) or "only if it does not exist" (If-None-Match) is
// refused with a 412 when that is not true.
//
// Tests can also:
//   store.once('get' | 'put', fn)   run fn just before the next get/put. It may throw
//                                    (to simulate a failure) or change the file (to
//                                    simulate someone else saving at the same moment).
//   store.staff(edit)                edit the workbook the way a person in Excel would
//   store.rows()                     read the sheet back as arrays of cell text

const path = require('node:path');
const { createRequire } = require('node:module');

// Use the SAME exceljs copy the functions use.
const ExcelJS = createRequire(path.join(__dirname, '..', '..', 'functions', 'package.json'))('exceljs');

// An error shaped like the ones the AWS SDK throws.
function awsError(name, status, extra = {}) {
  return Object.assign(new Error(`${name} (simulated)`), { name, $metadata: { httpStatusCode: status }, ...extra });
}

const plain = (v) => (v === null || v === undefined ? '' : typeof v === 'object' && v.richText ? v.richText.map((p) => p.text).join('') : v);

function fakeStore() {
  let body = null;
  let version = 0;
  const queue = { get: [], put: [] };
  const store = { calls: [], puts: 0, gets: 0 };

  const etag = () => `"v${version}"`;
  const next = async (kind) => {
    store.calls.push(kind);
    const hook = queue[kind].shift();
    if (hook) await hook();
  };

  store.once = (kind, fn) => {
    queue[kind].push(fn);
    return store;
  };
  // Make the next `times` calls of `kind` fail with `error`.
  store.failNext = (kind, error, times = 1) => {
    for (let i = 0; i < times; i++) queue[kind].push(() => Promise.reject(typeof error === 'function' ? error() : error));
    return store;
  };

  store.get = async () => {
    store.gets += 1;
    await next('get');
    return body ? { body: Buffer.from(body), etag: etag() } : null;
  };

  store.put = async (data, { ifMatch, ifNoneMatch } = {}) => {
    await next('put');
    if (ifNoneMatch === '*' && body) throw awsError('PreconditionFailed', 412);
    if (ifMatch && ifMatch !== etag()) throw awsError('PreconditionFailed', 412);
    body = Buffer.from(data);
    version += 1;
    store.puts += 1;
  };

  store.exists = () => body !== null;
  store.version = () => version;
  store.replaceFile = (data) => {
    body = data === null ? null : Buffer.from(data);
    version += 1;
  };

  async function open() {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(body);
    return wb;
  }
  // Edit the workbook like a person in Excel: load it, change it, save it (a new version).
  store.staff = async (edit) => {
    const wb = await open();
    await edit(wb.getWorksheet('Orders'), wb);
    body = Buffer.from(await wb.xlsx.writeBuffer());
    version += 1;
  };
  // Same, but for the whole workbook (add or rename sheets).
  store.workbook = async (edit) => {
    const wb = await open();
    if (edit) {
      await edit(wb);
      body = Buffer.from(await wb.xlsx.writeBuffer());
      version += 1;
    }
    return wb;
  };
  // The data rows as arrays of cell values (not the header).
  store.rows = async () => {
    const sheet = (await open()).getWorksheet('Orders');
    const out = [];
    sheet.eachRow((row, n) => {
      if (n > 1) out.push(Array.from({ length: row.cellCount }, (_, i) => plain(row.getCell(i + 1).value)));
    });
    return out;
  };
  store.header = async () => {
    const sheet = (await open()).getWorksheet('Orders');
    return Array.from({ length: sheet.getRow(1).cellCount }, (_, i) => plain(sheet.getRow(1).getCell(i + 1).value));
  };
  store.rowOf = async (orderId) => (await store.rows()).find((r) => r[0] === orderId);
  store.worksheet = async () => (await open()).getWorksheet('Orders');
  return store;
}

// A sleep that does not wait, and remembers how long it was asked to.
function fakeSleep() {
  const waits = [];
  return { sleep: async (ms) => waits.push(ms), waits };
}

module.exports = { fakeStore, fakeSleep, awsError };
