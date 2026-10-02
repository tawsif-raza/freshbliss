'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildProducts } = require('../scripts/seed');

const bySlug = Object.fromEntries(buildProducts().map((p) => [p.slug, p]));

describe('seed catalogue', () => {
  it('has unique slugs and a valid whole-rupee price and stock for every product', () => {
    const all = buildProducts();
    assert.equal(new Set(all.map((p) => p.slug)).size, all.length);
    for (const p of all) {
      assert.ok(Number.isInteger(p.price) && p.price > 0, p.slug);
      assert.ok(Number.isInteger(p.stock) && p.stock >= 0, p.slug);
      assert.equal(p.active, true);
    }
  });

  it('adds the four premium lines, with the ingredients they are named for', () => {
    assert.deepEqual(bySlug['exotic-berry-medley'].ingredients, ['Blueberries', 'Raspberries', 'Strawberries']);
    assert.deepEqual(bySlug['citrus-immunity-shield'].ingredients, ['Oranges', 'Grapefruits', 'Lemons']);
    assert.deepEqual(bySlug['midnight-mango-indulgence'].ingredients, ['Alphonso Mango', 'Hapus Mango']);
    assert.deepEqual(bySlug['keto-green-pack'].ingredients, ['Avocados', 'Green Apples', 'Kiwi']);
  });

  it('gives each premium line origin, calories (text) and key benefits', () => {
    for (const slug of ['exotic-berry-medley', 'citrus-immunity-shield', 'midnight-mango-indulgence', 'keto-green-pack']) {
      const p = bySlug[slug];
      assert.equal(typeof p.origin, 'string', slug);
      assert.ok(p.origin.length > 0, slug);
      assert.equal(typeof p.calories, 'string', slug);
      assert.ok(Array.isArray(p.keyBenefits) && p.keyBenefits.length >= 2, slug);
      assert.ok(p.keyBenefits.every((b) => typeof b === 'string' && b.length > 0), slug);
    }
  });

  it('leaves the launch boxes without the new fields (the page then hides the section)', () => {
    for (const slug of ['classic-fresh-mix', 'tropical-bliss', 'gym-fuel-pack', 'ramadan-special-box', 'mango-season-box']) {
      assert.equal(bySlug[slug].origin, undefined, slug);
    }
  });
});
