'use strict';

// Tests for the S3 workbook layer. Run: npm run test:workbook   (no emulator, no network, no AWS account)
//
// S3 is replaced by an in-memory file (tests/helpers/fakeStore.js) that gives every save a
// new ETag and refuses a conditional save that is out of date, like the real thing.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { s3Store, updateWorkbook, classify, WorkbookError, MAX_CONFLICTS } = require('../functions/shared/s3Workbook');
const { EXCEL_COLUMNS, orderToRow, appendRow } = require('../functions/excelSync');
const { fakeStore, fakeSleep, awsError } = require('./helpers/fakeStore');

const CFG = { bucket: 'b', key: 'orders/orders.xlsx', region: 'ap-south-1', accessKeyId: 'AKIAXXXX', secretAccessKey: 'SECRET-xyz', endpoint: '' };

const order = (over = {}) => ({
  uid: 'alice',
  status: 'PAYMENT_CONFIRMED',
  paymentStatus: 'PAID',
  address: '12 MG Road',
  pincode: '560100',
  zone: { name: 'Zone B' },
  items: [{ name: 'Classic Fresh Mix', size: 'large', qty: 1 }],
  pricing: { subtotal: 199, discount: 0, deliveryFee: 30, tip: 0, total: 229 },
  payment: { razorpayPaymentId: 'pay_1' },
  note: '',
  ...over,
});
const add = (store, id, over, extra = {}) => appendRow(CFG, id, orderToRow(id, order(over)), { store, sleep: async () => {}, ...extra });
const timeout = () => Object.assign(new Error('timed out'), { name: 'TimeoutError' });

// ============================================================
describe('a new workbook', () => {
  it('is created, with the headers, when the file does not exist yet', async () => {
    const store = fakeStore();
    assert.equal(store.exists(), false);
    const r = await add(store, 'o1');
    assert.equal(r.alreadyThere, false);
    assert.deepEqual(await store.header(), EXCEL_COLUMNS);
    assert.equal((await store.rows()).length, 1);
  });

  it('has a frozen, filterable header row and money formatting', async () => {
    const store = fakeStore();
    await add(store, 'o1');
    const sheet = await store.worksheet();
    assert.equal(sheet.views[0].state, 'frozen');
    assert.ok(sheet.autoFilter, 'filter buttons on the header row');
    assert.equal(sheet.getColumn(13).numFmt, '#,##0.00'); // Total (INR)
    assert.equal(sheet.getRow(1).font.bold, true);
  });

  it('keeps money as numbers, so Excel can add it up', async () => {
    const store = fakeStore();
    await add(store, 'o1');
    const sheet = await store.worksheet();
    assert.equal(sheet.getRow(2).getCell(13).value, 229);
    assert.equal(typeof sheet.getRow(2).getCell(13).value, 'number');
  });

  it('keeps customer text as text, never as a formula', async () => {
    const store = fakeStore();
    await add(store, 'o1', { address: '=HYPERLINK("http://evil","click")', note: '@SUM(A1)' });
    const sheet = await store.worksheet();
    for (const col of [5, 15]) {
      const v = sheet.getRow(2).getCell(col).value;
      assert.equal(typeof v, 'string', 'a plain string, not a { formula } object');
      assert.ok(v.startsWith("'"), 'and neutralised with the safety apostrophe');
    }
  });
});

