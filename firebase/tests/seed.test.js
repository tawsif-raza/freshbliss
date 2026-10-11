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
    assert.deepEqual(withStorage, [
      'a2-organic-farm-milk', 'banana-shake', 'chilled-watermelon-mint-bowl', 'cold-pressed-orange-juice', 'dry-fruit-milkshake',
      'fresh-mixed-fruit-juice', 'fresh-papaya-cut', 'fresh-toned-milk', 'fresh-watermelon-cut', 'jaljeera',
      'madagascar-vanilla-ice-cream', 'mango-shake', 'masala-chaas', 'muskmelon-cut', 'nimbu-pani', 'rooh-afza-sharbat', 'sweet-lassi',
    ]);
  });

  it('adds the Ramadan range: every fruit and drink asked for, under the Ramadan tab, at exactly "15% off"', async () => {
    const { CATEGORIES } = await import('../../web/content/storefront.js');
    const { inTab } = await import('../../web/lib/categories.js');
    const { normaliseProduct } = await import('../../web/lib/product.js');
    const { regularUnitPrice, percentOff } = await import('../../web/lib/pricing.js');
    const ramadanTab = CATEGORIES.find((t) => t.id === 'ramadan');

    const fruits = buildProducts().filter((p) => p.category === 'Ramadan Fruits').map((p) => p.slug);
    const drinks = buildProducts().filter((p) => p.category === 'Ramadan Drinks').map((p) => p.slug);
    assert.deepEqual(fruits, ['premium-dates-khajoor', 'fresh-watermelon-cut', 'fresh-bananas', 'fresh-apples', 'fresh-oranges', 'fresh-mangoes', 'fresh-papaya-cut', 'black-seedless-grapes', 'fresh-pomegranates', 'fresh-guavas', 'muskmelon-cut']);
    assert.deepEqual(drinks, ['rooh-afza-sharbat', 'nimbu-pani', 'jaljeera', 'sweet-lassi', 'masala-chaas', 'dry-fruit-milkshake', 'mango-shake', 'banana-shake', 'fresh-mixed-fruit-juice', 'tender-coconut-water', 'fresh-toned-milk', 'packaged-drinking-water']);

    for (const slug of [...fruits, ...drinks]) {
      const p = bySlug[slug];
      // what is charged is the regular price less 15%, rounded down to the rupee; the regular price is kept to show crossed out
      assert.equal(p.price, Math.floor(p.compareAtPrice * 0.85), slug);
      assert.ok(p.compareAtPrice > p.price, slug);
      assert.equal(p.sizes.length, 1, `${slug}: one pack size, so the saving is the same on every pack`);
      const n = normaliseProduct(slug, p);
      assert.ok(inTab(n, ramadanTab), `${slug} is not under the Ramadan tab`);
      assert.equal(n.compareAtPrice, p.compareAtPrice, slug);
      const off = percentOff(regularUnitPrice(n, n.sizes[0].id), n.price);
      assert.equal(off, 15, `${slug}: the card would say ${off}% off`);
    }
    // the existing Ramadan box stays in the tab, at its own price
    assert.ok(inTab(normaliseProduct('ramadan-special-box', bySlug['ramadan-special-box']), ramadanTab));
    assert.equal(bySlug['ramadan-special-box'].compareAtPrice, undefined);
  });

  it('gives EVERY product the four specification fields (shelf life, story, ingredients text, nutrition)', async () => {
    const { normaliseProduct } = await import('../../web/lib/product.js');
    const { specRows } = await import('../../web/lib/specs.js');
    for (const p of buildProducts()) {
      const n = normaliseProduct(p.slug, p);
      assert.ok(n.shelfLife, `${p.slug} has no shelfLife`);
      assert.ok(n.brandStory && n.brandStory.length > 40, `${p.slug} has no brandStory`);
      assert.ok(n.ingredientsText, `${p.slug} has no ingredientsText`);
      assert.ok(n.nutrition && n.nutrition.rows.length >= 5, `${p.slug} has no nutrition table`);
      assert.deepEqual(specRows(n), { ingredients: true, nutrition: true, sourcing: true, shelfLife: true }, p.slug);
      // the plain list of ingredient names is still a list, as the rest of the app expects
      assert.ok(Array.isArray(p.ingredients) && p.ingredients.every((i) => typeof i === 'string'), p.slug);
      assert.equal(typeof p.ingredientsText, 'string', p.slug);
    }
  });

  it('nutrition starts with Energy, and Energy agrees with the calories text where a product has one', () => {
    for (const p of buildProducts()) {
      assert.equal(p.nutrition.rows[0].label, 'Energy', p.slug);
      const kcal = Number(/(\d+)\s*kcal/.exec(p.nutrition.rows[0].value)?.[1]);
      // only drinking water may honestly say 0 kcal
      assert.ok(Number.isFinite(kcal) && (kcal > 0 || p.slug === 'packaged-drinking-water'), p.slug);
      if (p.calories) assert.equal(Number(/(\d+)\s*kcal/.exec(p.calories)?.[1]), kcal, `${p.slug}: calories text and nutrition Energy disagree`);
    }
  });

  it('tells you about the real allergens: milk products say so, and so does the box with nuts', () => {
    assert.match(bySlug['a2-organic-farm-milk'].allergens, /milk/i);
    assert.match(bySlug['madagascar-vanilla-ice-cream'].allergens, /milk/i);
    assert.match(bySlug['gym-fuel-pack'].allergens, /nuts/i);
    // and no product that lists nuts or milk as an ingredient is missing the warning
    for (const p of buildProducts()) {
      if (p.ingredients.some((i) => /nut|milk|cream/i.test(i))) assert.ok(p.allergens, `${p.slug} lists nuts or milk but has no allergen note`);
    }
  });

  it('the stories match what the shop promised: Gir cows for the milk, 4 days refrigerated, 3 months frozen', () => {
    assert.match(bySlug['a2-organic-farm-milk'].brandStory, /Gir/);
    assert.match(bySlug['a2-organic-farm-milk'].brandStory, /graze freely/);
    assert.match(bySlug['a2-organic-farm-milk'].shelfLife, /4 days/);
    assert.match(bySlug['madagascar-vanilla-ice-cream'].shelfLife, /3 months/);
    assert.match(bySlug['madagascar-vanilla-ice-cream'].ingredientsText, /cream/i);
    assert.match(bySlug['madagascar-vanilla-ice-cream'].ingredientsText, /vanilla bean/i);
    assert.equal(bySlug['a2-organic-farm-milk'].ingredientsText, '100% Organic A2 Cow Milk');
    for (const p of buildProducts().filter((x) => ['Fresh', 'Fitness', 'Ramadan', 'Seasonal', 'Exotics', 'Immunity'].includes(x.category))) {
      assert.match(p.shelfLife, /within 3 days/i, p.slug);
    }
  });

  it('leaves the launch boxes without the new fields (the page then hides the section)', () => {
    for (const slug of ['classic-fresh-mix', 'tropical-bliss', 'gym-fuel-pack', 'ramadan-special-box', 'mango-season-box']) {
      assert.equal(bySlug[slug].origin, undefined, slug);
    }
  });
});
