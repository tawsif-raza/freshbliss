import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  STATIC_PAGES,
  absoluteUrl,
  buildMetaTags,
  buildOrganizationJsonLd,
  buildProductJsonLd,
  buildRobotsTxt,
  buildSitemapXml,
  clip,
  jsonLdString,
  requestBase,
  sitemapResponse,
} from '../lib/seo.js';

const BASE = 'https://www.freshbliss.in';
const product = { id: 'mango-box', name: 'Mango Season Box', description: 'Sweet & ripe <mango>', price: 229, stock: 3, category: 'Seasonal', images: ['https://images.unsplash.com/photo-1?w=800'] };
const tag = (tags, key) => tags.meta.find((m) => m.key === key)?.content;

describe('addresses', () => {
  it('absoluteUrl joins the shop address and a path, and is empty when the address is unknown', () => {
    assert.equal(absoluteUrl('/products/x', BASE), `${BASE}/products/x`);
    assert.equal(absoluteUrl('products/x', `${BASE}/`), `${BASE}/products/x`);
    assert.equal(absoluteUrl('/', BASE), `${BASE}/`);
    assert.equal(absoluteUrl('/products/x', ''), '');
  });

  it('requestBase prefers the configured address, else uses the request headers, and refuses a hostile Host', () => {
    assert.equal(requestBase({ host: 'evil.test' }, BASE), BASE);
    assert.equal(requestBase({ host: 'shop.vercel.app' }, ''), 'https://shop.vercel.app');
    assert.equal(requestBase({ 'x-forwarded-host': 'shop.example, other', 'x-forwarded-proto': 'https,http' }, ''), 'https://shop.example');
    assert.equal(requestBase({ host: 'localhost:3000', 'x-forwarded-proto': 'http' }, ''), 'http://localhost:3000');
    for (const host of ['a.test/evil', 'a b', 'a.test"><script>', '']) assert.equal(requestBase({ host }, ''), '', host);
  });
});

describe('clip', () => {
  it('leaves a short text alone and cuts a long one at a word, with an ellipsis, within the limit', () => {
    assert.equal(clip('Fresh fruit.'), 'Fresh fruit.');
    const long = 'Freshly sliced and perfectly packed fruit boxes, delivered across Bengaluru within the hour, '.repeat(4);
    const out = clip(long, 160);
    assert.ok(out.length <= 160);
    assert.ok(out.endsWith('…'));
    assert.ok(!/\s…$/.test(out));
  });
  it('squashes whitespace and copes with nothing', () => {
    assert.equal(clip('a \n  b'), 'a b');
    assert.equal(clip(undefined), '');
  });
});

describe('buildMetaTags', () => {
  const page = { title: 'Mango Season Box | FreshBliss', description: 'Sweet mangoes.', path: '/products/mango-box', image: product.images[0], type: 'product', product: { price: 229, inStock: true }, base: BASE };

  it('gives a canonical link on the shop address, without any query string, for the page itself', () => {
    assert.equal(buildMetaTags(page).canonical, `${BASE}/products/mango-box`);
    assert.equal(tag(buildMetaTags(page), 'property:og:url'), `${BASE}/products/mango-box`);
  });

  it('has the Open Graph and Twitter tags a share card needs, with the photo, and a big-image card', () => {
    const t = buildMetaTags(page);
    assert.equal(tag(t, 'property:og:title'), page.title);
    assert.equal(tag(t, 'property:og:type'), 'product');
    assert.equal(tag(t, 'property:og:image'), page.image);
    assert.equal(tag(t, 'name:twitter:card'), 'summary_large_image');
    assert.equal(tag(t, 'name:twitter:image'), page.image);
    assert.equal(tag(t, 'name:description'), 'Sweet mangoes.');
  });

  it('adds the price tags for a product, saying whether it is in stock', () => {
    assert.equal(tag(buildMetaTags(page), 'property:product:price:amount'), '229');
    assert.equal(tag(buildMetaTags(page), 'property:product:price:currency'), 'INR');
    assert.equal(tag(buildMetaTags(page), 'property:product:availability'), 'in stock');
    assert.equal(tag(buildMetaTags({ ...page, product: { price: 229, inStock: false } }), 'property:product:availability'), 'out of stock');
    assert.equal(tag(buildMetaTags({ ...page, product: undefined }), 'property:product:price:amount'), undefined);
  });

  it('leaves out what it does not know instead of inventing it: no address -> no canonical or og:url; no photo -> small card', () => {
    const t = buildMetaTags({ ...page, base: '', image: undefined });
    assert.equal(t.canonical, '');
    assert.equal(tag(t, 'property:og:url'), undefined);
    assert.equal(tag(t, 'property:og:image'), undefined);
    assert.equal(tag(t, 'name:twitter:card'), 'summary');
    assert.ok(t.meta.every((m) => m.content !== '' && m.content !== undefined));
  });

  it('every tag has a unique key and exactly one of name / property', () => {
    const t = buildMetaTags(page);
    assert.equal(new Set(t.meta.map((m) => m.key)).size, t.meta.length);
    for (const m of t.meta) assert.equal(Number('name' in m) + Number('property' in m), 1);
  });
});