// ============================================================
describe('adding a row', () => {
  it('adds the row once: a second try for the same order changes nothing and does not save', async () => {
    const store = fakeStore();
    await add(store, 'o1');
    const puts = store.puts;
    const again = await add(store, 'o1');
    assert.equal(again.alreadyThere, true);
    assert.equal(store.puts, puts, 'no upload');
    assert.equal((await store.rows()).length, 1);
  });

  it('adds different orders as separate rows, in order', async () => {
    const store = fakeStore();
    for (const id of ['a', 'b', 'c']) await add(store, id);
    assert.deepEqual((await store.rows()).map((r) => r[0]), ['a', 'b', 'c']);
  });

  it('finds an order whose id was written with the safety apostrophe', async () => {
    const store = fakeStore();
    await add(store, 'o1');
    await store.staff((sheet) => (sheet.getRow(2).getCell(1).value = "'o1"));
    assert.equal((await add(store, 'o1')).alreadyThere, true);
  });

  it('leaves staff additions alone: extra columns, other sheets, formatting', async () => {
    const store = fakeStore();
    await add(store, 'o1');
    await store.staff((sheet, wb) => {
      sheet.getRow(1).getCell(19).value = 'My notes';
      sheet.getRow(2).getCell(19).value = 'call back';
      wb.addWorksheet('Summary').getRow(1).getCell(1).value = 'totals here';
    });
    await add(store, 'o2');
    const rows = await store.rows();
    assert.equal(rows[0][18], 'call back');
    assert.equal((await store.worksheet()).getRow(1).getCell(19).value, 'My notes');
    const wb = await store.workbook();
    assert.equal(wb.getWorksheet('Summary').getRow(1).getCell(1).value, 'totals here');
  });
});

// ============================================================
describe('two writers at once', () => {
  it('does not lose a row when someone else saves between our read and our save', async () => {
    const store = fakeStore();
    await add(store, 'first');
    // Just before we save "mine", another writer adds "theirs".
    store.once('put', () => add(store, 'theirs'));
    const r = await add(store, 'mine');
    assert.equal(r.attempts, 2, 'started over once');
    assert.deepEqual((await store.rows()).map((x) => x[0]).sort(), ['first', 'mine', 'theirs']);
  });

  it('creates the file once when two writers both find it missing', async () => {
    const store = fakeStore();
    store.once('put', () => add(store, 'theirs')); // they create the file first
    await add(store, 'mine');
    assert.deepEqual((await store.rows()).map((x) => x[0]).sort(), ['mine', 'theirs']);
  });

  it('keeps every row when many orders arrive at the same moment', async () => {
    const store = fakeStore();
    const ids = Array.from({ length: 25 }, (_, i) => `o${i}`);
    await Promise.all(ids.map((id) => add(store, id, {}, { random: () => 0.5 })));
    assert.deepEqual((await store.rows()).map((x) => x[0]).sort(), [...ids].sort());
  });

  it('gives up with a clear message if the file keeps changing under it', async () => {
    const store = fakeStore();
    await add(store, 'seed');
    // Every time we try to save, someone else has just saved. (staff() edits the file directly, so it does not use up the queue.)
    for (let i = 0; i <= MAX_CONFLICTS; i++) store.once('put', () => store.staff((sheet) => sheet.addRow([`other-${i}`])));
    await assert.rejects(add(store, 'mine'), (err) => {
      assert.ok(err instanceof WorkbookError);
      assert.equal(err.code, 'conflict');
      assert.equal(err.retryable, false);
      assert.match(err.hint, /same moment/);
      return true;
    });
  });
});

