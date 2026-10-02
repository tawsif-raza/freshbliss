// "You may also like": which other boxes to suggest next to the one being viewed.
// Pure function (no React, no Firebase), so it is easy to test.
//
// The aim is a bigger basket, so the suggestions are COMPLEMENTARY first: boxes from a different
// category than the one on screen (a Fitness Pack beside a Seasonal Box), then boxes from the same
// category if there are not enough. Sold-out boxes are never suggested: a "+ Add" that cannot work
// is worse than no suggestion. The list starts after the current box in the shop's own order and wraps
// round, so different boxes show different suggestions instead of everyone seeing the same four.

export const RELATED_LIMIT = 4;

export function pickRelated(products, current, limit = RELATED_LIMIT) {
  const at = products.findIndex((p) => p.id === current.id);
  const rotated = at < 0 ? products : [...products.slice(at + 1), ...products.slice(0, at)];

  const buyable = rotated.filter((p) => p.id !== current.id && p.stock > 0);
  const complementary = buyable.filter((p) => p.category !== current.category);
  const similar = buyable.filter((p) => p.category === current.category);
  return [...complementary, ...similar].slice(0, limit);
}
