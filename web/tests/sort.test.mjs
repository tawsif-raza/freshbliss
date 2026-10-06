import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SORT_OPTIONS, filterInStock, isSortId, sortProducts } from '../lib/sort.js';

const box = (name, price, stock = 5) => ({ id: name.toLowerCase(), name, price, stock });
const names = (list) => list.map((p) => p.name);

const LIST = [box('Mango', 300), box('Apple', 100, 0), box('Berry', 200), box('Citrus', 100), box('Guava', 250, 0)];

describe('sortProducts', () => {
  it('featured keeps the catalogue order, with sold-out boxes last', () => {
    assert.deepEqual(names(sortProducts(LIST, 'featured')), ['Mango', 'Berry', 'Citrus', 'Apple', 'Guava']);
  });

  it('sorts by price both ways, and ties keep the catalogue order', () => {
    assert.deepEqual(names(sortProducts(LIST, 'price-asc')), ['Citrus', 'Berry', 'Mango', 'Apple', 'Guava']);
    assert.deepEqual(names(sortProducts(LIST, 'price-desc')), ['Mango', 'Berry', 'Citrus', 'Guava', 'Apple']);
    assert.deepEqual(names(sortProducts([box('B', 50), box('A', 50), box('C', 50)], 'price-asc')), ['B', 'A', 'C']);
  });

  it('sorts by name regardless of case, still with sold-out last', () => {
    assert.deepEqual(names(sortProducts([box('banana', 1), box('Apple', 1), box('cherry', 1, 0), box('Avocado', 1)], 'name')), ['Apple', 'Avocado', 'banana', 'cherry']);
  });

  it('never changes the list it was given, and treats an unknown mode as featured', () => {
    const copy = [...LIST];
    sortProducts(LIST, 'price-desc');
    assert.deepEqual(LIST, copy);
    assert.deepEqual(names(sortProducts(LIST, 'nonsense')), names(sortProducts(LIST, 'featured')));
    assert.deepEqual(sortProducts([], 'name'), []);
  });
});

describe('filterInStock', () => {
  it('keeps only boxes with stock when asked, and everything when not', () => {
    assert.deepEqual(names(filterInStock(LIST, true)), ['Mango', 'Berry', 'Citrus']);
    assert.equal(filterInStock(LIST, false), LIST);
  });
});

describe('sort options', () => {
  it('has unique ids, starts with featured, and recognises only its own ids', () => {
    const ids = SORT_OPTIONS.map((o) => o.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(ids[0], 'featured');
    assert.ok(ids.every(isSortId));
    assert.ok(!isSortId('price') && !isSortId(undefined));
  });
});
