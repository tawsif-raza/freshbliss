import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BENEFITS, BENEFIT_POINTS, HABIT_POINTS } from '../content/benefits.js';
import { benefitGroups, groupFor } from '../lib/benefits.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/u;

describe('the "Why fruit every day" words', () => {
  const all = JSON.stringify([BENEFITS, BENEFIT_POINTS, HABIT_POINTS]);

  it('make no medical, weight-loss or visible-result claims, and promise nothing', () => {
    // Health claims on food must be backed by evidence (FSSAI Advertising and Claims Regulations, 2018).
    assert.ok(!/\bcures?\b|\bheals?\b|\bhealing\b|\btreatment|\bprevents?\b|\bdetox|\bboosts?\b/i.test(all), 'no cure, treatment, prevention, detox or boost wording');
    assert.ok(!/weight[- ]?loss|lose weight|burns? fat|\bslim|glowing|clear skin|younger|anti-?ageing|anti-?aging/i.test(all), 'no weight-loss or looks promises');
    assert.ok(!/before[- ]and[- ]after|\bresults?\b|transform/i.test(all), 'no before-and-after or results wording');
    assert.ok(!/\bguarantee|\bcertified|\bclinically|\bproven|\bdoctors? recommend/i.test(all), 'no guarantees or authority claims');
    assert.ok(!EMOJI.test(all), 'no emoji');
  });

  it('every card has an id with an icon drawn for it, a title and a sentence', () => {
    const source = read('components/HealthBenefits.js');
    const drawn = [...(source.match(/const ICONS = \{([^}]*)\}/)?.[1] ?? '').matchAll(/(\w+)\s*:/g)].map((m) => m[1]);
    assert.equal(new Set(BENEFIT_POINTS.map((p) => p.id)).size, BENEFIT_POINTS.length, 'unique ids');
    for (const { id, title, text } of BENEFIT_POINTS) {
      assert.ok(drawn.includes(id), `an icon for "${id}"`);
      assert.ok(title.length > 3 && text.length > 20, `"${id}" is filled in`);
    }
  });

  it('says that sweet drinks are a treat and that this is not medical advice, with its source', () => {
    assert.ok(BENEFITS.note.some((line) => /sugar/i.test(line)));
    assert.ok(BENEFITS.note.some((line) => /not medical advice/i.test(line)));
    assert.match(BENEFITS.source.href, /^https:\/\//);
  });
});

describe('what is in each product', () => {
  const product = (id, category, keyBenefits) => ({ id, name: id, category, keyBenefits });

  it('puts fruit, drinks and everything else in their own groups', () => {
    assert.equal(groupFor('Ramadan Fruits'), 'fruit');
    assert.equal(groupFor('Cut Fruits'), 'fruit');
    assert.equal(groupFor('Ramadan Drinks'), 'drinks');
    assert.equal(groupFor('Dairy'), 'drinks');
    assert.equal(groupFor('Exotics'), 'boxes');
    assert.equal(groupFor('Ice Cream'), 'boxes');
  });

  it("lists only each product's own benefits, leaving out products without any and empty groups", () => {
    const groups = benefitGroups([
      product('fresh-guavas', 'Ramadan Fruits', ['Very rich in vitamin C', ' ']),
      product('classic-fresh-mix', 'Fresh', []),
      product('mango-shake', 'Ramadan Drinks', ['Made with real mango']),
      product('tropical-bliss', 'Fresh', undefined),
    ]);
    assert.deepEqual(
      groups.map((g) => [g.id, g.products.map((p) => [p.id, p.benefits])]),
      [
        ['fruit', [['fresh-guavas', ['Very rich in vitamin C']]]],
        ['drinks', [['mango-shake', ['Made with real mango']]]],
      ],
    );
    assert.deepEqual(benefitGroups([]), []);
  });
});
