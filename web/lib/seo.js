// Search-engine structured data (JSON-LD, schema.org) for a fruit box. Pure functions (no React, no Firebase),
// so they are easy to test.
//
// buildProductJsonLd(product) -> a schema.org `Product` object built only from what the page already shows:
// name, description, photos, price (in rupees) and whether it is in stock. Nothing is invented: a missing
// description or photo is simply left out. There is deliberately no rating or review data, because the shop
// has no real reviews yet and made-up ones are against the search engines' rules.
//
// jsonLdString(data) -> the text to put inside <script type="application/ld+json">. The characters that could
// close the script tag early are escaped, so product text can never break out of it.

export function buildProductJsonLd(product) {
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
  if (product.description) data.description = product.description;
  if (product.images?.length > 0) data.image = product.images;
  if (product.category) data.category = product.category;
  return data;
}

export const jsonLdString = (data) => JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
