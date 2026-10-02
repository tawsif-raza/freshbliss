'use strict';

// Tests for the "Download orders sheet" link. Run: npm run test:workbook   (no emulator, no network, no AWS account)
//
// S3 is replaced by a fake client that answers the one-byte "is the file there?" check. Signing the
// link happens on this machine, so the REAL signer runs here, with made-up credentials.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const fromFunctions = createRequire(path.join(__dirname, '..', 'functions', 'package.json'));
const { makeClient, createDownloadLink, downloadFilename, DOWNLOAD_LINK_SECONDS } = require('../functions/shared/s3Workbook');
const { issueDownloadLink } = require('../functions/getOrdersDownloadUrl');
const { awsError } = require('./helpers/fakeStore');

const SECRET = 'SUPER-SECRET-VALUE-9f3a';
const CFG = { bucket: 'freshbliss-orders', key: 'orders/orders.xlsx', region: 'ap-south-1', accessKeyId: 'AKIAEXAMPLE', secretAccessKey: SECRET, endpoint: '' };
const NOW = new Date('2026-10-01T20:00:00Z'); // already 2 Oct, 01:30 in India

const staff = { auth: { uid: 'staff-1', token: { staff: true } } };

// A real S3 client (so the link is really signed) whose network calls are answered by `answer`.
function clientThat(answer = () => ({ Body: { transformToByteArray: async () => new Uint8Array([80]) } })) {
  const client = makeClient(CFG);
  client.sent = [];
  client.send = async (command) => {
    client.sent.push(command.input);
    return answer(command);
  };
  return client;
}
const deps = (client, extra = {}) => ({ config: CFG, client, now: () => NOW, ...extra });
const link = async (extra) => issueDownloadLink(staff, deps(clientThat(), extra));

