'use strict';

// Seed script: fills Firestore with launch products, delivery zones and one
// demo promo code so the UI has something to show.
//
//   npm run seed                 -> seeds the LOCAL EMULATOR (default, safe)
//   npm run seed -- --remote     -> seeds a real project (guarded, see below)
//
// Safety guard (so this can never wipe production by accident):
//   * Default mode ALWAYS points at the local emulator. If you have no
//     emulator running, it just fails to connect; it cannot reach a real project.
//   * Remote mode needs all of these: the --remote flag, a project id that does
//     not start with "demo-", and SEED_CONFIRM_PROJECT=<that project id>.
//   * Even then it only ADDS missing documents; it never overwrites one.
//     (In the emulator it does overwrite, so you can reset stock any time.)

const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { resolveTarget: resolveTargetFor } = require('./lib/target');

// ---------- the data ----------

const SIZES = [
  { id: 'regular', label: 'Regular', extra: 0 },
  { id: 'large', label: 'Large', extra: 50 },
];

// The first four are the launch boxes from the storefront design. The fifth is
// extra test data with stock 0, so you can see the "Out of stock" state. The next four are the premium
// range, and the last four the "Chilled & Dairy" range. Both have "Harvest & Health" facts (the product page
// leaves that section out when a product has none):
//   origin       where it was grown (text)
//   calories     energy, as text ("About 45 kcal per 100 g": standard reference values for the fruit, not a
//                lab measurement of the box)
//   keyBenefits  short phrases
//   storage      only on the chilled and frozen products: how to keep it (text). The product page shows it as a
//                temperature badge, and leaves it out when there is none.
// PLACEHOLDER CONTENT: check every origin, calorie figure and benefit against your real suppliers and
// boxes before launch (docs/GO_LIVE.md, section 8.3).
// The "Product Specifications" facts, for EVERY product: how the ingredients read on a label, allergens, nutrition,
// the sourcing story and shelf life. The product page shows each as a row of an accordion and leaves out any row
// a product does not have.
//   ingredientsText  the ingredients as one line (the `ingredients` LIST above stays: it feeds the description)
//   allergens        only where a real allergen is in the box (milk, nuts)
//   nutrition        { per, rows: [{ label, value }] }: a LIST, because Firestore does not keep map key order
//   brandStory       a short story of where it comes from; it names no farm or person we cannot know
//   shelfLife        how long it keeps
// Nutrition figures are TYPICAL REFERENCE VALUES for the named fruit, averaged for the box (equal parts unless
// the `per` text says otherwise), not lab results. The Energy row matches the `calories` text of the same product.
// PLACEHOLDER CONTENT: replace the nutrition with your suppliers' figures, and check every story, claim and
// shelf life, before launch (docs/GO_LIVE.md).
const table = (per, pairs) => ({ per, rows: pairs.map(([label, value]) => ({ label, value })) });
const FRUIT_SHELF_LIFE = 'Consume within 3 days of delivery. Keep refrigerated.';
const NO_ADDITIVES = 'No added sugar, preservatives or colours.';