describe('structured data', () => {
  it('Product JSON-LD: price in rupees, stock, photos, and its own address when the shop address is known', () => {
    const ld = buildProductJsonLd(product, BASE);
    assert.equal(ld['@type'], 'Product');
    assert.equal(ld.offers.price, '229');
    assert.equal(ld.offers.priceCurrency, 'INR');
    assert.equal(ld.offers.availability, 'https://schema.org/InStock');
    assert.equal(ld.url, `${BASE}/products/mango-box`);
    assert.equal(ld.offers.url, ld.url);
    assert.deepEqual(ld.image, product.images);
    assert.equal(buildProductJsonLd({ ...product, stock: 0 }, BASE).offers.availability, 'https://schema.org/OutOfStock');
  });

  it('Product JSON-LD never invents: no address -> no url; no description/photo/category -> left out; never ratings or reviews', () => {
    const ld = buildProductJsonLd({ id: 'x', name: 'X', price: 1, stock: 1, images: [] }, '');
    assert.equal('url' in ld, false);
    assert.equal('url' in ld.offers, false);
    for (const key of ['description', 'image', 'category', 'aggregateRating', 'review']) assert.equal(key in ld, false, key);
  });

  it('Organization JSON-LD uses only what content/business.js says', () => {
    const empty = buildOrganizationJsonLd({ name: 'FreshBliss', legalName: '', address: '', supportEmail: '' }, BASE);
    const org = empty['@graph'][0];
    assert.deepEqual(Object.keys(org).sort(), ['@id', '@type', 'areaServed', 'name', 'url']);
    const full = buildOrganizationJsonLd({ name: 'FreshBliss', legalName: 'FreshBliss Foods Pvt Ltd', address: 'Indiranagar, Bengaluru', supportEmail: 'support@freshbliss.in' }, BASE)['@graph'][0];
    assert.equal(full.legalName, 'FreshBliss Foods Pvt Ltd');
    assert.equal(full.address, 'Indiranagar, Bengaluru');
    assert.equal(full.contactPoint.email, 'support@freshbliss.in');
  });

  it('Organization JSON-LD adds the WebSite only when the shop address is known (it needs one)', () => {
    assert.equal(buildOrganizationJsonLd({ name: 'FreshBliss' }, BASE)['@graph'].length, 2);
    assert.equal(buildOrganizationJsonLd({ name: 'FreshBliss' }, '')['@graph'].length, 1);
  });

  it('jsonLdString cannot be used to close the script tag', () => {
    const text = jsonLdString(buildProductJsonLd({ ...product, name: '</script><script>alert(1)</script>' }, BASE));
    assert.ok(!text.includes('</script>'));
    assert.ok(!text.includes('<'));
    assert.equal(JSON.parse(text).name, '</script><script>alert(1)</script>');
  });
});

describe('sitemap.xml and robots.txt', () => {
  it('lists the public pages and every box, with full addresses', () => {
    const xml = buildSitemapXml(BASE, ['mango-box', 'tropical-bliss']);
    for (const p of STATIC_PAGES) assert.ok(xml.includes(`<loc>${absoluteUrl(p, BASE)}</loc>`), p);
    assert.ok(xml.includes(`<loc>${BASE}/products/mango-box</loc>`));
    assert.ok(xml.includes(`<loc>${BASE}/products/tropical-bliss</loc>`));
    assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  });

  it('leaves out the private pages (cart, checkout, account, orders, staff)', () => {
    const xml = buildSitemapXml(BASE, []);
    for (const p of ['/cart', '/checkout', '/account', '/orders', '/admin']) assert.ok(!xml.includes(p), p);
  });

  it('escapes what could break the XML, and encodes odd box ids', () => {
    const xml = buildSitemapXml('https://a.test?x=1&y=2', ['a b', 'a&b']);
    assert.ok(!/&(?!amp;|lt;|gt;|quot;|apos;)/.test(xml));
    assert.ok(xml.includes('/products/a%20b'));
    assert.ok(xml.includes('/products/a%26b'));
  });

  it('sitemapResponse: boxes known -> a normal cached sitemap; empty catalogue is still a real answer', () => {
    const ok = sitemapResponse(BASE, [{ id: 'mango-box' }]);
    assert.equal(ok.status, 200);
    assert.match(ok.headers['Content-Type'], /^application\/xml/);
    assert.match(ok.headers['Cache-Control'], /s-maxage=3600/);
    assert.ok(ok.body.includes(`${BASE}/products/mango-box`));
    assert.equal(sitemapResponse(BASE, []).status, 200);
  });

  it('sitemapResponse: Firestore unreachable (null) -> a short-lived 503, never a sitemap without boxes', () => {
    const down = sitemapResponse(BASE, null);
    assert.equal(down.status, 503);
    assert.equal(down.headers['Retry-After'], '300');
    assert.match(down.headers['Cache-Control'], /s-maxage=30$/);
    assert.equal(down.body, '');
  });

  it('robots.txt lets crawlers in, points at the sitemap, and omits the sitemap line when the address is unknown', () => {
    assert.equal(buildRobotsTxt(BASE), `User-agent: *\nAllow: /\n\nSitemap: ${BASE}/sitemap.xml\n`);
    assert.equal(buildRobotsTxt(''), 'User-agent: *\nAllow: /\n');
  });

  it('robots.txt does not Disallow pages that carry a noindex header (a blocked crawler could never see it)', () => {
    assert.ok(!/Disallow/i.test(buildRobotsTxt(BASE)));
  });
});

describe('policy pages', () => {
  it('terms and refunds are in the sitemap', () => {
    assert.ok(STATIC_PAGES.includes('/terms'));
    assert.ok(STATIC_PAGES.includes('/refunds'));
  });
});
