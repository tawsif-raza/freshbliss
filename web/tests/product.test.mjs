import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseProduct } from '../lib/product.js';

const base = { price: 199, stock: 4, name: 'Classic Fresh Mix', category: 'Fresh' };

describe('normaliseProduct', () => {
  it('refuses a product that cannot be priced', () => {
    for (const price of [undefined, null, '199', 19.5, -1]) assert.equal(normaliseProduct('x', { ...base, price }), null);
  });

  it('a bare product (only price) still gives a complete, safe object', () => {
    const p = normaliseProduct('bare-box', { price: 100 });
    assert.equal(p.name, 'bare-box'); // falls back to the id
    assert.equal(p.description, '');
    assert.deepEqual(p.ingredients, []);
    assert.deepEqual(p.keyBenefits, []);
    assert.equal(p.origin, null);
    assert.equal(p.calories, null);
    assert.equal(p.badge, null);
    assert.equal(p.category, null);
    assert.equal(p.stock, 0);
    assert.deepEqual(p.sizes, [{ id: 'regular', label: 'Regular', extra: 0 }]);
    assert.ok(p.images.length > 0, 'always at least one photo');
    assert.equal(p.placeholderImages, true);
  });

  it('uses placeholder photos when images is missing, empty or full of junk', () => {
    for (const images of [undefined, null, [], '', 'https://a.test/x.jpg', [''], ['   '], [5, null, {}], ['not a link'], ['ftp://a.test/x.jpg']]) {
      const p = normaliseProduct('classic-fresh-mix', { ...base, images });
      assert.equal(p.placeholderImages, true, JSON.stringify(images));
      assert.ok(p.images.every((u) => u.startsWith('https://')));
    }
  });

  it('keeps real photo links (up to four), dropping the junk among them', () => {
    const p = normaliseProduct('x', { ...base, images: ['https://a.test/1.jpg', '', 7, 'http://a.test/2.jpg', 'https://a.test/3.jpg', 'https://a.test/4.jpg', 'https://a.test/5.jpg'] });
    assert.equal(p.placeholderImages, false);
    assert.deepEqual(p.images, ['https://a.test/1.jpg', 'http://a.test/2.jpg', 'https://a.test/3.jpg', 'https://a.test/4.jpg']);
  });

  it('a missing, wrong-typed or messy keyBenefits list never throws', () => {
    for (const keyBenefits of [undefined, null, 'High in fibre', 42, {}, [null, 5, '', '  ']]) {
      assert.deepEqual(normaliseProduct('x', { ...base, keyBenefits }).keyBenefits, []);
    }
    assert.deepEqual(normaliseProduct('x', { ...base, keyBenefits: [' Rich in vitamin C ', 'rich in vitamin c', 'Low sugar'] }).keyBenefits, ['Rich in vitamin C', 'Low sugar']);
  });

  it('reads the storage note, and treats a missing or odd one as none', () => {
    assert.equal(normaliseProduct('x', { ...base, storage: '  Keep Frozen at -18°C ' }).storage, 'Keep Frozen at -18°C');
    for (const storage of [undefined, null, '', '   ', 5, {}, []]) assert.equal(normaliseProduct('x', { ...base, storage }).storage, null);
    assert.equal(normaliseProduct('x', { ...base, storage: 'x'.repeat(200) }).storage.length, 60);
  });

  it('wrong-typed text fields fall back instead of leaking through', () => {
    const p = normaliseProduct('x', { price: 50, name: 12, description: {}, badge: 5, category: [], deliveryTime: 9, origin: 1, calories: [] });
    assert.equal(p.name, 'x');
    assert.equal(p.description, '');
    assert.equal(p.badge, null);
    assert.equal(p.category, null);
    assert.equal(p.deliveryTime, null);
    assert.equal(p.origin, null);
    assert.equal(p.calories, null);
  });
});
