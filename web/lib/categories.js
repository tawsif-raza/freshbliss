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
