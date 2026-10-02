import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pickRelated, RELATED_LIMIT } from '../lib/related.js';

const box = (id, category, stock = 10) => ({ id, category, stock });
const shop = [
  box('classic', 'Fresh'),
  box('tropical', 'Fresh'),
  box('gym', 'Fitness'),
  box('ramadan', 'Ramadan'),
  box('mango', 'Seasonal', 0), // sold out
  box('combo', 'Combos'),
];

describe('related boxes', () => {
  it('never suggests the box being viewed, and never a sold-out box', () => {
    const ids = pickRelated(shop, shop[0]).map((p) => p.id);
    assert.ok(!ids.includes('classic'));
    assert.ok(!ids.includes('mango'));
  });

  it('puts boxes from OTHER categories first (cross-selling), same category after', () => {
    const ids = pickRelated(shop, shop[0]).map((p) => p.id);
    assert.deepEqual(ids, ['gym', 'ramadan', 'combo', 'tropical']);
  });

  it('shows at most 4 by default, and respects a smaller limit', () => {
    assert.equal(RELATED_LIMIT, 4);
    assert.equal(pickRelated(shop, shop[0]).length, 4);
    assert.equal(pickRelated(shop, shop[0], 2).length, 2);
  });

  it('starts after the current box and wraps round, so each box gets its own suggestions', () => {
    assert.deepEqual(pickRelated(shop, shop[2]).map((p) => p.id), ['ramadan', 'combo', 'classic', 'tropical']);
    assert.notDeepEqual(pickRelated(shop, shop[0]).map((p) => p.id), pickRelated(shop, shop[2]).map((p) => p.id));
  });

  it('falls back to same-category boxes when nothing else is on sale', () => {
    const small = [box('a', 'Fresh'), box('b', 'Fresh'), box('c', 'Fresh')];
    assert.deepEqual(pickRelated(small, small[0]).map((p) => p.id), ['b', 'c']);
  });

  it('returns nothing (so the section can hide) when there is nothing to suggest', () => {
    assert.deepEqual(pickRelated([box('only', 'Fresh')], box('only', 'Fresh')), []);
    assert.deepEqual(pickRelated([box('a', 'Fresh'), box('b', 'Fresh', 0)], box('a', 'Fresh')), []);
    assert.deepEqual(pickRelated([], box('a', 'Fresh')), []);
  });

  it('copes with a box that is not in the list', () => {
    assert.equal(pickRelated(shop, box('unknown', 'Fresh')).length, 4);
  });

  it('does not change the list it was given', () => {
    const before = shop.map((p) => p.id).join();
    pickRelated(shop, shop[1]);
    assert.equal(shop.map((p) => p.id).join(), before);
  });
});
