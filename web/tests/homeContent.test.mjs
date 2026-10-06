import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FINAL_CTA, HOW_IT_WORKS, MARQUEE_ITEMS, WHY_FRESHBLISS } from '../content/storefront.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// Emoji and pictographs (the design rules allow none: they draw differently on every phone).
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/u;

// Every icon a component draws is chosen by an `id` from the content, so an id with no icon would silently get a fallback.
const idsIn = (source, mapName) => {
  const body = source.match(new RegExp(`const ${mapName} = \\{([^}]*)\\}`))?.[1] ?? '';
  return [...body.matchAll(/(\w+)\s*:/g)].map((m) => m[1]);
};

describe('home page words', () => {
  it('the ticker has no emoji and makes no rating claim (there are no real reviews behind one)', () => {
    for (const { text } of MARQUEE_ITEMS) {
      assert.ok(!EMOJI.test(text), `no emoji in "${text}"`);
      assert.ok(!/\d(\.\d)?\s*\/\s*5|rating|stars?/i.test(text), `no rating in "${text}"`);
    }
  });

  it('every ticker item, step and feature has an id with an icon drawn for it', () => {
    const cases = [
      ['components/Marquee.js', 'ICONS', MARQUEE_ITEMS.map((i) => i.id)],
      ['components/HowItWorks.js', 'ICONS', HOW_IT_WORKS.steps.map((s) => s.id)],
      ['components/WhyFreshBliss.js', 'ICONS', WHY_FRESHBLISS.items.map((i) => i.id)],
    ];
    for (const [file, map, ids] of cases) {
      const drawn = idsIn(read(file), map);
      for (const id of ids) assert.ok(drawn.includes(id), `${file} draws an icon for "${id}"`);
    }
  });

  it('ids are unique, and every step and feature has a title and a sentence', () => {
    for (const list of [MARQUEE_ITEMS, HOW_IT_WORKS.steps, WHY_FRESHBLISS.items]) {
      assert.equal(new Set(list.map((i) => i.id)).size, list.length, 'unique ids');
    }
    for (const { title, text } of [...HOW_IT_WORKS.steps, ...WHY_FRESHBLISS.items]) {
      assert.ok(title.length > 3 && text.length > 20, `"${title}" is filled in`);
      assert.ok(!EMOJI.test(title + text), `no emoji in "${title}"`);
    }
    assert.equal(HOW_IT_WORKS.steps.length, 4);
  });

  it('keeps to what the shop really does: no speed, rating or payment-method promises beyond the existing ones', () => {
    const all = JSON.stringify([HOW_IT_WORKS, WHY_FRESHBLISS, FINAL_CTA]);
    assert.ok(!/\bUPI\b|net ?banking|\bwallets?\b|\bCOD\b|cash on delivery/i.test(all), 'no payment methods we cannot prove are switched on');
    assert.ok(!/\d+\s*(min|minute|hour|hr)/i.test(all), 'no delivery-time numbers (the zones state those)');
    assert.ok(!/\bguarantee|\bcertified|\baward/i.test(all), 'no guarantees or certifications');
  });
});
