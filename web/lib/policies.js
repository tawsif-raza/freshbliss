// Website policies stored in Firestore (`policies/{id}`, written by firebase/scripts/seed.js from scripts/policies.js).
// Pure functions, so they are easy to test; the server reads are in lib/serverPolicies.js.
//
// Terms, Cancellation & Refunds and Privacy also have a built-in copy (content/policies.js, content/privacy.js), used
// whenever the database has no usable version: those pages must never disappear because Firestore is empty or down.
// A database copy marked `placeholder` (dummy text) never replaces a built-in one.

import { POLICIES_UPDATED, REFUND_SECTIONS, TERMS_SECTIONS } from '../content/policies.js';
import { PRIVACY_SECTIONS, PRIVACY_UPDATED } from '../content/privacy.js';

export const SAFE_POLICY_ID = /^[a-z0-9-]{1,60}$/;

// These three keep their own short addresses; /policies/terms and so on redirect there.
export const POLICY_PATHS = { terms: '/terms', refunds: '/refunds', privacy: '/privacy' };
export const policyHref = (id) => POLICY_PATHS[id] ?? `/policies/${id}`;

export const BUILT_IN_POLICIES = [
  {
    id: 'terms',
    title: 'Terms of Service',
    kicker: 'The small print',
    description: 'The terms for ordering fresh fruit boxes from FreshBliss.',
    lead: 'The terms for ordering from us, in plain words.',
    updated: POLICIES_UPDATED,
    order: 1,
    placeholder: false,
    sections: TERMS_SECTIONS,
  },
  {
    id: 'refunds',
    title: 'Cancellation & Refunds',
    kicker: 'If plans change',
    description: 'How to cancel a FreshBliss order and how refunds work.',
    lead: 'How to cancel an order, and how your money comes back.',
    updated: POLICIES_UPDATED,
    order: 2,
    placeholder: false,
    sections: REFUND_SECTIONS,
  },
  {
    id: 'privacy',
    title: 'Privacy',
    kicker: 'Your information',
    description: 'What FreshBliss collects when you order, why, and where it is kept.',
    lead: 'What we collect when you order, why, and where it is kept.',
    updated: PRIVACY_UPDATED,
    order: 3,
    placeholder: false,
    sections: PRIVACY_SECTIONS,
  },
];

const text = (v) => (typeof v === 'string' ? v.trim() : '');

function normaliseItem(item) {
  if (item?.type === 'ul' && Array.isArray(item.items)) {
    const lines = item.items.map(text).filter(Boolean);
    return lines.length ? { type: 'ul', items: lines } : null;
  }
  const t = text(item?.text);
  return item?.type === 'p' && t ? { type: 'p', text: t } : null;
}

// A Firestore document's data -> a clean policy, or null when it cannot be shown (switched off, no title, no content).
// Malformed sections and items are dropped rather than breaking the page.
export function normalisePolicy(id, data) {
  if (!SAFE_POLICY_ID.test(String(id)) || !data || data.active === false) return null;
  const title = text(data.title);
  const sections = (Array.isArray(data.sections) ? data.sections : [])
    .map((s, i) => ({ id: SAFE_POLICY_ID.test(String(s?.id)) ? s.id : `section-${i + 1}`, title: text(s?.title), items: (Array.isArray(s?.items) ? s.items : []).map(normaliseItem).filter(Boolean) }))
    .filter((s) => s.title && s.items.length > 0);
  if (!title || sections.length === 0) return null;
  return {
    id,
    title,
    kicker: text(data.kicker),
    description: text(data.description),
    lead: text(data.lead),
    updated: text(data.updated),
    order: Number.isFinite(data.order) ? data.order : 1000,
    placeholder: data.placeholder !== false, // only an explicit false counts as approved wording
    sections,
  };
}

// The version of a built-in policy to show: the database copy when it is real wording, else the built-in one.
export function chooseBuiltIn(id, fromDb) {
  const builtIn = BUILT_IN_POLICIES.find((p) => p.id === id);
  return fromDb && !fromDb.placeholder ? fromDb : builtIn;
}

// The /policies list: everything in the database, with each built-in one filled in when the database lacks a real
// version of it. Sorted by `order`, then title.
export function listPolicies(fromDb) {
  const byId = new Map((fromDb ?? []).map((p) => [p.id, p]));
  for (const builtIn of BUILT_IN_POLICIES) byId.set(builtIn.id, chooseBuiltIn(builtIn.id, byId.get(builtIn.id)));
  return [...byId.values()].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}
