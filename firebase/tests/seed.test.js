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

  it('every seeded product turns into a complete, safe storefront product (images, benefits, tab)', async () => {
    // Runs the seed through the SAME normaliser the storefront uses, so a seed change that would crash or blank
    // a page (no photo, a bad benefits list, a category with no home-page tab) fails here first.
    const { normaliseProduct } = await import('../../web/lib/product.js');
    const { CATEGORIES } = await import('../../web/content/storefront.js');
    const { inTab } = await import('../../web/lib/categories.js');
    const realTabs = CATEGORIES.filter((t) => t.categories.length > 0);
    for (const p of buildProducts()) {
      const n = normaliseProduct(p.slug, p);
      assert.ok(n, `${p.slug} could not be normalised`);
      assert.ok(n.images.length > 0 && n.images.every((u) => /^https:\/\//.test(u)), `${p.slug} needs at least one photo`);
      assert.ok(Array.isArray(n.keyBenefits), p.slug);
      assert.ok(realTabs.some((t) => inTab(n, t)), `${p.slug} is in category "${n.category}", which has no home-page tab`);
      assert.ok(Array.isArray(p.images), `${p.slug}: images must be a list (empty is fine: placeholders are used)`);
    }
  });

  it('adds the four Chilled & Dairy products, each with a storage note and the harvest facts', () => {
    const expected = {
      'madagascar-vanilla-ice-cream': ['Madagascar Vanilla Bean Ice Cream', 'Ice Cream', 'Keep Frozen at -18°C'],
      'a2-organic-farm-milk': ['A2 Organic Farm Milk', 'Dairy', 'Keep Refrigerated below 4°C'],
      'cold-pressed-orange-juice': ['Cold-Pressed Valencia Orange Juice', 'Beverages', 'Keep Refrigerated'],
      'chilled-watermelon-mint-bowl': ['Chilled Watermelon & Mint Bowl', 'Cut Fruits', 'Keep Refrigerated'],
    };
    for (const [slug, [name, category, storage]] of Object.entries(expected)) {
      const p = bySlug[slug];
      assert.ok(p, `${slug} is missing`);
      assert.equal(p.name, name);
      assert.equal(p.category, category);
      assert.equal(p.storage, storage);
      assert.ok(typeof p.origin === 'string' && p.origin.length > 0, slug);
      assert.ok(typeof p.calories === 'string' && p.calories.length > 0, slug);
      assert.ok(Array.isArray(p.keyBenefits) && p.keyBenefits.length >= 2, slug);
      assert.ok(p.stock > 0 && p.active === true, slug);
    }
  });

  it('only the chilled and frozen products have a storage note', () => {
    const withStorage = buildProducts().filter((p) => p.storage !== undefined).map((p) => p.slug).sort();
    assert.deepEqual(withStorage, ['a2-organic-farm-milk', 'chilled-watermelon-mint-bowl', 'cold-pressed-orange-juice', 'madagascar-vanilla-ice-cream']);
  });

  it('leaves the launch boxes without the new fields (the page then hides the section)', () => {
    for (const slug of ['classic-fresh-mix', 'tropical-bliss', 'gym-fuel-pack', 'ramadan-special-box', 'mango-season-box']) {
      assert.equal(bySlug[slug].origin, undefined, slug);
    }
  });
});
