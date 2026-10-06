// The "Product Specifications" facts of a product: ingredients and allergens, nutrition, the brand or farm story,
// and shelf life. Pure functions (no React, no Firebase), so they are easy to test.
//
// All of these are optional fields the shop owner fills in Firestore. A missing or malformed one becomes
// null / '' and the product page leaves that row out; we never make up a fact.
//
//   ingredientsText  the ingredients as a label would say them, for example "100% Organic A2 Cow Milk"
//                    (the older `ingredients` LIST of item names is kept: it feeds the description and search)
//   allergens        for example "Contains milk."
//   nutrition        { per: 'Per 100 ml', rows: [{ label: 'Energy', value: '62 kcal' }, ...] }. A list, not a map,
//                    because Firestore does not keep the order of a map's keys and Energy must come first.
//                    A string like "Energy: 62 kcal | Protein: 3.2g" (the "|"-separated form) is read too.
//   brandStory       a short paragraph about the farm or the sourcing
//   shelfLife        for example "Best before 4 days from packaging"

const LIMITS = { ingredientsText: 300, allergens: 200, brandStory: 700, shelfLife: 160, label: 40, value: 40, per: 60 };
const MAX_ROWS = 15;

const clean = (value, max) => {
  if (typeof value !== 'string') return '';
  const text = value.replace(/\s+/g, ' ').trim();
  return text.slice(0, max);
};

export const normaliseSpecText = (value, field) => clean(value, LIMITS[field] ?? 200) || null;

// "Energy: 62 kcal | Protein: 3.2g"  ->  [{ label: 'Energy', value: '62 kcal' }, { label: 'Protein', value: '3.2g' }]
function rowsFromString(text) {
  return text
    .split('|')
    .map((part) => {
      const at = part.indexOf(':');
      return at > 0 ? { label: clean(part.slice(0, at), LIMITS.label), value: clean(part.slice(at + 1), LIMITS.value) } : null;
    })
    .filter(Boolean);
}

// -> { per: string, rows: [{ label, value }] }, or null when there is nothing usable.
export function normaliseNutrition(input) {
  let per = '';
  let rows = [];

  if (typeof input === 'string') {
    rows = rowsFromString(input);
  } else if (input && typeof input === 'object' && !Array.isArray(input)) {
    per = clean(input.per, LIMITS.per);
    const source = input.rows ?? input.facts;
    if (Array.isArray(source)) rows = source.map((r) => ({ label: clean(r?.label, LIMITS.label), value: clean(r?.value, LIMITS.value) }));
    else if (typeof source === 'string') rows = rowsFromString(source);
    else if (source && typeof source === 'object') rows = Object.entries(source).map(([label, value]) => ({ label: clean(label, LIMITS.label), value: clean(String(value ?? ''), LIMITS.value) }));
  }

  rows = rows.filter((r) => r.label && r.value).slice(0, MAX_ROWS);
  return rows.length > 0 ? { per, rows } : null;
}

// Which of the four specification rows have something to show. The page draws only those, and no section at all
// when none do.
export function specRows(product) {
  const hasIngredients = Boolean(product.ingredientsText || product.allergens);
  return {
    ingredients: hasIngredients || (product.ingredients?.length ?? 0) > 0,
    nutrition: Boolean(product.nutrition),
    sourcing: Boolean(product.brandStory),
    shelfLife: Boolean(product.shelfLife || product.storage),
  };
}

export const hasSpecs = (product) => Object.values(specRows(product)).some(Boolean);