// ============================================================
describe('who may ask for the link', () => {
  it('refuses someone who is not signed in, without calling AWS', async () => {
    const client = clientThat();
    await assert.rejects(issueDownloadLink({}, deps(client)), { code: 'unauthenticated' });
    assert.equal(client.sent.length, 0);
  });

  it('refuses a signed-in customer (no staff claim), without calling AWS', async () => {
    const client = clientThat();
    await assert.rejects(issueDownloadLink({ auth: { uid: 'customer-1', token: {} } }, deps(client)), { code: 'permission-denied' });
    assert.equal(client.sent.length, 0);
  });

  it('wants the claim to be exactly true, not just something truthy', async () => {
    for (const staffClaim of ['true', 1, 'yes', {}]) {
      await assert.rejects(issueDownloadLink({ auth: { uid: 'x', token: { staff: staffClaim } } }, deps(clientThat())), { code: 'permission-denied' });
    }
  });

  it('gives staff a link', async () => {
    const r = await link();
    assert.match(r.url, /^https:\/\//);
  });
});

// ============================================================
describe('the link', () => {
  it('points at the one workbook, in the right bucket, and nothing else', async () => {
    const { url } = await link();
    const u = new URL(url);
    assert.equal(u.hostname, 'freshbliss-orders.s3.ap-south-1.amazonaws.com');
    assert.equal(u.pathname, '/orders/orders.xlsx');
  });

  it('works for 15 minutes, and says when it stops', async () => {
    const r = await link();
    assert.equal(new URL(r.url).searchParams.get('X-Amz-Expires'), '900');
    assert.equal(r.expiresInSeconds, 900);
    assert.equal(DOWNLOAD_LINK_SECONDS, 900);
    assert.equal(r.expiresAt, '2026-10-01T20:15:00.000Z');
  });

  it('makes the browser SAVE the file, with a dated name, instead of showing it', async () => {
    const r = await link();
    const params = new URL(r.url).searchParams;
    assert.equal(params.get('response-content-disposition'), 'attachment; filename="freshbliss-orders-2026-10-02.xlsx"');
    assert.match(params.get('response-content-type'), /spreadsheetml/);
    assert.equal(r.filename, 'freshbliss-orders-2026-10-02.xlsx');
  });

  it('is for reading only (a GET link signed for the GetObject action)', async () => {
    const { url } = await link();
    const params = new URL(url).searchParams;
    assert.equal(params.get('X-Amz-Algorithm'), 'AWS4-HMAC-SHA256');
    assert.ok(params.get('X-Amz-Signature'), 'signed');
    assert.ok(params.get('X-Amz-SignedHeaders'), 'says what was signed');
    assert.equal(params.get('x-id'), 'GetObject');
  });

  it('never contains the secret, and does not hand it back in the reply either', async () => {
    const r = await link();
    assert.ok(!JSON.stringify(r).includes(SECRET));
    assert.ok(decodeURIComponent(r.url).includes('AKIAEXAMPLE'), 'the key ID is part of any signed link');
  });

  it('uses the signing time it was given (so the 15 minutes start now)', async () => {
    const { url } = await link();
    assert.equal(new URL(url).searchParams.get('X-Amz-Date'), '20261001T200000Z');
  });
});

// ============================================================
describe('checking the file is there first', () => {
  it('asks for a single byte, of the right file, rather than downloading it', async () => {
    const client = clientThat();
    await issueDownloadLink(staff, deps(client));
    assert.equal(client.sent.length, 1);
    assert.deepEqual(client.sent[0], { Bucket: 'freshbliss-orders', Key: 'orders/orders.xlsx', Range: 'bytes=0-0' });
  });

  it('says so, in plain words, when there is no sheet yet', async () => {
    const client = clientThat(() => Promise.reject(awsError('NoSuchKey', 404)));
    await assert.rejects(issueDownloadLink(staff, deps(client)), (err) => {
      assert.equal(err.code, 'not-found');
      assert.match(err.message, /no orders sheet yet/);
      return true;
    });
  });

  it('does not mistake a missing BUCKET for a missing file', async () => {
    const client = clientThat(() => Promise.reject(awsError('NoSuchBucket', 404)));
    await assert.rejects(issueDownloadLink(staff, deps(client)), { code: 'failed-precondition' });
  });
});

// ============================================================
describe('when AWS says no, or is busy', () => {
  it('tells staff to ask for help, and keeps AWS details out of the message', async () => {
    const client = clientThat(() => Promise.reject(awsError('AccessDenied', 403)));
    await assert.rejects(issueDownloadLink(staff, deps(client)), (err) => {
      assert.equal(err.code, 'failed-precondition');
      assert.match(err.message, /could not be opened/);
      assert.ok(!/AccessDenied|s3:|bucket|policy/i.test(err.message), 'no AWS internals shown to staff');
      return true;
    });
  });

  it('says "try again" when AWS is only busy', async () => {
    for (const make of [() => awsError('SlowDown', 503), () => Object.assign(new Error('reset'), { code: 'ECONNRESET' })]) {
      await assert.rejects(issueDownloadLink(staff, deps(clientThat(() => Promise.reject(make())))), (err) => {
        assert.equal(err.code, 'unavailable');
        assert.match(err.message, /try again/);
        return true;
      });
    }
  });

  it('says what is missing when AWS is not set up, without calling AWS', async () => {
    const client = clientThat();
    await assert.rejects(issueDownloadLink(staff, deps(client, { config: { ...CFG, bucket: '', secretAccessKey: '' } })), (err) => {
      assert.equal(err.code, 'failed-precondition');
      assert.match(err.message, /not set up/);
      return true;
    });
    assert.equal(client.sent.length, 0);
  });

  it('a signing failure is reported, not thrown raw', async () => {
    await assert.rejects(createDownloadLink(CFG, {}, { client: clientThat(), now: () => NOW, presign: async () => { throw new Error('boom'); } }), { name: 'WorkbookError' });
  });
});

// ============================================================
describe('the file name', () => {
  it('uses the date in India, not UTC', () => {
    assert.equal(downloadFilename(new Date('2026-10-01T20:00:00Z')), 'freshbliss-orders-2026-10-02.xlsx');
    assert.equal(downloadFilename(new Date('2026-10-01T10:00:00Z')), 'freshbliss-orders-2026-10-01.xlsx');
  });
});

// The function really is registered as a staff-only callable in the right region.
describe('the registered function', () => {
  it('is exported from index.js', () => {
    process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-freshbliss';
    const index = fromFunctions('./index.js');
    assert.equal(typeof index.getOrdersDownloadUrl, 'function');
  });
});
