import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TIP_OPTIONS, freeDeliveryProgress, unitPrice, regularUnitPrice, percentOff, linesFromOrder, maskPaymentId, shortOrderNumber, previewTotals, formatOrderDate } from '../lib/pricing.js';

const product = { price: 149, sizes: [{ id: 'regular', label: 'Regular', extra: 0 }, { id: 'large', label: 'Large', extra: 50 }] };

describe('offer prices', () => {
  it('gives the regular price for a size while on offer, and null otherwise', () => {
    const onOffer = { ...product, price: 127, compareAtPrice: 149 };
    assert.equal(regularUnitPrice(onOffer, 'regular'), 149);
    assert.equal(regularUnitPrice(onOffer, 'large'), 199); // the size extra is the same either way
    assert.equal(regularUnitPrice(onOffer, 'huge'), null);
    assert.equal(regularUnitPrice(product, 'regular'), null); // not on offer
    assert.equal(regularUnitPrice({ ...product, compareAtPrice: 149 }, 'regular'), null); // "regular" equal to price is no offer
    assert.equal(regularUnitPrice({ ...product, compareAtPrice: 100 }, 'regular'), null); // nor is a lower one
  });

  it('rounds the percentage down, so the label never promises more than the real saving', () => {
    assert.equal(percentOff(100, 85), 15);
    assert.equal(percentOff(149, 127), 14); // 14.77%
    assert.equal(percentOff(20, 17), 15);
    assert.equal(percentOff(100, 100), 0);
    assert.equal(percentOff(100, 120), 0);
    assert.equal(percentOff(0, 0), 0);
    assert.equal(percentOff(null, 85), 0);
  });
});

describe('prices', () => {
  it('adds the size difference to the base price', () => {
    assert.equal(unitPrice(product, 'regular'), 149);
    assert.equal(unitPrice(product, 'large'), 199);
    assert.equal(unitPrice(product, 'huge'), null);
  });
  it('offers the same tips the server accepts', () => assert.deepEqual(TIP_OPTIONS, [0, 10, 20, 30]));
});

describe('free delivery progress', () => {
  it('fills the bar towards the threshold and says how much is left', () => {
    assert.deepEqual(freeDeliveryProgress(0, 499), { percent: 0, remaining: 499, unlocked: false });
    assert.deepEqual(freeDeliveryProgress(250, 499), { percent: 50, remaining: 249, unlocked: false });
    assert.deepEqual(freeDeliveryProgress(498, 499), { percent: 100, remaining: 1, unlocked: false });
  });
  it('unlocks at exactly the threshold, like the server (>=), and stays full above it', () => {
    assert.deepEqual(freeDeliveryProgress(499, 499), { percent: 100, remaining: 0, unlocked: true });
    assert.deepEqual(freeDeliveryProgress(900, 499), { percent: 100, remaining: 0, unlocked: true });
  });
  it('treats a missing or negative subtotal as an empty cart', () => {
    assert.equal(freeDeliveryProgress(undefined, 499).remaining, 499);
    assert.equal(freeDeliveryProgress(-5, 499).percent, 0);
  });
});

describe('preview totals', () => {
  it('adds subtotal, fee and tip and takes off the discount', () => {
    assert.deepEqual(previewTotals({ subtotal: 298, deliveryFee: 30, discount: 29, tip: 10 }), { subtotal: 298, discount: 29, deliveryFee: 30, tip: 10, total: 309 });
  });
  it('treats an unknown fee as 0 and never goes below 0', () => {
    assert.equal(previewTotals({ subtotal: 100, deliveryFee: null }).total, 100);
    assert.equal(previewTotals({ subtotal: 10, deliveryFee: 0, discount: 50 }).total, 0);
  });
});

describe('reorder lines', () => {
  it('keeps only valid lines', () => {
    const order = {
      items: [
        { productId: 'classic-fresh-mix', size: 'regular', qty: 2, name: 'x', unitPrice: 149 },
        { productId: 'a/b', size: 'regular', qty: 1 },
        { productId: 'ok', size: 'large', qty: 0 },
        { productId: 'ok', size: 'large', qty: 1.5 },
        { productId: 'ok', size: '', qty: 1 },
        null,
        { productId: 'gym-fuel-pack', size: 'large', qty: 1 },
      ],
    };
    assert.deepEqual(linesFromOrder(order), [
      { productId: 'classic-fresh-mix', size: 'regular', qty: 2 },
      { productId: 'gym-fuel-pack', size: 'large', qty: 1 },
    ]);
  });
  it('copes with no items', () => {
    assert.deepEqual(linesFromOrder({}), []);
    assert.deepEqual(linesFromOrder(null), []);
  });
});

describe('the masked payment reference', () => {
  it('shows only the prefix and the last four characters', () => {
    assert.equal(maskPaymentId('pay_Nabcdef123456'), 'pay_••••••3456');
    assert.ok(!maskPaymentId('pay_Nabcdef123456').includes('abcdef'));
  });
  it('hides a short reference completely, and shows nothing when there is none', () => {
    assert.equal(maskPaymentId('pay_1'), '••••');
    for (const v of ['', '   ', null, undefined, 42]) assert.equal(maskPaymentId(v), '');
  });
});

describe('order numbers and dates', () => {
  it('makes a short readable order number', () => {
    assert.equal(shortOrderNumber('aB3dEfGh1JkLmNoPqRsT'), 'FB-MNOPQRST');
    assert.equal(shortOrderNumber(''), '');
    assert.equal(shortOrderNumber(undefined), '');
  });
  it('shows the date in Indian time whatever the viewer time zone is', () => {
    const text = formatOrderDate(new Date('2026-10-02T10:35:00Z')); // 16:05 in India
    assert.match(text, /2 Oct 2026/);
    assert.match(text, /4:05/);
    assert.match(text, /pm/i);
    assert.equal(formatOrderDate(undefined), '');
    assert.equal(formatOrderDate(new Date('nope')), '');
  });
});
