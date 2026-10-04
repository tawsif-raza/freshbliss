import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fetchActiveProducts, fetchProduct, fieldsToData, fromFirestoreValue, productFromDocument, restTarget } from '../lib/serverCatalog.js';

// A product document the way Firestore's REST API sends it.
const doc = (id, fields) => ({ name: `projects/p/databases/(default)/documents/products/${id}`, fields, createTime: 'x', updateTime: 'y' });
const MANGO = doc('mango-box', {
  name: { stringValue: 'Mango Season Box' },
  price: { integerValue: '229' },
  stock: { integerValue: '3' },
  active: { booleanValue: true },
  category: { stringValue: 'Seasonal' },
  ingredients: { arrayValue: { values: [{ stringValue: 'Mango' }, { stringValue: 'Lime' }] } },
  sizes: { arrayValue: { values: [{ mapValue: { fields: { id: { stringValue: 'regular' }, label: { stringValue: 'Regular' }, extra: { integerValue: '0' } } } }] } },
  createdAt: { timestampValue: '2026-10-01T10:00:00Z' },
});
const OFF = doc('retired', { name: { stringValue: 'Retired' }, price: { integerValue: '10' }, active: { booleanValue: false } });
const UNPRICED = doc('nopricebox', { name: { stringValue: 'No price' }, active: { booleanValue: true } });

// A fake fetch that records what it was asked and answers with `reply`.
function fakeFetch(reply) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
    if (reply instanceof Error) throw reply;
    return { ok: reply.status >= 200 && reply.status < 300, status: reply.status, json: async () => reply.body };
  };
  fn.calls = calls;
  return fn;
}
const PROD = { NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'freshbliss-prod', NODE_ENV: 'production' };

describe('reading Firestore REST values', () => {
  it('turns every value type into the plain value the storefront uses', () => {
    assert.equal(fromFirestoreValue({ stringValue: 'x' }), 'x');
    assert.equal(fromFirestoreValue({ integerValue: '149' }), 149);
    assert.equal(fromFirestoreValue({ doubleValue: 4.5 }), 4.5);
    assert.equal(fromFirestoreValue({ booleanValue: false }), false);
    assert.equal(fromFirestoreValue({ nullValue: null }), null);
    assert.equal(fromFirestoreValue({ timestampValue: '2026-10-01T10:00:00Z' }), '2026-10-01T10:00:00Z');
    assert.deepEqual(fromFirestoreValue({ arrayValue: {} }), [], 'an empty array has no "values" key');
    assert.deepEqual(fromFirestoreValue({ mapValue: { fields: { a: { integerValue: '1' } } } }), { a: 1 });
    assert.equal(fromFirestoreValue({ referenceValue: 'projects/p/x' }), undefined);
    assert.equal(fromFirestoreValue(null), undefined);
  });

  it('reads a document with no fields as empty', () => {
    assert.deepEqual(fieldsToData(undefined), {});
  });
});

describe('productFromDocument', () => {
  it('builds exactly the product the live listener builds (same normaliser), id taken from the document name', () => {
    const p = productFromDocument(MANGO);
    assert.equal(p.id, 'mango-box');
    assert.equal(p.name, 'Mango Season Box');
    assert.equal(p.price, 229);
    assert.equal(p.stock, 3);
    assert.deepEqual(p.ingredients, ['Mango', 'Lime']);
    assert.deepEqual(p.sizes, [{ id: 'regular', label: 'Regular', extra: 0 }]);
    assert.ok(p.images.length >= 1 && p.placeholderImages === true, 'a box with no photos gets the placeholder photos');
  });

  it('is plain JSON (Next refuses to send `undefined` from getStaticProps)', () => {
    const p = productFromDocument(MANGO);
    assert.deepEqual(JSON.parse(JSON.stringify(p)), p);
  });

  it('refuses a box that is switched off, cannot be priced, or has an unsafe id', () => {
    assert.equal(productFromDocument(OFF), null);
    assert.equal(productFromDocument(UNPRICED), null);
    assert.equal(productFromDocument(doc('a b', { price: { integerValue: '1' }, active: { booleanValue: true } })), null);
    assert.equal(productFromDocument(undefined), null);
  });
});

