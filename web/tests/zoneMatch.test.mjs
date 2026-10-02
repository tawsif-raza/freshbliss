// Run: npm test   (from web/)   Pure logic only: no browser, no Firebase.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseZone, matchZone, deliveryFeeFor, describeEta, feeLabel, PINCODE } from '../lib/zoneMatch.js';

// The same zones the seed script creates.
const A = normaliseZone('A', { name: 'Zone A', fee: 0, etaMin: 30, etaMax: 45, match: { regex: '^5600\\d{2}$' }, priority: 1, freeDeliveryFrom: null, active: true });
const B = normaliseZone('B', { name: 'Zone B', fee: 30, etaMin: 45, etaMax: 60, match: { regex: '^560\\d{3}$' }, priority: 2, freeDeliveryFrom: null, active: true });
const zones = [B, A]; // deliberately in the wrong order

describe('which zone serves a pincode', () => {
  it('Zone A: 5600xx, free', () => {
    for (const p of ['560001', '560099', '560034']) assert.equal(matchZone(zones, p).id, 'A', p);
  });
  it('Zone B: any other 560xxx, Rs 30. The narrower Zone A wins where both match', () => {
    for (const p of ['560100', '560103', '560500', '560999']) assert.equal(matchZone(zones, p).id, 'B', p);
  });
  it('outside the area: no zone', () => {
    for (const p of ['110001', '400001', '561000', '559999']) assert.equal(matchZone(zones, p), null, p);
  });
  it('anything that is not exactly six digits matches nothing', () => {
    for (const p of ['', '5600', '56000', '5600011', '56000a', ' 560001', '560 001', undefined, null, 560001]) assert.equal(matchZone(zones, p), null, String(p));
    assert.ok(PINCODE.test('560001') && !PINCODE.test('56000'));
  });
  it('a zone with a broken pattern is skipped, not fatal', () => {
    const broken = normaliseZone('X', { fee: 5, match: { regex: '([' }, priority: 0, active: true });
    assert.equal(matchZone([broken, ...zones], '560001').id, 'A');
  });
  it('no zones at all (still loading) matches nothing', () => assert.equal(matchZone([], '560001'), null));
});

describe('normaliseZone', () => {
  it('drops zones that are switched off or cannot be priced safely', () => {
    assert.equal(normaliseZone('x', { fee: 0, match: { regex: 'a' }, active: false }), null);
    assert.equal(normaliseZone('x', { fee: -1, match: { regex: 'a' }, active: true }), null);
    assert.equal(normaliseZone('x', { fee: '30', match: { regex: 'a' }, active: true }), null);
    assert.equal(normaliseZone('x', { fee: 0, active: true }), null);
    assert.equal(normaliseZone('x', undefined), null);
  });
  it('fills in sensible defaults', () => {
    const z = normaliseZone('Z', { fee: 20, match: { regex: '^1$' }, active: true });
    assert.deepEqual([z.name, z.priority, z.etaMin, z.etaMax, z.freeDeliveryFrom], ['Z', 999, null, null, null]);
  });
});

describe('the delivery fee', () => {
  it('is the zone fee, shown as Free or a rupee amount', () => {
    assert.equal(deliveryFeeFor(A, 100), 0);
    assert.equal(deliveryFeeFor(B, 100), 30);
    assert.equal(feeLabel(0), 'Free');
    assert.equal(feeLabel(30), '₹30');
    assert.equal(deliveryFeeFor(null, 100), null);
  });
  it('becomes free once the subtotal reaches the zone free-delivery threshold', () => {
    const z = { ...B, freeDeliveryFrom: 500 };
    assert.equal(deliveryFeeFor(z, 499), 30);
    assert.equal(deliveryFeeFor(z, 500), 0);
  });
});

describe('the delivery estimate', () => {
  it('reads naturally', () => {
    assert.equal(describeEta(A), '30 to 45 minutes');
    assert.equal(describeEta({ etaMin: 40, etaMax: 40 }), '40 minutes');
    assert.equal(describeEta({ etaMin: null, etaMax: 60 }), 'Within 60 minutes');
    assert.equal(describeEta({ etaMin: 20, etaMax: null }), 'About 20 minutes');
    assert.equal(describeEta({ etaMin: null, etaMax: null }), '');
    assert.equal(describeEta(null), '');
  });
});
