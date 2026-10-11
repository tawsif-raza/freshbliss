// The "What's in each one" list in the "Why fruit every day" section (components/HealthBenefits.js): every product that
// has `keyBenefits`, in three groups. Pure function, so it is easy to test.
//
// A product without keyBenefits is left out rather than given made-up ones. A group with nothing in it is dropped.

const DRINKS = new Set(['Ramadan Drinks', 'Beverages', 'Dairy']);
const FRUIT = new Set(['Ramadan Fruits', 'Cut Fruits']);

export const BENEFIT_GROUPS = [
  { id: 'fruit', title: 'Fruit' },
  { id: 'drinks', title: 'Drinks and dairy' },
  { id: 'boxes', title: 'Boxes and treats' },
];

export function groupFor(category) {
  if (FRUIT.has(category)) return 'fruit';
  if (DRINKS.has(category)) return 'drinks';
  return 'boxes';
}

// products: the normalised products (lib/product.js), in the order to show them.
// Returns [{ id, title, products: [{ id, name, benefits }] }]; a product's id is also its page address (/products/<id>).
export function benefitGroups(products) {
  const byGroup = Object.fromEntries(BENEFIT_GROUPS.map((g) => [g.id, []]));
  for (const p of products) {
    const benefits = Array.isArray(p.keyBenefits) ? p.keyBenefits.filter((b) => typeof b === 'string' && b.trim() !== '') : [];
    if (benefits.length === 0) continue;
    byGroup[groupFor(p.category)].push({ id: p.id, name: p.name, benefits });
  }
  return BENEFIT_GROUPS.map((g) => ({ ...g, products: byGroup[g.id] })).filter((g) => g.products.length > 0);
}