// ============================================================
describe('AWS being busy or unreliable', () => {
  it('backs off 1s, 2s, 4s while AWS says SlowDown, then gives up after 4 tries', async () => {
    const store = fakeStore();
    store.failNext('get', () => awsError('SlowDown', 503), 10);
    const s = fakeSleep();
    await assert.rejects(add(store, 'o1', {}, { sleep: s.sleep }), (err) => {
      assert.equal(err.code, 'SlowDown');
      assert.equal(err.retryable, true);
      return true;
    });
    assert.deepEqual(s.waits, [1000, 2000, 4000]);
    assert.equal(store.gets, 4);
  });

  it('recovers when AWS comes back part-way through', async () => {
    const store = fakeStore();
    store.failNext('get', () => awsError('ServiceUnavailable', 503), 2);
    const s = fakeSleep();
    const r = await add(store, 'o1', {}, { sleep: s.sleep });
    assert.equal(r.attempts, 3);
    assert.deepEqual(s.waits, [1000, 2000]);
    assert.equal((await store.rows()).length, 1);
  });

  it('waits as long as AWS asks (Retry-After) and never more than 15 seconds', async () => {
    const store = fakeStore();
    store.failNext('get', () => awsError('SlowDown', 503, { $response: { headers: { 'retry-after': '3' } } }));
    store.failNext('get', () => awsError('SlowDown', 503, { $response: { headers: { 'retry-after': '600' } } }));
    const s = fakeSleep();
    await add(store, 'o1', {}, { sleep: s.sleep });
    assert.deepEqual(s.waits, [3000, 15000]);
  });

  it('retries a server error, a timeout and a dropped connection', async () => {
    for (const make of [() => awsError('InternalError', 500), timeout, () => Object.assign(new Error('reset'), { code: 'ECONNRESET' }), () => Object.assign(new Error('x'), { cause: { code: 'ECONNREFUSED' } })]) {
      const store = fakeStore();
      store.failNext('get', make);
      const r = await add(store, 'o1');
      assert.equal(r.attempts, 2);
      assert.equal((await store.rows()).length, 1);
    }
  });

  it('does NOT add the order twice when the save worked but the reply was lost', async () => {
    const store = fakeStore();
    const realPut = store.put;
    let lost = true;
    store.put = async (...args) => {
      await realPut(...args); // the file really was saved...
      if (lost) {
        lost = false;
        throw timeout(); // ...but we never heard back
      }
    };
    const r = await add(store, 'o1');
    assert.equal(r.alreadyThere, true, 'the retry saw the row that was already saved');
    assert.equal((await store.rows()).length, 1);
  });
});

// ============================================================
describe('mistakes retrying cannot fix', () => {
  const cases = [
    ['AccessDenied', 403, /s3:ListBucket/],
    ['NoSuchBucket', 404, /EXCEL_S3_BUCKET/],
    ['InvalidAccessKeyId', 403, /EXCEL_AWS_ACCESS_KEY_ID/],
    ['SignatureDoesNotMatch', 403, /EXCEL_AWS_SECRET_ACCESS_KEY/],
    ['PermanentRedirect', 301, /region/],
  ];
  for (const [name, status, hint] of cases) {
    it(`${name}: not retried, and the hint says how to fix it`, async () => {
      const store = fakeStore();
      store.failNext('get', () => awsError(name, status), 5);
      await assert.rejects(add(store, 'o1'), (err) => {
        assert.equal(err.code, name);
        assert.equal(err.retryable, false);
        assert.match(err.hint, hint);
        assert.ok(!JSON.stringify({ message: err.message, hint: err.hint }).includes('SECRET-xyz'));
        return true;
      });
      assert.equal(store.gets, 1, 'tried once');
    });
  }

  it('refuses a file that is not a workbook, and says how to recover', async () => {
    const store = fakeStore();
    store.replaceFile('this is not an excel file');
    await assert.rejects(add(store, 'o1'), (err) => {
      assert.equal(err.code, 'bad-workbook');
      assert.equal(err.retryable, false);
      assert.match(err.hint, /versioning|earlier version/);
      return true;
    });
    assert.equal(store.puts, 0, 'the bad file is not overwritten');
  });

  it('refuses a workbook whose header row was changed, without touching it', async () => {
    const store = fakeStore();
    await add(store, 'o1');
    await store.staff((sheet) => (sheet.getRow(1).getCell(3).value = 'Buyer'));
    const puts = store.puts;
    await assert.rejects(add(store, 'o2'), (err) => {
      assert.equal(err.code, 'bad-headers');
      assert.match(err.message, /Customer/);
      return true;
    });
    assert.equal(store.puts, puts);
  });

  it('refuses a workbook whose Orders sheet was renamed', async () => {
    const store = fakeStore();
    await add(store, 'o1');
    await store.workbook((wb) => (wb.getWorksheet('Orders').name = 'Sales'));
    const puts = store.puts;
    await assert.rejects(add(store, 'o2'), (err) => {
      assert.equal(err.code, 'no-sheet');
      assert.match(err.hint, /Rename the sheet back/);
      return true;
    });
    assert.equal(store.puts, puts);
  });
});

