import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES } from '../content/storefront.js';
import { countByTab, inTab, productsInTab } from '../lib/categories.js';

const p = (id, category) => ({ id, category });
const PRODUCTS = [
  p('fresh-1', 'Fresh'),
  p('fresh-2', 'Fresh'),
  p('ice', 'Ice Cream'),
  p('milk', 'Dairy'),
  p('juice', 'Beverages'),
  p('bowl', 'Cut Fruits'),
  p('mystery', null),
];
const tab = (id) => CATEGORIES.find((t) => t.id === id);
const ids = (id) => productsInTab(PRODUCTS, tab(id)).map((x) => x.id);

describe('home page tabs', () => {
  it('All shows everything, including a product with no category', () => {
    assert.deepEqual(ids('all'), PRODUCTS.map((x) => x.id));
  });

  it('a single-category tab shows just that category', () => {
    assert.deepEqual(ids('fresh'), ['fresh-1', 'fresh-2']);
    assert.deepEqual(ids('beverages'), ['juice']);
  });

  it('Chilled & Dairy gathers ice cream, dairy and cut fruits', () => {
    assert.deepEqual(ids('chilled'), ['ice', 'milk', 'bowl']);
  });

  it('a product only appears under the tabs that list its category', () => {
    assert.equal(inTab(p('x', 'Dairy'), tab('beverages')), false);
    assert.equal(inTab(p('x', 'Dairy'), tab('chilled')), true);
    assert.equal(inTab(p('x', 'Dairy'), undefined), true); // a missing tab behaves like All
  });

  it('counts what each tab holds', () => {
    const counts = countByTab(PRODUCTS, CATEGORIES);
    assert.equal(counts.all, 7);
    assert.equal(counts.chilled, 3);
    assert.equal(counts.beverages, 1);
    assert.equal(counts.combos, 0);
  });

  it('every tab has a unique id and a label', () => {
    assert.equal(new Set(CATEGORIES.map((t) => t.id)).size, CATEGORIES.length);
    for (const t of CATEGORIES) assert.ok(t.label && Array.isArray(t.categories), t.id);
  });
});
