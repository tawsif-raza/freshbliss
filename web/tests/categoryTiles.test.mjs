import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { categoryTiles } from '../lib/categories.js';
import { CATEGORIES } from '../content/storefront.js';

const box = (id, category, stock = 5, images = [`https://x.test/${id}.jpg`]) => ({ id, name: `Box ${id}`, category, stock, images });

describe('categoryTiles (shop by category)', () => {
  it('makes one tile per tab that holds boxes, in the tabs order, and never for "All"', () => {
    const tiles = categoryTiles([box('a', 'Fitness'), box('b', 'Fresh'), box('c', 'Fresh')], CATEGORIES);
    assert.deepEqual(tiles.map((t) => [t.id, t.count]), [['fresh', 2], ['fitness', 1]]);
    assert.ok(!tiles.some((t) => t.id === 'all'));
  });

  it('shows a box that is in stock rather than a sold-out one, and links to that tab of the shop', () => {
    const [tile] = categoryTiles([box('gone', 'Fresh', 0), box('here', 'Fresh', 3)], CATEGORIES);
    assert.equal(tile.image, 'https://x.test/here.jpg');
    assert.equal(tile.href, '/?category=fresh#shop');
    assert.match(tile.alt, /Box here/);
  });

  it('still uses a sold-out box if it is all there is, and counts it', () => {
    const [tile] = categoryTiles([box('gone', 'Fresh', 0)], CATEGORIES);
    assert.equal(tile.count, 1);
    assert.equal(tile.image, 'https://x.test/gone.jpg');
  });

  it('counts a tab that covers several categories once each, like Chilled & Dairy', () => {
    const tiles = categoryTiles([box('i', 'Ice Cream'), box('m', 'Dairy'), box('w', 'Cut Fruits')], CATEGORIES);
    assert.deepEqual(tiles.map((t) => [t.id, t.count]), [['chilled', 3]]);
  });

  it('leaves out a tab with no boxes, or whose boxes have no photo, and copes with no products at all', () => {
    assert.deepEqual(categoryTiles([], CATEGORIES), []);
    assert.deepEqual(categoryTiles([box('n', 'Fresh', 5, [])], CATEGORIES), []);
    assert.deepEqual(categoryTiles([{ id: 'x', name: 'X', category: 'Fresh', stock: 1 }], CATEGORIES), [], 'no images field at all');
  });
});