const SPECS = {
  'classic-fresh-mix': {
    ingredientsText: `Watermelon, pineapple, grapes and kiwi, freshly cut. ${NO_ADDITIVES}`,
    nutrition: table('Per 100 g (estimate for an equal-parts mix)', [['Energy', '53 kcal'], ['Protein', '0.7 g'], ['Carbohydrate', '13.4 g'], ['of which sugars', '10.2 g'], ['Dietary fibre', '1.4 g'], ['Fat', '0.3 g'], ['Vitamin C', '38 mg']]),
    brandStory: 'Watermelon and pineapple for sweetness, grapes for juiciness and kiwi for a sharp, vitamin C-rich lift. We buy from independent growers across Karnataka and Maharashtra, then cut and pack each box fresh for your order.',
    shelfLife: FRUIT_SHELF_LIFE,
  },
  'tropical-bliss': {
    ingredientsText: `Mango, pineapple, papaya and kiwi, freshly cut. ${NO_ADDITIVES}`,
    nutrition: table('Per 100 g (estimate for an equal-parts mix)', [['Energy', '54 kcal'], ['Protein', '0.7 g'], ['Carbohydrate', '13.4 g'], ['of which sugars', '10.1 g'], ['Dietary fibre', '1.9 g'], ['Fat', '0.3 g'], ['Vitamin C', '59 mg']]),
    brandStory: 'A tropical mix of mangoes and papayas from partner orchards in Karnataka and Maharashtra, with sweet pineapple and bright kiwi. Cut fresh and packed for your order.',
    shelfLife: FRUIT_SHELF_LIFE,
  },
  'gym-fuel-pack': {
    ingredientsText: `Apple, banana, mixed berries and nuts. ${NO_ADDITIVES}`,
    allergens: 'Contains nuts.',
    nutrition: table('Per 100 g (estimate for a fruit mix with about 10% nuts)', [['Energy', '117 kcal'], ['Protein', '2.8 g'], ['Carbohydrate', '17.5 g'], ['of which sugars', '10.2 g'], ['Dietary fibre', '3.5 g'], ['Fat', '5.2 g'], ['Vitamin C', '7 mg']]),
    brandStory: 'Fruit for quick energy and nuts for staying power, packed for training days. The fruit comes from partner growers across Karnataka and Maharashtra, and every box is packed fresh for your order.',
    shelfLife: FRUIT_SHELF_LIFE,
  },
  'ramadan-special-box': {
    ingredientsText: `Dates, pomegranate and mixed fresh fruit. ${NO_ADDITIVES}`,
    nutrition: table('Per 100 g (estimate based on the dates and pomegranate in the box)', [['Energy', '180 kcal'], ['Protein', '1.8 g'], ['Carbohydrate', '46.9 g'], ['of which sugars', '40.1 g'], ['Dietary fibre', '5.4 g'], ['Fat', '0.7 g'], ['Vitamin C', '5 mg']]),
    brandStory: 'Dates and fresh fruit chosen for breaking the fast: natural sugars for quick energy, and pomegranate for something cool and juicy. Sourced from partner growers and packed fresh for iftar.',
    shelfLife: FRUIT_SHELF_LIFE,
  },
  'mango-season-box': {
    ingredientsText: `Alphonso mango, papaya and pineapple, freshly cut. ${NO_ADDITIVES}`,
    nutrition: table('Per 100 g (estimate for an equal-parts mix)', [['Energy', '51 kcal'], ['Protein', '0.6 g'], ['Carbohydrate', '13.0 g'], ['of which sugars', '10.5 g'], ['Dietary fibre', '1.6 g'], ['Fat', '0.3 g'], ['Vitamin C', '48 mg']]),
    brandStory: 'Made for mango season: Alphonso mangoes from partner orchards, with papaya and pineapple. Available while the harvest lasts, cut fresh and packed for your order.',
    shelfLife: FRUIT_SHELF_LIFE,
  },
  'exotic-berry-medley': {
    ingredientsText: 'Blueberries, raspberries and strawberries. Nothing added.',
    nutrition: table('Per 100 g (estimate for an equal-parts mix)', [['Energy', '47 kcal'], ['Protein', '0.9 g'], ['Carbohydrate', '11.4 g'], ['of which sugars', '6.4 g'], ['Dietary fibre', '3.6 g'], ['Fat', '0.4 g'], ['Vitamin C', '32 mg']]),
    brandStory: 'Grown in the cool hills around Mahabaleshwar in Maharashtra, where the climate suits delicate berries. They are soft and short-lived, so we pack them fresh for your order.',
    shelfLife: FRUIT_SHELF_LIFE,
  },
  'citrus-immunity-shield': {
    ingredientsText: 'Oranges, grapefruits and lemons. Whole fruit, nothing added.',
    nutrition: table('Per 100 g (estimate for an equal-parts mix)', [['Energy', '39 kcal'], ['Protein', '0.9 g'], ['Carbohydrate', '10.6 g'], ['of which sugars', '6.3 g'], ['Dietary fibre', '2.3 g'], ['Fat', '0.2 g'], ['Vitamin C', '46 mg']]),
    brandStory: 'Oranges, grapefruits and lemons from the orchards around Nagpur, the heart of India\'s orange country. A box of citrus for vitamin C, juice and zest.',
    shelfLife: FRUIT_SHELF_LIFE,
  },
  'midnight-mango-indulgence': {
    ingredientsText: 'Alphonso and Hapus mangoes. Nothing added.',
    nutrition: table('Per 100 g', [['Energy', '60 kcal'], ['Protein', '0.8 g'], ['Carbohydrate', '15.0 g'], ['of which sugars', '13.7 g'], ['Dietary fibre', '1.6 g'], ['Fat', '0.4 g'], ['Vitamin C', '36 mg']]),
    brandStory: 'Alphonso mangoes from Ratnagiri on the Konkan coast, the region famous for them. Each mango is selected for aroma and sweetness, for the days when only a really good mango will do.',
    shelfLife: FRUIT_SHELF_LIFE,
  },
  'keto-green-pack': {
    ingredientsText: `Avocados, green apples and kiwi. ${NO_ADDITIVES}`,
    nutrition: table('Per 100 g (estimate for an equal-parts mix)', [['Energy', '91 kcal'], ['Protein', '1.1 g'], ['Carbohydrate', '12.3 g'], ['of which sugars', '6.7 g'], ['Dietary fibre', '4.0 g'], ['Fat', '5.1 g'], ['Vitamin C', '36 mg']]),
    brandStory: 'Creamy avocados from the hills of Coorg, with tart green apples and kiwi: a low-sugar box built around healthy fats and fibre.',
    shelfLife: FRUIT_SHELF_LIFE,
  },
  'madagascar-vanilla-ice-cream': {
    ingredientsText: 'Fresh cream, milk, cane sugar and Madagascar vanilla beans. No artificial flavours or colours.',
    allergens: 'Contains milk.',
    nutrition: table('Per 100 g', [['Energy', '207 kcal'], ['Protein', '3.5 g'], ['Carbohydrate', '23.6 g'], ['of which sugars', '21.2 g'], ['Fat', '11.0 g'], ['Calcium', '128 mg']]),
    brandStory: 'Churned in small batches in Bengaluru from fresh cream and whole vanilla beans from Madagascar, home of the world\'s best-known vanilla. Real vanilla, a creamy texture and nothing artificial.',
    shelfLife: 'Best before 3 months from packaging when kept frozen at -18°C. Do not refreeze once melted.',
  },
  'a2-organic-farm-milk': {
    ingredientsText: '100% Organic A2 Cow Milk',
    allergens: 'Contains milk.',
    nutrition: table('Per 100 ml', [['Energy', '62 kcal'], ['Protein', '3.2 g'], ['Carbohydrate', '4.8 g'], ['of which sugars (lactose)', '4.8 g'], ['Fat', '3.3 g'], ['Calcium', '120 mg']]),
    brandStory: 'Our A2 milk comes from Gir cows, an indigenous Indian breed, that graze freely on open pasture at a partner dairy farm near Bengaluru. The milk is chilled straight after milking and delivered fresh to your door.',
    shelfLife: 'Best before 4 days from packaging when kept refrigerated below 4°C.',
  },
  'cold-pressed-orange-juice': {
    ingredientsText: '100% cold-pressed Valencia orange juice. No added sugar, water or preservatives.',
    nutrition: table('Per 100 ml', [['Energy', '45 kcal'], ['Protein', '0.7 g'], ['Carbohydrate', '10.2 g'], ['of which sugars', '8.4 g'], ['Fat', '0.2 g'], ['Vitamin C', '50 mg']]),
    brandStory: 'Valencia oranges from the orchards around Nagpur, pressed cold in small batches. Cold-pressing is gentler than heating, so the juice keeps the fresh taste of the fruit.',
    shelfLife: 'Best before 3 days from pressing. Shake well, and finish within 24 hours of opening.',
  },
  'chilled-watermelon-mint-bowl': {
    ingredientsText: 'Fresh watermelon cubes and mint leaves. Nothing added.',
    nutrition: table('Per 100 g', [['Energy', '30 kcal'], ['Protein', '0.6 g'], ['Carbohydrate', '7.6 g'], ['of which sugars', '6.2 g'], ['Dietary fibre', '0.4 g'], ['Fat', '0.2 g'], ['Vitamin C', '8 mg']]),
    brandStory: 'Sweet watermelons from partner farms in Karnataka, cut fresh every morning and tossed with mint, ready to eat straight from the fridge.',
    shelfLife: 'Best consumed within 2 days of packing. Keep refrigerated.',
  },
};

