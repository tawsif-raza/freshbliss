import { readFileSync } from 'node:fs';
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

  it('says an item selling out while paying cancels the WHOLE order and refunds it in full (what the code does)', () => {
    for (const sections of [TERMS_SECTIONS, REFUND_SECTIONS]) {
      const t = text(sections);
      assert.match(t, /whole order \(not just that item\)/);
      assert.match(t, /refund the full amount/);
      assert.doesNotMatch(t, /refund (the amount for )?that item/i, 'the old single-item promise is gone');
    }
  });

  it('the FAQ makes the same promise, in the same words', () => {
    const faq = readFileSync(new URL('../pages/faq.js', import.meta.url), 'utf8');
    assert.match(faq, /cancel the whole order \(not just that item\) and refund the full amount/);
    assert.doesNotMatch(faq, /missing item/i);
  });

  it('terms and refunds say what happens when a promo code runs out while paying', () => {
    assert.match(text(TERMS_SECTIONS), /a code reaches its limit while you are paying, we cancel the order and refund you in full/);
    assert.match(text(REFUND_SECTIONS), /promo code reaches its usage limit while you are paying/);
  });
});
