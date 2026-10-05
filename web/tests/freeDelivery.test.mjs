import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FREE_DELIVERY_THRESHOLD, MARQUEE_ITEMS } from '../content/storefront.js';

// The cart's progress bar, the ticker and the FAQ must all name the same amount.
describe('free delivery copy', () => {
  it('the ticker and the FAQ quote the same threshold as the cart bar', () => {
    const amount = `₹${FREE_DELIVERY_THRESHOLD}`;
    assert.ok(MARQUEE_ITEMS.some((line) => line.includes('Free Bengaluru Delivery') && line.includes(amount)), 'ticker line');
    const faq = readFileSync(new URL('../pages/faq.js', import.meta.url), 'utf8');
    assert.ok(faq.includes(`orders of ${amount} or more qualify for free delivery`), 'FAQ answer');
  });
});
