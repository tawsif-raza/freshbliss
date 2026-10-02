import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hasHarvestFacts, normaliseBenefits, normaliseCalories, normaliseOrigin } from '../lib/harvest.js';

describe('harvest & health fields', () => {
  it('origin is trimmed text, or null', () => {
    assert.equal(normaliseOrigin('  Ratnagiri  '), 'Ratnagiri');
    for (const bad of [undefined, null, '', '   ', 5, {}]) assert.equal(normaliseOrigin(bad), null);
  });

  it('calories keeps text as written and reads an older whole number as kcal per box', () => {
    assert.equal(normaliseCalories('About 45 kcal per 100 g'), 'About 45 kcal per 100 g');
    assert.equal(normaliseCalories(320), '320 kcal per box');
    for (const bad of [undefined, null, '', 0, -5, 1.5, NaN, []]) assert.equal(normaliseCalories(bad), null);
  });

  it('benefits drops blanks, non-text and repeats, and keeps at most six', () => {
    assert.deepEqual(normaliseBenefits([' Vitamin C ', '', 7, null, 'vitamin c', 'Fibre']), ['Vitamin C', 'Fibre']);
    assert.equal(normaliseBenefits(Array.from({ length: 10 }, (_, i) => `b${i}`)).length, 6);
    for (const bad of [undefined, null, 'Vitamin C', {}]) assert.deepEqual(normaliseBenefits(bad), []);
  });

  it('a legacy product with none of the fields has nothing to show', () => {
    assert.equal(hasHarvestFacts({ origin: null, calories: null, keyBenefits: [] }), false);
    assert.equal(hasHarvestFacts({ origin: null, calories: null }), false);
    assert.equal(hasHarvestFacts({ origin: 'Nagpur', calories: null, keyBenefits: [] }), true);
    assert.equal(hasHarvestFacts({ origin: null, calories: null, keyBenefits: ['Fibre'] }), true);
  });
});
