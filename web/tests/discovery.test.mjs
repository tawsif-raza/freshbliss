import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getPairingSuggestion } from '../lib/pairings.js';
import { MAX_RESULTS, searchProducts } from '../lib/search.js';
import { buildProductJsonLd, jsonLdString } from '../lib/seo.js';

const box = (id, name, category, stock = 5, ingredients = []) => ({ id, name, category, stock, ingredients, badge: null });
const PRODUCTS = [
  box('classic-fresh-mix', 'Classic Fresh Mix', 'Fresh', 25, ['Watermelon', 'Kiwi']),
  box('mango-season-box', 'Mango Season Box', 'Seasonal', 0, ['Alphonso Mango']),
  box('midnight-mango-indulgence', 'Midnight Mango Indulgence', 'Exotics', 10, ['Alphonso Mango', 'Hapus Mango']),
  box('citrus-immunity-shield', 'Citrus Immunity Shield', 'Immunity', 20, ['Oranges', 'Lemons']),
];

describe('search', () => {
  it('matches by name, category and ingredient, ignoring case', () => {
    assert.deepEqual(searchProducts(PRODUCTS, 'CITRUS').map((p) => p.id), ['citrus-immunity-shield']);
    assert.deepEqual(searchProducts(PRODUCTS, 'immunity').map((p) => p.id), ['citrus-immunity-shield']);
    assert.deepEqual(searchProducts(PRODUCTS, 'lemon').map((p) => p.id), ['citrus-immunity-shield']);
  });

  it('needs every word to match, and lists in-stock boxes before sold-out ones', () => {
    assert.deepEqual(searchProducts(PRODUCTS, 'mango').map((p) => p.id), ['midnight-mango-indulgence', 'mango-season-box']);
    assert.deepEqual(searchProducts(PRODUCTS, 'mango season').map((p) => p.id), ['mango-season-box']);
    assert.deepEqual(searchProducts(PRODUCTS, 'mango zzz'), []);
  });

  it('with nothing typed lists the first few, in stock first, up to the limit', () => {
    assert.equal(searchProducts(PRODUCTS, '   ').at(-1).id, 'mango-season-box');
    const many = Array.from({ length: 20 }, (_, i) => box(`b${i}`, `Box ${i}`, 'Fresh'));
    assert.equal(searchProducts(many, '').length, MAX_RESULTS);
  });
});

describe('pairings', () => {
  it('picks the recipe by the box slug, with 3 ingredients and 2 steps', () => {
    assert.equal(getPairingSuggestion('mango-season-box').title, 'Mango Coconut Chia Pudding');
    assert.equal(getPairingSuggestion('citrus-immunity-shield').title, 'Morning Ginger Citrus Detox Shot');
    assert.equal(getPairingSuggestion('exotic-berry-medley').title, 'Antioxidant Acai Bowl');
    assert.equal(getPairingSuggestion('classic-fresh-mix').title, 'Fresh Artisanal Fruit Salad');
    assert.equal(getPairingSuggestion(undefined).title, 'Fresh Artisanal Fruit Salad');
    assert.equal(getPairingSuggestion('new-box', 'Immunity').title, 'Morning Ginger Citrus Detox Shot');
    assert.equal(getPairingSuggestion('mango-season-box', 'Immunity').title, 'Mango Coconut Chia Pudding'); // the slug wins
    assert.equal(getPairingSuggestion('new-box', 'Fresh').title, 'Fresh Artisanal Fruit Salad');
    for (const slug of ['mango-x', 'citrus-x', 'berry-x', 'other']) {
      const r = getPairingSuggestion(slug);
      assert.equal(r.ingredients.length, 3);
      assert.equal(r.steps.length, 2);
    }
  });
});

describe('product JSON-LD', () => {
  const product = { id: 'tropical-bliss', name: 'Tropical Bliss', description: 'Mango, Pineapple', price: 179, stock: 3, images: ['https://example.com/a.jpg'], category: 'Fresh' };

  it('describes the box, its price in rupees and its availability', () => {
    const d = buildProductJsonLd(product);
    assert.equal(d['@type'], 'Product');
    assert.equal(d.name, 'Tropical Bliss');
    assert.deepEqual(d.image, ['https://example.com/a.jpg']);
    assert.deepEqual(d.offers, { '@type': 'Offer', price: '179', priceCurrency: 'INR', availability: 'https://schema.org/InStock' });
    assert.equal(buildProductJsonLd({ ...product, stock: 0 }).offers.availability, 'https://schema.org/OutOfStock');
  });

  it('leaves out what is missing instead of inventing it', () => {
    const d = buildProductJsonLd({ ...product, description: '', images: [], category: null });
    assert.equal('description' in d, false);
    assert.equal('image' in d, false);
    assert.equal('category' in d, false);
  });

  it('cannot be broken out of by product text', () => {
    const text = jsonLdString(buildProductJsonLd({ ...product, name: '</script><script>alert(1)</script>' }));
    assert.equal(text.includes('<'), false);
    assert.equal(JSON.parse(text).name, '</script><script>alert(1)</script>');
  });
});
