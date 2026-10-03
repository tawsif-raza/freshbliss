import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hasSpecs, normaliseNutrition, normaliseSpecText, specRows } from '../lib/specs.js';
import { normaliseProduct } from '../lib/product.js';

describe('normaliseSpecText', () => {
  it('trims and squeezes spaces, and returns null for nothing or the wrong type', () => {
    assert.equal(normaliseSpecText('  Best before   4 days ', 'shelfLife'), 'Best before 4 days');
    for (const bad of [undefined, null, '', '   ', 5, {}, []]) assert.equal(normaliseSpecText(bad, 'shelfLife'), null);
  });

  it('cuts text that is far too long', () => {
    assert.equal(normaliseSpecText('x'.repeat(5000), 'brandStory').length, 700);
    assert.equal(normaliseSpecText('x'.repeat(5000), 'shelfLife').length, 160);
  });
});

describe('normaliseNutrition', () => {
  const rows = [
    { label: 'Energy', value: '62 kcal' },
    { label: 'Protein', value: '3.2 g' },
  ];

  it('keeps an ordered list of rows with the basis they are per', () => {
    assert.deepEqual(normaliseNutrition({ per: 'Per 100 ml', rows }), { per: 'Per 100 ml', rows });
  });

  it('reads the "|" string form from the brief, in the order written', () => {
    assert.deepEqual(normaliseNutrition('Energy: 62 kcal | Protein: 3.2g | Calcium: 120mg'), {
      per: '',
      rows: [
        { label: 'Energy', value: '62 kcal' },
        { label: 'Protein', value: '3.2g' },
        { label: 'Calcium', value: '120mg' },
      ],
    });
  });

  it('reads a plain object of label: value too', () => {
    assert.deepEqual(normaliseNutrition({ rows: { Energy: '62 kcal', Fat: '3.5 g' } }).rows, [
      { label: 'Energy', value: '62 kcal' },
      { label: 'Fat', value: '3.5 g' },
    ]);
  });

  it('drops half-empty and wrong-typed rows, and gives null when nothing usable is left', () => {
    assert.deepEqual(normaliseNutrition({ rows: [{ label: 'Energy', value: '' }, { label: '', value: '5' }, null, 'x', { label: 'Fat', value: '1 g' }] }).rows, [{ label: 'Fat', value: '1 g' }]);
    for (const bad of [undefined, null, '', 'no colons here', 5, [], {}, { rows: [] }, { rows: 'nope' }, { rows: [{}] }]) assert.equal(normaliseNutrition(bad), null, JSON.stringify(bad));
  });

  it('never returns more than 15 rows', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ label: `L${i}`, value: `${i} g` }));
    assert.equal(normaliseNutrition({ rows: many }).rows.length, 15);
  });
});

describe('which specification rows are shown', () => {
  it('a bare product shows none, and no section at all', () => {
    const p = normaliseProduct('bare', { price: 10 });
    assert.deepEqual(specRows(p), { ingredients: false, nutrition: false, sourcing: false, shelfLife: false });
    assert.equal(hasSpecs(p), false);
  });

  it('each field switches on its own row', () => {
    const base = { price: 10 };
    assert.equal(specRows(normaliseProduct('a', { ...base, ingredientsText: 'Milk' })).ingredients, true);
    assert.equal(specRows(normaliseProduct('a', { ...base, allergens: 'Contains milk.' })).ingredients, true);
    assert.equal(specRows(normaliseProduct('a', { ...base, ingredients: ['Apple'] })).ingredients, true); // the older list still counts
    assert.equal(specRows(normaliseProduct('a', { ...base, nutrition: 'Energy: 1 kcal' })).nutrition, true);
    assert.equal(specRows(normaliseProduct('a', { ...base, brandStory: 'Grown by hand.' })).sourcing, true);
    assert.equal(specRows(normaliseProduct('a', { ...base, shelfLife: '3 days' })).shelfLife, true);
    assert.equal(specRows(normaliseProduct('a', { ...base, storage: 'Keep Refrigerated' })).shelfLife, true); // storage joins shelf life
  });

  it('a malformed value switches its row off instead of breaking the page', () => {
    const p = normaliseProduct('a', { price: 10, nutrition: 42, brandStory: {}, shelfLife: [], ingredientsText: 7, allergens: null });
    assert.deepEqual(specRows(p), { ingredients: false, nutrition: false, sourcing: false, shelfLife: false });
  });
});
