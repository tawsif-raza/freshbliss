import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BUILT_IN_POLICIES, chooseBuiltIn, listPolicies, normalisePolicy, policyHref } from '../lib/policies.js';
import { fetchPolicies, fetchPolicy } from '../lib/serverPolicies.js';

const sections = [{ id: 'areas', title: 'Where we deliver', items: [{ type: 'p', text: 'Bengaluru only.' }] }];
const shipping = { title: 'Shipping & Delivery Policy', kicker: 'Getting it to you', description: 'd', lead: 'l', updated: '11 October 2026', order: 10, placeholder: true, active: true, sections };

describe('a policy from the database', () => {
  it('keeps a well-formed policy as it is', () => {
    const p = normalisePolicy('shipping', shipping);
    assert.equal(p.title, 'Shipping & Delivery Policy');
    assert.equal(p.placeholder, true);
    assert.deepEqual(p.sections, sections);
  });

  it('drops malformed sections and items instead of breaking the page', () => {
    const p = normalisePolicy('shipping', {
      ...shipping,
      sections: [
        ...sections,
        { id: 'empty', title: 'Nothing in it', items: [{ type: 'p', text: '  ' }, { type: 'ul', items: [] }, { type: 'table' }] },
        { title: '', items: [{ type: 'p', text: 'no title' }] },
        { id: 'BAD ID!', title: 'A list', items: [{ type: 'ul', items: ['one', 7, ' two '] }] },
      ],
    });
    assert.deepEqual(
      p.sections.map((s) => [s.id, s.items]),
      [
        ['areas', [{ type: 'p', text: 'Bengaluru only.' }]],
        ['section-4', [{ type: 'ul', items: ['one', 'two'] }]],
      ],
    );
  });

  it('cannot be shown when switched off, untitled, empty or with an unsafe id', () => {
    assert.equal(normalisePolicy('shipping', { ...shipping, active: false }), null);
    assert.equal(normalisePolicy('shipping', { ...shipping, title: ' ' }), null);
    assert.equal(normalisePolicy('shipping', { ...shipping, sections: [] }), null);
    assert.equal(normalisePolicy('../orders', shipping), null);
  });

  it('counts as approved wording only when placeholder is explicitly false', () => {
    assert.equal(normalisePolicy('shipping', { ...shipping, placeholder: undefined }).placeholder, true);
    assert.equal(normalisePolicy('shipping', { ...shipping, placeholder: false }).placeholder, false);
  });
});

describe('Terms, Refunds and Privacy never disappear', () => {
  const dbTerms = normalisePolicy('terms', { ...shipping, title: 'Terms (edited)', order: 1, placeholder: false });

  it('use the database copy only when it is approved wording', () => {
    assert.equal(chooseBuiltIn('terms', dbTerms).title, 'Terms (edited)');
    assert.equal(chooseBuiltIn('terms', { ...dbTerms, placeholder: true }).title, 'Terms of Service');
    assert.equal(chooseBuiltIn('terms', null).title, 'Terms of Service');
  });

  it('are always in the list, which is sorted by order, even when the database is empty or unreachable', () => {
    assert.deepEqual(listPolicies(null).map((p) => p.id), ['terms', 'refunds', 'privacy']);
    const list = listPolicies([normalisePolicy('shipping', shipping), dbTerms]);
    assert.deepEqual(list.map((p) => p.id), ['terms', 'refunds', 'privacy', 'shipping']);
    assert.equal(list[0].title, 'Terms (edited)');
  });

  it('keep their short addresses', () => {
    assert.equal(policyHref('terms'), '/terms');
    assert.equal(policyHref('privacy'), '/privacy');
    assert.equal(policyHref('shipping'), '/policies/shipping');
    for (const p of BUILT_IN_POLICIES) assert.equal(p.placeholder, false);
  });
});

describe('reading policies on the server', () => {
  const env = { NODE_ENV: 'production', NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'demo-test' };
  const restDoc = (id, data) => ({
    name: `projects/demo-test/databases/(default)/documents/policies/${id}`,
    fields: {
      title: { stringValue: data.title },
      placeholder: { booleanValue: data.placeholder },
      order: { integerValue: String(data.order) },
      sections: {
        arrayValue: {
          values: data.sections.map((s) => ({
            mapValue: { fields: { id: { stringValue: s.id }, title: { stringValue: s.title }, items: { arrayValue: { values: s.items.map((i) => ({ mapValue: { fields: { type: { stringValue: i.type }, text: { stringValue: i.text } } } })) } } } },
          })),
        },
      },
    },
  });
  const reply = (status, body) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });

  it('turns the stored documents into clean policies', async () => {
    const list = await fetchPolicies({ env, fetchImpl: reply(200, { documents: [restDoc('shipping', shipping)] }) });
    assert.deepEqual(list.map((p) => [p.id, p.title, p.order, p.placeholder]), [['shipping', 'Shipping & Delivery Policy', 10, true]]);
    assert.deepEqual(await fetchPolicies({ env, fetchImpl: reply(200, {}) }), []);
  });

  it('tells "no such policy" apart from "could not ask"', async () => {
    assert.equal((await fetchPolicy('shipping', { env, fetchImpl: reply(200, restDoc('shipping', shipping)) })).status, 'found');
    assert.equal((await fetchPolicy('shipping', { env, fetchImpl: reply(404, {}) })).status, 'missing');
    assert.equal((await fetchPolicy('shipping', { env, fetchImpl: reply(500, {}) })).status, 'error');
    assert.equal((await fetchPolicy('shipping', { env, fetchImpl: async () => { throw new Error('offline'); } })).status, 'error');
    assert.equal(await fetchPolicies({ env, fetchImpl: reply(403, {}) }), null);
    assert.equal((await fetchPolicy('../orders/x', { env, fetchImpl: reply(200, {}) })).status, 'missing');
  });
});
