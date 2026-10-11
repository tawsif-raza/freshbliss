// What search engines and social apps (WhatsApp, Instagram, Facebook, X) read about a page. Pure functions (no
// React, no Firebase), so they are easy to test. Nothing here is invented: a missing description, photo or
// business detail is simply left out.
//
//   siteUrl()                       the shop's public address ("" until it is known: see next.config.mjs)
//   buildMetaTags({...})            the canonical link, Open Graph and Twitter tags for a page (components/Seo.js draws them)
//   buildProductJsonLd(product)     a schema.org `Product`: name, description, photos, price (rupees), stock, link. There is
//                                   deliberately no rating or review data: the shop has no real reviews yet and made-up
//                                   ones are against the search engines' rules.
//   buildOrganizationJsonLd(biz)    a schema.org `Organization` + `WebSite` for the home page, from content/business.js
//   buildSitemapXml / buildRobotsTxt   the text of /sitemap.xml and /robots.txt
//   jsonLdString(data)              the text for <script type="application/ld+json">. The characters that could close
//                                   the script tag early are escaped, so shop text can never break out of it.

const trimSlashes = (s) => String(s ?? '').trim().replace(/\/+$/, '');

// The shop's public address, with no trailing slash, or '' when it is not known (local development).
// next.config.mjs fills NEXT_PUBLIC_SITE_URL from the environment (or Vercel's production domain).
export const siteUrl = () => trimSlashes(process.env.NEXT_PUBLIC_SITE_URL);

// "/products/x" on the shop -> "https://shop/products/x". '' when the shop's address is not known, because a
// relative address is not valid in a canonical link or a share card.
export const absoluteUrl = (path, base = siteUrl()) => (base ? `${trimSlashes(base)}${path.startsWith('/') ? path : `/${path}`}` : '');

// A sentence cut at a word boundary to fit a search result or share card (about 160 characters).
export function clip(text, max = 160) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 30)).replace(/[\s,.;:-]+$/, '')}…`;
}

// ---------- page tags ----------

// Everything a page puts in <head> for sharing and ranking, as plain data:
//   { canonical: 'https://…' | '', meta: [{ key, name?, property?, content }] }
// `path` is the page's own address WITHOUT the query string (so /?category=fitness has the home page as its canonical).
// `product` ({ price, inStock }) adds the price tags WhatsApp and Pinterest use.
export function buildMetaTags({ title, description, path, image, type = 'website', product, base = siteUrl() }) {
  const url = absoluteUrl(path, base);
  const text = clip(description);
  const meta = [];
  const add = (kind, name, content) => {
    if (content !== undefined && content !== null && content !== '') meta.push({ key: `${kind}:${name}`, [kind]: name, content: String(content) });
  };

  add('name', 'description', text);
  add('property', 'og:site_name', 'FreshBliss');
  add('property', 'og:locale', 'en_IN');
  add('property', 'og:type', type);
  add('property', 'og:title', title);
  add('property', 'og:description', text);
  add('property', 'og:url', url);
  add('property', 'og:image', image);
  if (product) {
    add('property', 'product:price:amount', product.price);
    add('property', 'product:price:currency', 'INR');
    add('property', 'product:availability', product.inStock ? 'in stock' : 'out of stock');
  }
  add('name', 'twitter:card', image ? 'summary_large_image' : 'summary');
  add('name', 'twitter:title', title);
  add('name', 'twitter:description', text);
  add('name', 'twitter:image', image);

  return { canonical: url, meta };
}

// ---------- structured data ----------

export function buildProductJsonLd(product, base = siteUrl()) {
  const url = absoluteUrl(`/products/${product.id}`, base);
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    sku: product.id,
    brand: { '@type': 'Brand', name: 'FreshBliss' },
    offers: {
      '@type': 'Offer',
      price: String(product.price),
      priceCurrency: 'INR',
      availability: product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    },
  };
  if (url) {
    data.url = url;
    data.offers.url = url;
  }
  if (product.description) data.description = product.description;
  if (product.images?.length > 0) data.image = product.images;
  if (product.category) data.category = product.category;
  return data;
}

// The shop itself, for the home page. Only what content/business.js really says: the name always, the rest when filled in.
export function buildOrganizationJsonLd(business, base = siteUrl()) {
  const url = absoluteUrl('/', base);
  const org = { '@type': 'Organization', name: business.name, areaServed: 'Bengaluru' };
  if (url) {
    org['@id'] = `${url}#organization`;
    org.url = url;
  }
  if (business.legalName) org.legalName = business.legalName;
  if (business.address) org.address = business.address;
  if (business.supportEmail) org.contactPoint = { '@type': 'ContactPoint', contactType: 'customer support', email: business.supportEmail };

  const graph = [org];
  if (url) graph.push({ '@type': 'WebSite', name: business.name, url, publisher: { '@id': org['@id'] } });
  return { '@context': 'https://schema.org', '@graph': graph };
}

export const jsonLdString = (data) => JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

// ---------- sitemap.xml and robots.txt ----------

// The shop's address for a sitemap or robots.txt request: the configured one, else the address this request came to
// (behind Vercel's proxy that is in the x-forwarded-* headers).
export function requestBase(headers, configured = siteUrl()) {
  if (configured) return configured;
  const first = (v) => String(v ?? '').split(',')[0].trim();
  const host = first(headers['x-forwarded-host'] || headers.host);
  const proto = first(headers['x-forwarded-proto']) === 'http' ? 'http' : 'https';
  return /^[A-Za-z0-9.-]+(:\d{1,5})?$/.test(host) ? `${proto}://${host}` : '';
}

// The pages worth listing. The cart, checkout, account, order and staff pages are left out on purpose.
export const STATIC_PAGES = ['/', '/products', '/faq', '/contact', '/privacy', '/terms', '/refunds'];

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export function buildSitemapXml(base, productIds) {
  const paths = [...STATIC_PAGES, ...productIds.map((id) => `/products/${encodeURIComponent(id)}`)];
  const urls = paths.map((p) => `  <url><loc>${xml(absoluteUrl(p, base))}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

// What /sitemap.xml answers. `products` is null when Firestore could not be reached: that must NOT become a sitemap
// with only the static pages (crawlers would read it as "the products are gone", and the edge would repeat it for
// an hour). A 503 with Retry-After tells them to come back, and is cached only briefly. An empty list is a real answer.
export function sitemapResponse(base, products) {
  if (!products) return { status: 503, headers: { 'Retry-After': '300', 'Cache-Control': 'public, s-maxage=30' }, body: '' };
  return {
    status: 200,
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
    body: buildSitemapXml(base, products.map((p) => p.id)),
  };
}

// Private pages (staff, orders, cart, checkout, account) are kept out of search results with a noindex header
// (vercel.json) instead of "Disallow" here: a crawler that is told not to look can never see the noindex.
export function buildRobotsTxt(base) {
  const lines = ['User-agent: *', 'Allow: /'];
  if (base) lines.push('', `Sitemap: ${absoluteUrl('/sitemap.xml', base)}`);
  return `${lines.join('\n')}\n`;
}
