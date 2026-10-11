// The words on the floating gold badge of a product card. Pure function, so it is easy to test.
//
// The product's own badge ("Popular", "New", "Limited"...) if it has one; anything in the Ramadan range (the box, and
// the "Ramadan Fruits" and "Ramadan Drinks" categories) is called what it is; otherwise no badge at all. We never make up
// praise like "Bestseller": a badge is a claim, and it must come from the shop's data.

const RAMADAN_CATEGORIES = new Set(['Ramadan', 'Ramadan Fruits', 'Ramadan Drinks']);

export function badgeFor(product) {
  if (typeof product.badge === 'string' && product.badge.trim() !== '') return product.badge.trim();
  if (RAMADAN_CATEGORIES.has(product.category)) return 'Ramadan Special';
  return null;
}
