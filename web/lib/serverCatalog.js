// The product catalogue as the SERVER sees it, so a page can be built (and search engines and share cards can read it)
// before any JavaScript runs in the browser. Used only from getStaticProps / getServerSideProps; never imported by
// a component. The browser keeps using the live listener in lib/catalog.js, which takes over from this snapshot.
//
// How: Firestore's public REST endpoint, with no credentials. The security rules already let ANYONE read products
// where `active == true` (firestore.rules), and this asks for exactly that, so no service account or secret is
// needed on Vercel. (That is also why App Check must NOT be enforced on Firestore itself: this server read has no
// App Check token. It is enforced on the Cloud Functions, which is where abuse costs money. docs/GO_LIVE.md, 5.5.)
//
// Nothing here may break a build or a page: every failure is reported as { status: 'error' } / null and the caller
// falls back to the client-rendered page it had before.

import { normaliseProduct } from './product.js';

const SAFE_ID = /^[A-Za-z0-9_-]{1,100}$/;
const TIMEOUT_MS = 6000;

// ---------- Firestore REST -> plain values ----------

// {"stringValue":"x"}, {"integerValue":"5"}, {"mapValue":{"fields":{...}}} ... -> "x", 5, {...}
export function fromFirestoreValue(v) {
  if (v === null || typeof v !== 'object') return undefined;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(fromFirestoreValue);
  if ('mapValue' in v) return fieldsToData(v.mapValue.fields);
  return undefined; // references, geo points and bytes are not product data
}

export function fieldsToData(fields = {}) {
  const data = {};
  for (const [key, value] of Object.entries(fields)) {
    const plain = fromFirestoreValue(value);
    if (plain !== undefined) data[key] = plain;
  }
  return data;
}

// A REST document -> the same clean product the live listener builds, or null if it cannot be priced or is switched off.
// JSON round trip: Next refuses to send `undefined` from getStaticProps.
export function productFromDocument(doc) {
  const id = String(doc?.name ?? '').split('/').pop();
  if (!SAFE_ID.test(id)) return null;
  const data = fieldsToData(doc.fields);
  if (data.active !== true) return null;
  const product = normaliseProduct(id, data);
  return product ? JSON.parse(JSON.stringify(product)) : null;
}

// ---------- where to ask ----------

// Mirrors lib/firebaseClient.js: `next dev` talks to the local emulator, production to the real project.
// FIRESTORE_EMULATOR_HOST (the standard variable) also points a production build at an emulator, for testing.
//
// In `next dev` the emulator holds the project "demo-freshbliss" (the id lib/firebaseClient.js hard-codes for the browser), NOT
// the real project id that a developer may have in web/.env.local for production builds. Asking the emulator for that real id
// returned an empty shop on every server-rendered page while developing, so the dev default always uses the demo id. Only an
// explicit FIRESTORE_EMULATOR_HOST (a production build pointed at an emulator) falls back to NEXT_PUBLIC_FIREBASE_PROJECT_ID.
export function restTarget(env = process.env) {
  if (env.FIRESTORE_EMULATOR_HOST) return { origin: `http://${env.FIRESTORE_EMULATOR_HOST}`, projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'demo-freshbliss' };
  if (env.NODE_ENV === 'development' && env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS !== 'false') {
    return { origin: `http://${env.NEXT_PUBLIC_EMULATOR_HOST || '127.0.0.1'}:8080`, projectId: 'demo-freshbliss' };
  }
  const projectId = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  return projectId ? { origin: 'https://firestore.googleapis.com', projectId } : null;
}

export const documentsUrl = (t) => `${t.origin}/v1/projects/${encodeURIComponent(t.projectId)}/databases/(default)/documents`;

export async function request(url, init, fetchImpl) {
  return fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'content-type': 'application/json' } });
}

// ---------- the two reads ----------

// Every active product, or null if Firestore could not be reached.
export async function fetchActiveProducts({ env = process.env, fetchImpl = fetch } = {}) {
  const target = restTarget(env);
  if (!target) return null;
  try {
    const res = await request(
      `${documentsUrl(target)}:runQuery`,
      {
        method: 'POST',
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: 'products' }],
            where: { fieldFilter: { field: { fieldPath: 'active' }, op: 'EQUAL', value: { booleanValue: true } } },
          },
        }),
      },
      fetchImpl,
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return rows.map((row) => (row.document ? productFromDocument(row.document) : null)).filter(Boolean);
  } catch {
    return null;
  }
}

// One active product by id. { status: 'found', product } | { status: 'missing' } (no such box, or switched off) |
// { status: 'error' } (could not ask, or the answer was not understood: never treated as "missing").
export async function fetchProduct(id, { env = process.env, fetchImpl = fetch } = {}) {
  if (typeof id !== 'string' || !SAFE_ID.test(id)) return { status: 'missing' };
  const target = restTarget(env);
  if (!target) return { status: 'error' };
  try {
    // A query rather than a plain read of the document: for a product that is switched off the rules answer a plain
    // read with "403 permission denied", which looks exactly like a misconfigured project. This query proves it
    // asks for active products only, so the rules accept it and "no such active box" is an honest empty answer.
    const documentName = `projects/${target.projectId}/databases/(default)/documents/products/${id}`;
    const res = await request(
      `${documentsUrl(target)}:runQuery`,
      {
        method: 'POST',
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: 'products' }],
            where: {
              compositeFilter: {
                op: 'AND',
                filters: [
                  { fieldFilter: { field: { fieldPath: 'active' }, op: 'EQUAL', value: { booleanValue: true } } },
                  { fieldFilter: { field: { fieldPath: '__name__' }, op: 'EQUAL', value: { referenceValue: documentName } } },
                ],
              },
            },
            limit: 1,
          },
        }),
      },
      fetchImpl,
    );
    if (!res.ok) return { status: 'error' };
    const row = (await res.json()).find((r) => r.document);
    const product = row ? productFromDocument(row.document) : null;
    return product ? { status: 'found', product } : { status: 'missing' };
  } catch {
    return { status: 'error' };
  }
}
