'use strict';

// Every Cloud Function must deploy to Mumbai (asia-south1): close to the shoppers in Bengaluru, and in
// the same region as the Firestore database (Firestore triggers must match the database's location).
// Run: npm run test:unit   (no emulator, no network)

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const fromFunctions = createRequire(path.join(__dirname, '..', 'functions', 'package.json'));

const REGION = 'asia-south1';
const EXPECTED = [
  'createCheckout',
  'previewCheckout',
  'verifyPayment',
  'razorpayWebhook',
  'updateOrderStatus',
  'cancelOrder',
  'processRefund',
  'excelSync',
  'excelSyncUpdate',
  'retryExcelSync',
  'getOrdersDownloadUrl',
];

// `devGrantStaff` is only exported inside the emulator, so load the index as the emulator would too.
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-freshbliss';
process.env.FUNCTIONS_EMULATOR = 'true';
const index = fromFunctions('./index.js');
const exported = Object.entries(index);

describe('functions are deployed to asia-south1', () => {
  it('exports exactly the functions we expect (plus the emulator-only helper)', () => {
    assert.deepEqual(Object.keys(index).sort(), [...EXPECTED, 'devGrantStaff', 'createMockOrder'].sort());
  });

  for (const [name, fn] of exported) {
    it(`${name} is in ${REGION}, and only there`, () => {
      assert.deepEqual(fn.__endpoint.region, [REGION]);
    });
  }

  it('a function added later without naming a region still lands in asia-south1 (the global default)', () => {
    const { onCall } = fromFunctions('firebase-functions/v2/https');
    const { onDocumentCreated } = fromFunctions('firebase-functions/v2/firestore');
    assert.deepEqual(onCall(() => 1).__endpoint.region, [REGION]);
    assert.deepEqual(onDocumentCreated('orders/{id}', () => 1).__endpoint.region, [REGION]);
  });

  it('the storefront calls the same region', () => {
    const fs = require('node:fs');
    const client = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'lib', 'firebaseClient.js'), 'utf8');
    assert.match(client, new RegExp(`FUNCTIONS_REGION = '${REGION}'`));
  });
});