function buildProducts() {
  const box = (slug, name, ingredients, price, stock, category, badge, harvest = {}) => ({
    slug,
    name,
    description: ingredients.join(', '),
    ingredients,
    price, // whole rupees
    stock,
    category,
    badge, // null when there is no badge
    sizes: SIZES,
    images: [], // no photos supplied yet
    deliveryTime: 'Within 1 hour',
    active: true,
    ...SPECS[slug],
    ...harvest,
  });
  return [
    box('classic-fresh-mix', 'Classic Fresh Mix', ['Watermelon', 'Pineapple', 'Grapes', 'Kiwi'], 149, 25, 'Fresh', 'Popular'),
    box('tropical-bliss', 'Tropical Bliss', ['Mango', 'Pineapple', 'Papaya', 'Kiwi'], 179, 18, 'Fresh', 'New'),
    box('gym-fuel-pack', 'Gym Fuel Pack', ['Apple', 'Banana', 'Berries', 'Nuts'], 159, 4, 'Fitness', 'Fitness'),
    box('ramadan-special-box', 'Ramadan Special Box', ['Dates', 'Fruits', 'Pomegranate', 'Mixed'], 199, 12, 'Ramadan', 'Limited'),
    box('mango-season-box', 'Mango Season Box', ['Alphonso Mango', 'Papaya', 'Pineapple'], 229, 0, 'Seasonal', null),
    box('exotic-berry-medley', 'Exotic Berry Medley', ['Blueberries', 'Raspberries', 'Strawberries'], 349, 14, 'Exotics', 'New', {
      origin: 'Sourced from the Mahabaleshwar hills',
      calories: 'About 47 kcal per 100 g',
      keyBenefits: ['High in antioxidants', 'Rich in vitamin C', 'Good source of fibre'],
    }),
    box('citrus-immunity-shield', 'Citrus Immunity Shield', ['Oranges', 'Grapefruits', 'Lemons'], 189, 20, 'Immunity', 'New', {
      origin: 'Sourced from the orchards of Nagpur',
      calories: 'About 39 kcal per 100 g',
      keyBenefits: ['Rich in vitamin C', 'Supports immunity', 'Naturally hydrating'],
    }),
    box('midnight-mango-indulgence', 'Midnight Mango Indulgence', ['Alphonso Mango', 'Hapus Mango'], 399, 10, 'Exotics', 'New', {
      origin: 'Sourced from Ratnagiri, on the Konkan coast',
      calories: 'About 60 kcal per 100 g',
      keyBenefits: ['Rich in vitamin A', 'Source of vitamin C', 'Naturally sweet'],
    }),
    box('keto-green-pack', 'The Keto Green Pack', ['Avocados', 'Green Apples', 'Kiwi'], 279, 12, 'Fitness', 'New', {
      origin: 'Sourced from the hills of Coorg',
      calories: 'About 91 kcal per 100 g',
      keyBenefits: ['Healthy fats', 'Low in sugar', 'High in fibre'],
    }),
    box('madagascar-vanilla-ice-cream', 'Madagascar Vanilla Bean Ice Cream', ['Fresh Cream', 'Milk', 'Madagascar Vanilla Beans', 'Cane Sugar'], 349, 15, 'Ice Cream', 'New', {
      origin: 'Vanilla beans from Madagascar, churned in small batches in Bengaluru',
      calories: 'About 207 kcal per 100 g',
      keyBenefits: ['Real vanilla bean', 'Made with fresh cream', 'No artificial colours'],
      storage: 'Keep Frozen at -18°C',
    }),
    box('a2-organic-farm-milk', 'A2 Organic Farm Milk', ['A2 Organic Cow Milk'], 99, 30, 'Dairy', 'New', {
      origin: 'Sourced from a partner dairy farm near Bengaluru',
      calories: 'About 62 kcal per 100 ml',
      keyBenefits: ['A2 beta-casein milk', 'Good source of calcium', 'Farm fresh'],
      storage: 'Keep Refrigerated below 4°C',
    }),
    box('cold-pressed-orange-juice', 'Cold-Pressed Valencia Orange Juice', ['Valencia Oranges'], 179, 18, 'Beverages', 'New', {
      origin: 'Valencia oranges from the orchards of Nagpur',
      calories: 'About 45 kcal per 100 ml',
      keyBenefits: ['Cold-pressed, never from concentrate', 'Rich in vitamin C', 'No added sugar'],
      storage: 'Keep Refrigerated',
    }),
    box('chilled-watermelon-mint-bowl', 'Chilled Watermelon & Mint Bowl', ['Watermelon', 'Fresh Mint'], 129, 12, 'Cut Fruits', 'New', {
      origin: 'Sourced from partner farms in Karnataka',
      calories: 'About 30 kcal per 100 g',
      keyBenefits: ['Naturally hydrating', 'Low in calories', 'Cut fresh every morning'],
      storage: 'Keep Refrigerated',
    }),
  ];
}

