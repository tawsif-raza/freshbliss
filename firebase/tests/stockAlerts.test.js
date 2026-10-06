'use strict';

// When the shop is told a box is running out. Run: npm run test:unit   (no emulator, no network)

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_THRESHOLD, stockAlertFor } = require('../functions/shared/stockAlerts');

const p = (stock, extra = {}) => ({ name: 'Classic Fresh Mix', stock, active: true, ...extra });

describe('stockAlertFor', () => {
  it('says LOW_STOCK once, when stock first falls to the threshold or below', () => {
    assert.equal(DEFAULT_THRESHOLD, 5);
    assert.equal(stockAlertFor(p(6), p(5)), 'LOW_STOCK');
    assert.equal(stockAlertFor(p(8), p(3)), 'LOW_STOCK', 'a big order can jump straight past the line');
    assert.equal(stockAlertFor(p(5), p(4)), null, 'already low: no second message for the next sale');
    assert.equal(stockAlertFor(p(4), p(2)), null);
  });

  it('says OUT_OF_STOCK when stock reaches zero, even if it was already low', () => {
    assert.equal(stockAlertFor(p(1), p(0)), 'OUT_OF_STOCK');
    assert.equal(stockAlertFor(p(20), p(0)), 'OUT_OF_STOCK');
    assert.equal(stockAlertFor(p(0), p(0)), null, 'still zero: nothing new');
  });

  it('says nothing when stock goes up, stays the same, or something else about the product changed', () => {
    assert.equal(stockAlertFor(p(0), p(25)), null, 'restocked');
    assert.equal(stockAlertFor(p(3), p(3, { price: 99 })), null, 'a price edit on a low-stock box');
    assert.equal(stockAlertFor(p(30), p(29)), null);
  });

  it('follows the threshold it is given, and ignores a nonsense threshold', () => {
    assert.equal(stockAlertFor(p(11), p(10), 10), 'LOW_STOCK');
    assert.equal(stockAlertFor(p(6), p(5), 2), null);
    for (const bad of [0, -1, 2.5, '5', null, NaN]) assert.equal(stockAlertFor(p(6), p(5), bad), 'LOW_STOCK', `threshold ${String(bad)} falls back to ${DEFAULT_THRESHOLD}`);
  });

  it('says nothing for a product that is switched off, was just created or was deleted', () => {
    assert.equal(stockAlertFor(p(6), p(2, { active: false })), null);
    assert.equal(stockAlertFor(undefined, p(2)), null);
    assert.equal(stockAlertFor(p(6), undefined), null);
  });

  it('never guesses from a missing or broken stock field', () => {
    for (const bad of [undefined, null, '3', 2.5, -1, NaN]) {
      assert.equal(stockAlertFor(p(bad), p(0)), null, `before: ${String(bad)}`);
      assert.equal(stockAlertFor(p(9), p(bad)), null, `after: ${String(bad)}`);
    }
  });
});