describe('where the server asks', () => {
  it('production: the real project over HTTPS', () => {
    assert.deepEqual(restTarget(PROD), { origin: 'https://firestore.googleapis.com', projectId: 'freshbliss-prod' });
  });
  it('`next dev` talks to the local emulator like the browser does, unless told not to', () => {
    assert.deepEqual(restTarget({ NODE_ENV: 'development' }), { origin: 'http://127.0.0.1:8080', projectId: 'demo-freshbliss' });
    assert.equal(restTarget({ NODE_ENV: 'development', NEXT_PUBLIC_USE_FIREBASE_EMULATORS: 'false', NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'real' }).origin, 'https://firestore.googleapis.com');
  });
  it('FIRESTORE_EMULATOR_HOST points even a production build at an emulator (for testing)', () => {
    assert.deepEqual(restTarget({ ...PROD, FIRESTORE_EMULATOR_HOST: '127.0.0.1:18080' }), { origin: 'http://127.0.0.1:18080', projectId: 'freshbliss-prod' });
  });
  it('no project configured -> nowhere to ask', () => {
    assert.equal(restTarget({ NODE_ENV: 'production' }), null);
  });
});

describe('fetchActiveProducts', () => {
  it('asks Firestore for active products only, with no credentials, and returns the clean boxes', async () => {
    const f = fakeFetch({ status: 200, body: [{ document: MANGO, readTime: 't' }, { document: UNPRICED }, { readTime: 't' }] });
    const products = await fetchActiveProducts({ env: PROD, fetchImpl: f });
    assert.deepEqual(products.map((p) => p.id), ['mango-box'], 'unpriceable boxes and the empty trailer row are dropped');
    const [call] = f.calls;
    assert.equal(call.url, 'https://firestore.googleapis.com/v1/projects/freshbliss-prod/databases/(default)/documents:runQuery');
    assert.deepEqual(call.body.structuredQuery.where.fieldFilter, { field: { fieldPath: 'active' }, op: 'EQUAL', value: { booleanValue: true } });
    assert.equal(call.init.headers.authorization, undefined);
    assert.ok(call.init.signal, 'it times out instead of hanging a build');
  });

  it('an empty catalogue is an empty list, not an error', async () => {
    assert.deepEqual(await fetchActiveProducts({ env: PROD, fetchImpl: fakeFetch({ status: 200, body: [{ readTime: 't' }] }) }), []);
  });

  it('NEVER throws: a refused or broken answer, a network failure or no project all give null', async () => {
    assert.equal(await fetchActiveProducts({ env: PROD, fetchImpl: fakeFetch({ status: 403, body: {} }) }), null);
    assert.equal(await fetchActiveProducts({ env: PROD, fetchImpl: fakeFetch({ status: 200, body: { not: 'a list' } }) }), null);
    assert.equal(await fetchActiveProducts({ env: PROD, fetchImpl: fakeFetch(new Error('ECONNRESET')) }), null);
    assert.equal(await fetchActiveProducts({ env: {}, fetchImpl: fakeFetch({ status: 200, body: [] }) }), null);
  });
});

describe('fetchProduct', () => {
  it('finds an active box by asking for exactly that one, active only, with a limit of one', async () => {
    const f = fakeFetch({ status: 200, body: [{ document: MANGO }] });
    const r = await fetchProduct('mango-box', { env: PROD, fetchImpl: f });
    assert.equal(r.status, 'found');
    assert.equal(r.product.id, 'mango-box');
    const q = f.calls[0].body.structuredQuery;
    assert.equal(q.limit, 1);
    const filters = q.where.compositeFilter.filters;
    assert.deepEqual(filters[0].fieldFilter.field, { fieldPath: 'active' });
    assert.equal(filters[1].fieldFilter.value.referenceValue, 'projects/freshbliss-prod/databases/(default)/documents/products/mango-box');
  });

  it('"missing" only for a real empty answer, or a box that cannot be sold', async () => {
    assert.deepEqual(await fetchProduct('gone', { env: PROD, fetchImpl: fakeFetch({ status: 200, body: [{ readTime: 't' }] }) }), { status: 'missing' });
    assert.deepEqual(await fetchProduct('unpriceable', { env: PROD, fetchImpl: fakeFetch({ status: 200, body: [{ document: UNPRICED }] }) }), { status: 'missing' });
  });

  it('a failure is an error, NEVER "missing" (or one outage would 404 every product page)', async () => {
    for (const reply of [{ status: 403, body: {} }, { status: 500, body: {} }, { status: 200, body: 'garbage' }, new Error('timeout')]) {
      assert.deepEqual(await fetchProduct('mango-box', { env: PROD, fetchImpl: fakeFetch(reply) }), { status: 'error' });
    }
    assert.deepEqual(await fetchProduct('mango-box', { env: {}, fetchImpl: fakeFetch({ status: 200, body: [] }) }), { status: 'error' });
  });

  it('refuses an id that could escape the query without asking anything', async () => {
    const f = fakeFetch({ status: 200, body: [] });
    for (const id of ['../secret', 'a/b', '', undefined, 'x'.repeat(101)]) assert.deepEqual(await fetchProduct(id, { env: PROD, fetchImpl: f }), { status: 'missing' });
    assert.equal(f.calls.length, 0);
  });
});
