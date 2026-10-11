'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { allPolicies, buildPolicies, builtInPolicies } = require('../scripts/policies');

const SAFE_ID = /^[a-z0-9-]{1,60}$/;

// The shape the website renders (web/lib/policies.js) and Firestore can store (no list directly inside a list).
function assertValidSections(policy) {
  assert.ok(Array.isArray(policy.sections) && policy.sections.length > 0, `${policy.id} has sections`);
  assert.equal(new Set(policy.sections.map((s) => s.id)).size, policy.sections.length, `${policy.id}: unique section ids`);
  for (const s of policy.sections) {
    assert.ok(typeof s.title === 'string' && s.title.trim() !== '', `${policy.id}/${s.id} has a title`);
    assert.ok(Array.isArray(s.items) && s.items.length > 0, `${policy.id}/${s.id} has items`);
    for (const item of s.items) {
      if (item.type === 'ul') {
        assert.ok(item.items.length > 0 && item.items.every((line) => typeof line === 'string' && line.trim() !== ''), `${policy.id}/${s.id}: list lines`);
      } else {
        assert.equal(item.type, 'p', `${policy.id}/${s.id}: an item is a paragraph or a list`);
        assert.ok(typeof item.text === 'string' && item.text.trim() !== '', `${policy.id}/${s.id}: paragraph text`);
      }
    }
  }
}

describe('website policies (the emulator `policies` collection)', () => {
  it('holds the three real drafts and every placeholder policy, each id once, in list order', async () => {
    const all = await allPolicies();
    const ids = all.map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length, 'unique ids');
    for (const id of ['terms', 'refunds', 'privacy', 'shipping', 'payments', 'promotions', 'food-safety', 'health-disclaimer', 'cookies', 'data-retention', 'grievance', 'acceptable-use', 'accessibility', 'bulk-orders']) {
      assert.ok(ids.includes(id), `has ${id}`);
    }
    assert.deepEqual(
      all.map((p) => p.order),
      [...all.map((p) => p.order)].sort((a, b) => a - b),
    );
  });

  it('every document has what a policy page needs, in a shape Firestore can store', async () => {
    for (const p of await allPolicies()) {
      assert.match(p.id, SAFE_ID);
      for (const field of ['title', 'kicker', 'description', 'lead', 'updated']) assert.ok(typeof p[field] === 'string' && p[field] !== '', `${p.id}.${field}`);
      assert.ok(Number.isInteger(p.order), `${p.id}.order`);
      assert.equal(p.active, true);
      assertValidSections(p);
    }
  });

  it('marks the dummy text as placeholder, and only the real drafts as not', async () => {
    for (const p of buildPolicies()) assert.equal(p.placeholder, true, p.id);
    for (const p of await builtInPolicies()) assert.equal(p.placeholder, false, p.id);
  });

  it('the real drafts are the website’s own wording, not a copy that could drift', async () => {
    const { TERMS_SECTIONS, REFUND_SECTIONS } = await import('../../web/content/policies.js');
    const byId = Object.fromEntries((await builtInPolicies()).map((p) => [p.id, p]));
    assert.equal(byId.terms.sections, TERMS_SECTIONS);
    assert.equal(byId.refunds.sections, REFUND_SECTIONS);
  });

  it('the placeholder text promises no refund timeline and no cash on delivery (the business has decided neither)', () => {
    const text = JSON.stringify(buildPolicies());
    assert.ok(!/refund\w*[^.]{0,60}\b\d+\s*(working\s*)?(days?|hours?)/i.test(text), 'no refund timeline');
    assert.ok(!/we (offer|accept) cash on delivery/i.test(text), 'no cash on delivery');
  });
});
