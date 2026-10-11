'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildAssistantFaqs } = require('../scripts/assistantFaqs');

const FAQS = buildAssistantFaqs();
// The names pages/api/assistant.js fills in (FAQ_VARS).
const KNOWN_VARS = new Set(['freeDeliveryFrom', 'deliveryHours', 'leadMinutes', 'maxQty', 'tips', 'supportEmail', 'contactLine']);

describe('the chat assistant FAQ bank', () => {
  it('has many questions, each with a unique id, several wordings and an answer', () => {
    assert.ok(FAQS.length >= 50, `only ${FAQS.length}`);
    assert.equal(new Set(FAQS.map((f) => f.id)).size, FAQS.length, 'unique ids');
    for (const f of FAQS) {
      assert.match(f.id, /^[a-z0-9-]{1,80}$/);
      assert.ok(f.question.length > 5 && f.answer.length > 20, f.id);
      assert.ok(f.variants.length >= 3, `${f.id} needs more ways of asking`);
      assert.equal(f.active, true);
      assert.ok(Number.isInteger(f.order));
    }
  });

  it('links only to pages of this website, at most three per answer', () => {
    for (const f of FAQS) {
      assert.ok(f.links.length <= 3, f.id);
      for (const l of f.links) {
        assert.match(l.href, /^\/(?!\/)/, `${f.id}: ${l.href}`);
        assert.ok(l.label && l.label.length <= 32, f.id);
      }
    }
  });

  it('uses only the {{names}} the server fills in, so a customer never sees braces', () => {
    for (const f of FAQS) {
      for (const [, name] of f.answer.matchAll(/\{\{(\w+)\}\}/g)) assert.ok(KNOWN_VARS.has(name), `${f.id}: {{${name}}}`);
    }
  });

  it('promises only what the shop does: no refund timeline, no cash on delivery, no health claims', () => {
    for (const f of FAQS) {
      assert.doesNotMatch(f.answer, /\b\d+\s*(working\s*|business\s*)?(days?|hours?)\b/i, `${f.id}: no timelines`);
      assert.doesNotMatch(f.answer, /we (offer|accept|have) cash on delivery/i, f.id);
      assert.doesNotMatch(f.answer, /weight[- ]?loss|\bcures?\b|\bdetox|diabetic[- ]friendly|guarantee|certified organic/i, f.id);
    }
  });
});
