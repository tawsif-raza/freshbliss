import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FREE_DELIVERY_THRESHOLD, MARQUEE_ITEMS } from '../content/storefront.js';

// The cart's progress bar, the ticker and the FAQ must all name the same amount.
describe('free delivery copy', () => {
  it('the ticker and the FAQ quote the same threshold as the cart bar', () => {
    const amount = `₹${FREE_DELIVERY_THRESHOLD}`;
    assert.ok(MARQUEE_ITEMS.some(({ text }) => text.includes('Free Bengaluru Delivery') && text.includes(amount)), 'ticker line');
    const faq = readFileSync(new URL('../pages/faq.js', import.meta.url), 'utf8');
    assert.ok(faq.includes(`orders of ${amount} or more qualify for free delivery`), 'FAQ answer');
  });
});

// The cart bar says "free delivery unlocked" at FREE_DELIVERY_THRESHOLD, but the fee itself is decided by each zone's
// `freeDeliveryFrom`. If a zone that charges a fee does not match, the bar promises something checkout does not give.
describe('free delivery in the seed delivery zones', () => {
  it('every zone that charges a fee waives it from the same amount the cart bar promises', () => {
    const { buildZones } = createRequire(import.meta.url)('../../firebase/scripts/seed.js');
    const charging = buildZones().filter((zone) => zone.active && zone.fee > 0);
    assert.ok(charging.length > 0, 'the seed has a zone that charges a fee');
    for (const zone of charging) {
      assert.equal(zone.freeDeliveryFrom, FREE_DELIVERY_THRESHOLD, `${zone.name} freeDeliveryFrom`);
    }
  });
});