// 5600xx = Zone A (free), any other 560xxx = Zone B (Rs 30). The lowest
// priority number is checked first, so Zone A wins over the wider Zone B.
function buildZones() {
  return [
    { id: 'A', name: 'Zone A', fee: 0, etaMin: 30, etaMax: 45, match: { regex: '^5600\\d{2}$' }, priority: 1, freeDeliveryFrom: null, active: true },
    { id: 'B', name: 'Zone B', fee: 30, etaMin: 45, etaMax: 60, match: { regex: '^560\\d{3}$' }, priority: 2, freeDeliveryFrom: null, active: true },
  ];
}

// A demo code for testing checkout. Server-only collection; clients cannot read it.
// maxUsesPerUser 1 = one use per customer. globalMaxUses null = no total limit. usedCount is kept by the server.
// requiresSignIn is off here so the demo works for guests; set it to true on a real welcome code (docs/GO_LIVE.md).
function buildPromos() {
  return [{ code: 'WELCOME10', type: 'percent', value: 10, min: 199, active: true, expiresAt: null, maxUsesPerUser: 1, globalMaxUses: null, requiresSignIn: false, usedCount: 0 }];
}

// ---------- the safety guard ----------

// Where may we write? The rules live in scripts/lib/target.js (shared with setAdmin.js).
const resolveTarget = (argv, env) =>
  resolveTargetFor(argv, env, { service: 'firestore', confirmVar: 'SEED_CONFIRM_PROJECT', what: 'seed' });

