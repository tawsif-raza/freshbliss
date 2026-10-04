import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { REFUND_SECTIONS, TERMS_SECTIONS } from '../content/policies.js';

const text = (sections) =>
  sections.flatMap((s) => s.items.flatMap((i) => (i.type === 'ul' ? i.items : [i.text]))).join(' ');

describe('policy copy', () => {
  it('every section has an id, a title and content; ids are unique', () => {
    for (const list of [TERMS_SECTIONS, REFUND_SECTIONS]) {
      const ids = list.map((s) => s.id);
      assert.equal(new Set(ids).size, ids.length);
      for (const s of list) assert.ok(s.title && s.items.length > 0);
    }
  });

  it('refund page does not invent a refund timeline', () => {
    assert.doesNotMatch(text(REFUND_SECTIONS), /\b\d+\s*(business |working )?(days?|hours?)\b/i);
  });

  it('refund page matches the system: refund to original method, cancellation until packed', () => {
    const t = text(REFUND_SECTIONS);
    assert.match(t, /original payment method/);
    assert.match(t, /until we have packed it/);
  });
});
