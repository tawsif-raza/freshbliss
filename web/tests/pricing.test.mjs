import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TIP_OPTIONS, unitPrice, linesFromOrder, maskPaymentId, shortOrderNumber, previewTotals, formatOrderDate } from '../lib/pricing.js';

const product = { price: 149, sizes: [{ id: 'regular', label: 'Regular', extra: 0 }, { id: 'large', label: 'Large', extra: 50 }] };

describe('prices', () => {
  it('adds the size difference to the base price', () => {
    assert.equal(unitPrice(product, 'regular'), 149);
    assert.equal(unitPrice(product, 'large'), 199);
    assert.equal(unitPrice(product, 'huge'), null);
  });
  it('offers the same tips the server accepts', () => assert.deepEqual(TIP_OPTIONS, [0, 10, 20, 30]));
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
