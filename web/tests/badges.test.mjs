import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { badgeFor } from '../lib/badges.js';

describe('the badge on a product card', () => {
  it("uses the product's own badge", () => {
    assert.equal(badgeFor({ badge: 'Popular', category: 'Fresh' }), 'Popular');
    assert.equal(badgeFor({ badge: '  New ', category: 'Fresh' }), 'New');
  });
  it('lets the shop override the Ramadan label with its own words', () => {
    assert.equal(badgeFor({ badge: 'Limited', category: 'Ramadan' }), 'Limited');
  });
  it('calls an unbadged Ramadan box a Ramadan Special', () => {
    assert.equal(badgeFor({ badge: null, category: 'Ramadan' }), 'Ramadan Special');
    assert.equal(badgeFor({ badge: '', category: 'Ramadan' }), 'Ramadan Special');
  });
  it('shows no badge, and never invents praise, for anything else', () => {
    for (const product of [{ badge: null, category: 'Fresh' }, { badge: undefined, category: 'Fitness' }, { badge: '   ', category: 'Seasonal' }, { category: null }]) {
      assert.equal(badgeFor(product), null);
    }
  });
});
