// Which products a home-page tab shows. Pure functions (no React, no Firebase), so they are easy to test.
//
// A tab (content/storefront.js: CATEGORIES) lists the product `category` values it covers. One tab can cover
// several categories ("Chilled & Dairy" is Ice Cream, Dairy and Cut Fruits). A tab with no categories is "All".

// The categories a tab covers, as a list ([] for the "All" tab).
export const tabCategories = (tab) => (Array.isArray(tab?.categories) ? tab.categories : []);

// Does this product belong under the tab?
export const inTab = (product, tab) => {
  const categories = tabCategories(tab);
  return categories.length === 0 || categories.includes(product.category);
};

export const productsInTab = (products, tab) => products.filter((product) => inTab(product, tab));

// How many products each tab holds, so a tab is never a surprise: { all: 13, fresh: 2, ... }.
export const countByTab = (products, tabs) => Object.fromEntries(tabs.map((tab) => [tab.id, productsInTab(products, tab).length]));

// The "Shop by category" tiles on the home page (components/ShopByCategory.js): one per tab that really holds boxes, each with
// a photo taken from a box in it (a box that is in stock is preferred, so the picture is never of something sold out),
// its name, how many boxes it holds and where it leads. The "All" tab is not a tile. A tab with no boxes, or whose boxes have
// no photo, is left out rather than shown empty. Returns [{ id, label, count, image, alt, href }] in the tabs' order.
export function categoryTiles(products, tabs) {
  const tiles = [];
  for (const tab of tabs) {
    if (tabCategories(tab).length === 0) continue; // "All"
    const inside = productsInTab(products, tab);
    const pick = inside.find((p) => p.stock > 0 && p.images?.[0]) ?? inside.find((p) => p.images?.[0]);
    if (!pick) continue;
    tiles.push({ id: tab.id, label: tab.label, count: inside.length, image: pick.images[0], alt: `${pick.name}, one of our ${tab.label.toLowerCase()}`, href: `/?category=${tab.id}#shop` });
  }
  return tiles;
}