// ============================================================
describe('updateWorkbook on its own', () => {
  it('does not save when nothing changed', async () => {
    const store = fakeStore();
    await add(store, 'o1');
    const puts = store.puts;
    const r = await updateWorkbook(CFG, { columns: EXCEL_COLUMNS, mutate: () => ({ changed: false, note: 'nothing' }) }, { store });
    assert.equal(r.note, 'nothing');
    assert.equal(store.puts, puts);
  });

  it('hands back what mutate returned, plus how many tries it took', async () => {
    const store = fakeStore();
    const r = await updateWorkbook(CFG, { columns: EXCEL_COLUMNS, mutate: (sheet) => (sheet.append(orderToRow('x', order())), { changed: true, hello: 1 }) }, { store });
    assert.deepEqual([r.hello, r.attempts], [1, 1]);
  });
});

// ============================================================
describe('classify: sorting AWS errors', () => {
  it('knows conflicts, busy and fatal', () => {
    assert.equal(classify(awsError('PreconditionFailed', 412), 'write').conflict, true);
    assert.equal(classify(awsError('ConditionalRequestConflict', 409), 'write').conflict, true);
    assert.equal(classify(awsError('SlowDown', 503), 'read').retryable, true);
    assert.equal(classify(awsError('AccessDenied', 403), 'read').retryable, false);
    assert.equal(classify(new TypeError('bug'), 'read').retryable, false);
  });
  it('records which stage failed', () => {
    assert.equal(classify(awsError('SlowDown', 503), 'write').stage, 'write');
  });
});

// ============================================================
describe('s3Store: the real S3 calls (with a fake client)', () => {
  const fakeClient = (handler) => {
    const sent = [];
    return { sent, send: async (command) => (sent.push({ name: command.constructor.name, input: command.input }), handler(command)) };
  };

  it('reads the file and its version', async () => {
    const client = fakeClient(() => ({ ETag: '"abc"', Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) } }));
    const got = await s3Store(CFG, { client }).get();
    assert.deepEqual([...got.body], [1, 2, 3]);
    assert.equal(got.etag, '"abc"');
    assert.deepEqual(client.sent[0].input, { Bucket: 'b', Key: 'orders/orders.xlsx' });
  });

  it('says "no file yet" only for a missing file, not for a missing bucket', async () => {
    assert.equal(await s3Store(CFG, { client: fakeClient(() => Promise.reject(awsError('NoSuchKey', 404))) }).get(), null);
    await assert.rejects(s3Store(CFG, { client: fakeClient(() => Promise.reject(awsError('NoSuchBucket', 404))) }).get(), { name: 'NoSuchBucket' });
  });

  it('saves only if the file is still the version we read (If-Match)', async () => {
    const client = fakeClient(() => ({}));
    await s3Store(CFG, { client }).put(Buffer.from('x'), { ifMatch: '"abc"' });
    const { input, name } = client.sent[0];
    assert.equal(name, 'PutObjectCommand');
    assert.equal(input.IfMatch, '"abc"');
    assert.equal(input.IfNoneMatch, undefined);
    assert.equal(input.Bucket, 'b');
    assert.equal(input.Key, 'orders/orders.xlsx');
    assert.match(input.ContentType, /spreadsheetml/);
  });

  it('creates the file only if it does not exist yet (If-None-Match)', async () => {
    const client = fakeClient(() => ({}));
    await s3Store(CFG, { client }).put(Buffer.from('x'), { ifNoneMatch: '*' });
    assert.equal(client.sent[0].input.IfNoneMatch, '*');
    assert.equal(client.sent[0].input.IfMatch, undefined);
  });
});