// ---------- writing ----------

// Writes documents in one batch. `overwrite` true = replace (emulator);
// false = only create the ones that are missing (remote). A batch holds up to
// 500 writes; we have about ten.
async function writeDocs(db, collectionName, docs, { overwrite }) {
  const refs = docs.map(({ id }) => db.collection(collectionName).doc(id));
  let toWrite = docs.map((d, i) => ({ ref: refs[i], data: d.data }));
  let skipped = 0;

  if (!overwrite) {
    const snaps = await db.getAll(...refs);
    toWrite = toWrite.filter((_, i) => !snaps[i].exists);
    skipped = docs.length - toWrite.length;
  }

  const batch = db.batch();
  for (const { ref, data } of toWrite) {
    if (overwrite) batch.set(ref, data);
    else batch.create(ref, data);
  }
  await batch.commit();
  console.log(`  ${collectionName}: wrote ${toWrite.length}${skipped ? `, skipped ${skipped} that already exist` : ''}`);
}

async function main() {
  const target = resolveTarget(process.argv.slice(2), process.env);

  // The Admin SDK sends traffic to the emulator whenever this variable is set.
  if (target.emulatorHost) process.env[target.emulatorVar] = target.emulatorHost;

  console.log(
    target.remote
      ? `Seeding REAL project "${target.projectId}" (add-only, nothing is overwritten)`
      : `Seeding the emulator at ${target.emulatorHost} (project "${target.projectId}")`,
  );

  initializeApp({ projectId: target.projectId });
  const db = getFirestore();
  const opts = { overwrite: !target.remote };
  const now = FieldValue.serverTimestamp();

  await writeDocs(
    db,
    'products',
    buildProducts().map((p) => ({ id: p.slug, data: { ...p, createdAt: now, updatedAt: now } })),
    opts,
  );
  await writeDocs(
    db,
    'deliveryZones',
    buildZones().map(({ id, ...rest }) => ({ id, data: rest })),
    opts,
  );
  await writeDocs(
    db,
    'promoCodes',
    buildPromos().map(({ code, ...rest }) => ({ id: code, data: rest })),
    opts,
  );
  console.log('Done.');
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`\nSeed stopped: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { buildProducts, buildZones, buildPromos, resolveTarget };
