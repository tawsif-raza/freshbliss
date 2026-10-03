'use strict';

// The composite indexes the app's queries need, pinned so nobody removes one by accident.
//
// The My orders page (web/lib/orders.js) asks Firestore for
//     orders where uid == <me> ordered by createdAt, newest first
// Firestore refuses that query unless this index is deployed (`npm run deploy:rules` ships it). The emulator does
// not enforce indexes, so without this test a missing one would only show up in production.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'firestore.indexes.json'), 'utf8'));
const firebaseJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'firebase.json'), 'utf8'));

describe('firestore indexes', () => {
  it('is the file firebase.json deploys', () => {
    assert.equal(firebaseJson.firestore.indexes, 'firestore.indexes.json');
  });

  it('has the orders index for uid (ascending) then createdAt (descending)', () => {
    const found = config.indexes.find(
      (ix) =>
        ix.collectionGroup === 'orders' &&
        ix.queryScope === 'COLLECTION' &&
        ix.fields.length === 2 &&
        ix.fields[0].fieldPath === 'uid' &&
        ix.fields[0].order === 'ASCENDING' &&
        ix.fields[1].fieldPath === 'createdAt' &&
        ix.fields[1].order === 'DESCENDING',
    );
    assert.ok(found, 'missing the orders uid + createdAt index that the My orders page needs');
  });

  it('has no duplicate indexes', () => {
    const keys = config.indexes.map((ix) => `${ix.collectionGroup}:${ix.queryScope}:${ix.fields.map((f) => `${f.fieldPath}/${f.order}`).join(',')}`);
    assert.equal(new Set(keys).size, keys.length);
  });

  it('matches the query the web app really runs', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'lib', 'orders.js'), 'utf8');
    assert.match(source, /where\('uid', '==', user\.uid\), orderBy\('createdAt', 'desc'\)/);
  });
});
