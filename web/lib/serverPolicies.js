// The website policies as the SERVER sees them (getStaticProps only), read from Firestore's public REST endpoint the
// same way as the catalogue (lib/serverCatalog.js): the rules let anyone read `policies`, so no credentials are needed.
//
// Like the catalogue, nothing here may break a build or a page: a failure is { status: 'error' } / null, and the pages
// fall back to the built-in Terms, Refunds and Privacy (lib/policies.js).

import { normalisePolicy, SAFE_POLICY_ID } from './policies.js';
import { documentsUrl, fieldsToData, request, restTarget } from './serverCatalog.js';

// JSON round trip: Next refuses to send `undefined` from getStaticProps.
const plain = (v) => JSON.parse(JSON.stringify(v));
const fromDocument = (doc) => {
  const id = String(doc?.name ?? '').split('/').pop();
  return normalisePolicy(id, fieldsToData(doc?.fields));
};

// Every policy that can be shown, or null if Firestore could not be reached.
export async function fetchPolicies({ env = process.env, fetchImpl = fetch } = {}) {
  const target = restTarget(env);
  if (!target) return null;
  try {
    const res = await request(`${documentsUrl(target)}/policies?pageSize=100`, { method: 'GET' }, fetchImpl);
    if (!res.ok) return null;
    const body = await res.json();
    return plain((body.documents ?? []).map(fromDocument).filter(Boolean));
  } catch {
    return null;
  }
}

// One policy. { status: 'found', policy } | { status: 'missing' } | { status: 'error' } (never treated as missing).
export async function fetchPolicy(id, { env = process.env, fetchImpl = fetch } = {}) {
  if (typeof id !== 'string' || !SAFE_POLICY_ID.test(id)) return { status: 'missing' };
  const target = restTarget(env);
  if (!target) return { status: 'error' };
  try {
    const res = await request(`${documentsUrl(target)}/policies/${id}`, { method: 'GET' }, fetchImpl);
    if (res.status === 404) return { status: 'missing' };
    if (!res.ok) return { status: 'error' };
    const policy = fromDocument(await res.json());
    return policy ? { status: 'found', policy: plain(policy) } : { status: 'missing' };
  } catch {
    return { status: 'error' };
  }
}
