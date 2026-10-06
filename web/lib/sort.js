// How the shop page orders and narrows its boxes. Pure functions (no React, no Firebase), so they are easy to test.
//
// Whatever the order chosen, boxes that are SOLD OUT always come last: a visitor sorting by price should not have to scroll
// past boxes they cannot buy. Inside each of the two groups the chosen order applies, and ties keep the catalogue's own order
// (Array.sort is stable), so the list never shuffles for no reason.

export const SORT_OPTIONS = [
  { id: 'featured', label: 'Featured' },
  { id: 'price-asc', label: 'Price: low to high' },
  { id: 'price-desc', label: 'Price: high to low' },
  { id: 'name', label: 'Name: A to Z' },
];

export const isSortId = (id) => SORT_OPTIONS.some((option) => option.id === id);

const byMode = {
  featured: () => 0,
  'price-asc': (a, b) => a.price - b.price,
  'price-desc': (a, b) => b.price - a.price,
  name: (a, b) => String(a.name).localeCompare(String(b.name), 'en', { sensitivity: 'base' }),
};

// A new list; the one passed in is never changed. An unknown mode behaves like "featured".
export function sortProducts(products, mode = 'featured') {
  const compare = byMode[mode] ?? byMode.featured;
  return [...products].sort((a, b) => Number(a.stock <= 0) - Number(b.stock <= 0) || compare(a, b));
}

// Only the boxes that can be bought now (stock above zero), or all of them.
export const filterInStock = (products, inStockOnly) => (inStockOnly ? products.filter((product) => product.stock > 0) : products);
