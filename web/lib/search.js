// Instant search over the products already loaded in the browser (no server call). Used by the Ctrl/Cmd+K
// command palette. Pure functions (no React, no Firebase), so they are easy to test.
//
// A box matches when EVERY word typed appears in its name, category, badge or ingredients (so "mango box"
// finds "Mango Season Box" and "citrus lemon" finds the Citrus Immunity Shield). Name matches rank first, with
// names that START with the query on top; boxes that are in stock come before sold-out ones.

export const MAX_RESULTS = 8;

const norm = (value) => String(value ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').trim();

// Words typed, in lower case and without accents.
const words = (query) => norm(query).split(/\s+/).filter(Boolean);

function score(product, terms) {
  const name = norm(product.name);
  const other = [product.category, product.badge, ...(product.ingredients ?? [])].map(norm).join(' ');
  let total = 0;
  for (const term of terms) {
    if (name.startsWith(term)) total += 3;
    else if (name.split(/\s+/).some((w) => w.startsWith(term))) total += 2;
    else if (name.includes(term)) total += 1.5;
    else if (other.includes(term)) total += 1;
    else return 0; // every word must match something
  }
  return total;
}

// The boxes to list for what was typed. With nothing typed: the first few, in stock first.
export function searchProducts(products, query, limit = MAX_RESULTS) {
  const terms = words(query);
  const inStockFirst = (a, b) => Number(a.stock <= 0) - Number(b.stock <= 0);

  if (terms.length === 0) return [...products].sort(inStockFirst).slice(0, limit);

  return products
    .map((product) => ({ product, s: score(product, terms) }))
    .filter(({ s }) => s > 0)
    .sort((a, b) => inStockFirst(a.product, b.product) || b.s - a.s)
    .slice(0, limit)
    .map(({ product }) => product);
}
