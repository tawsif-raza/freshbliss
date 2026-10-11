'use strict';

// Seed script: fills Firestore with launch products, delivery zones and one
// demo promo code so the UI has something to show, plus (emulator only) every
// website policy, most of them placeholder text (scripts/policies.js).
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
const { allPolicies } = require('./policies');

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
    ...buildRamadanRange(),
  ];
}

// ---------- the Ramadan range ----------

// Dates, fruit and drinks for iftar and suhoor, shown together under the "Ramadan Specials" tab with the Ramadan Special
// Box (web/content/storefront.js covers the categories "Ramadan", "Ramadan Fruits" and "Ramadan Drinks").
//
// RAMADAN PRICES: each one is sold at RAMADAN_DISCOUNT off its regular price. The regular price is kept as
// `compareAtPrice`, which the storefront shows crossed out with the saving (web/components/PriceTag.js); `price` is the
// reduced one, and it is the only figure the server ever charges. To end the offer in the live shop, set each product's
// `price` back to its `compareAtPrice` and delete `compareAtPrice` (Firestore console).
//
// One pack size each (the size label says how much), so the saving is exactly the same on every pack.
//
// PLACEHOLDER CONTENT: check every price, pack size, recipe, shelf life and claim against what the shop really sells
// before launch (docs/GO_LIVE.md, section 8.3). Nutrition is TYPICAL REFERENCE VALUES for the fruit, and an ESTIMATE
// for the drinks (the `per` text says which), not lab results. Rooh Afza is a Hamdard product: only sell it under that
// name if it is the real syrup.
// Rounded DOWN to the rupee, so every product saves at least the full 15% (and its card says "15% off", never 14%).
const RAMADAN_DISCOUNT = 0.15;
const ramadanPrice = (regular) => Math.floor(regular * (1 - RAMADAN_DISCOUNT));

const CUT_FRUIT_SHELF_LIFE = 'Cut fresh for your order. Eat within 2 days. Keep refrigerated.';
const FRESH_DRINK_SHELF_LIFE = 'Made fresh on the day of delivery. Keep refrigerated and drink within 24 hours.';
const FRUIT_STORY = 'Chosen ripe from our partner growers across Karnataka and Maharashtra and packed fresh for your order, ready for iftar.';
const DRINK_STORY = 'Made fresh on the day of delivery and sent chilled, ready to pour when it is time to break the fast.';
const per100g = (pairs) => table('Per 100 g', pairs);

function buildRamadanRange() {
  // `facts` are the optional fields (calories, keyBenefits, storage, allergens and the specifications). Only those given
  // are written: Firestore refuses a field whose value is undefined.
  const item = (slug, name, pack, { regular, stock, category, description, ingredients, ...facts }) => ({
    slug,
    name,
    description,
    ingredients,
    price: ramadanPrice(regular), // whole rupees, what the customer pays
    compareAtPrice: regular, // the regular price, shown crossed out
    stock,
    category,
    badge: null, // the card calls it "Ramadan Special" (web/lib/badges.js)
    sizes: [{ id: 'regular', label: pack, extra: 0 }],
    images: [], // placeholder photos are used until real ones are added (web/lib/images.js)
    deliveryTime: 'Within 1 hour',
    active: true,
    ...facts,
  });
  const fruit = (slug, name, pack, fields) => item(slug, name, pack, { category: 'Ramadan Fruits', ...fields });
  const drink = (slug, name, pack, fields) => item(slug, name, pack, { category: 'Ramadan Drinks', ...fields });

  return [
    // ----- fruit -----
    fruit('premium-dates-khajoor', 'Premium Dates (Khajoor)', '500 g', {
      regular: 349, stock: 40,
      description: 'Soft, naturally sweet dates: the traditional first bite to break the fast.',
      ingredients: ['Dates'],
      ingredientsText: 'Whole dates, with stones. Nothing added.',
      nutrition: per100g([['Energy', '282 kcal'], ['Protein', '2.5 g'], ['Carbohydrate', '75.0 g'], ['of which sugars', '63.4 g'], ['Dietary fibre', '8.0 g'], ['Fat', '0.4 g'], ['Potassium', '656 mg']]),
      calories: 'About 282 kcal per 100 g',
      keyBenefits: ['Traditional way to break the fast', 'Natural sugars for quick energy', 'Good source of fibre and potassium'],
      brandStory: 'Dates are how the fast has been broken for centuries. We choose soft, plump dates with a deep caramel sweetness and pack them fresh for your order.',
      shelfLife: 'Best within 30 days. Keep in an airtight box in a cool, dry place, or in the fridge.',
    }),
    fruit('fresh-watermelon-cut', 'Fresh Watermelon, Cut', '1 kg', {
      regular: 99, stock: 25,
      description: 'Sweet, juicy watermelon, cut into chunks and chilled. Hydrating after a long fast.',
      ingredients: ['Watermelon'],
      ingredientsText: 'Freshly cut watermelon. Nothing added.',
      nutrition: per100g([['Energy', '30 kcal'], ['Protein', '0.6 g'], ['Carbohydrate', '7.6 g'], ['of which sugars', '6.2 g'], ['Dietary fibre', '0.4 g'], ['Fat', '0.2 g'], ['Vitamin C', '8 mg']]),
      calories: 'About 30 kcal per 100 g',
      keyBenefits: ['About 92% water', 'Naturally hydrating', 'Low in calories'],
      brandStory: FRUIT_STORY,
      shelfLife: CUT_FRUIT_SHELF_LIFE,
      storage: 'Keep Refrigerated',
    }),
    fruit('fresh-bananas', 'Fresh Bananas', '12 pieces', {
      regular: 79, stock: 30,
      description: 'Ripe bananas, a dozen. Gentle on the stomach and good for suhoor.',
      ingredients: ['Bananas'],
      ingredientsText: 'Whole fresh bananas. Nothing added.',
      nutrition: per100g([['Energy', '89 kcal'], ['Protein', '1.1 g'], ['Carbohydrate', '22.8 g'], ['of which sugars', '12.2 g'], ['Dietary fibre', '2.6 g'], ['Fat', '0.3 g'], ['Potassium', '358 mg']]),
      calories: 'About 89 kcal per 100 g',
      keyBenefits: ['Easy on the stomach', 'Good source of potassium', 'Quick, natural energy'],
      brandStory: FRUIT_STORY,
      shelfLife: 'Best within 3 days. Keep at room temperature, away from other fruit.',
    }),
    fruit('fresh-apples', 'Fresh Apples', '1 kg', {
      regular: 229, stock: 25,
      description: 'Crisp, sweet apples for iftar platters and suhoor.',
      ingredients: ['Apples'],
      ingredientsText: 'Whole fresh apples. Nothing added.',
      nutrition: per100g([['Energy', '52 kcal'], ['Protein', '0.3 g'], ['Carbohydrate', '13.8 g'], ['of which sugars', '10.4 g'], ['Dietary fibre', '2.4 g'], ['Fat', '0.2 g'], ['Vitamin C', '5 mg']]),
      calories: 'About 52 kcal per 100 g',
      keyBenefits: ['Good source of fibre', 'Crisp and filling', 'Keeps well in the fridge'],
      brandStory: FRUIT_STORY,
      shelfLife: 'Keeps up to 2 weeks in the fridge.',
    }),
    fruit('fresh-oranges', 'Fresh Oranges', '1 kg', {
      regular: 149, stock: 25,
      description: 'Juicy oranges, full of vitamin C. Eat them whole or squeeze them for iftar.',
      ingredients: ['Oranges'],
      ingredientsText: 'Whole fresh oranges. Nothing added.',
      nutrition: per100g([['Energy', '47 kcal'], ['Protein', '0.9 g'], ['Carbohydrate', '11.8 g'], ['of which sugars', '9.4 g'], ['Dietary fibre', '2.4 g'], ['Fat', '0.1 g'], ['Vitamin C', '53 mg']]),
      calories: 'About 47 kcal per 100 g',
      keyBenefits: ['Rich in vitamin C', 'Juicy and refreshing', 'Good source of fibre'],
      brandStory: FRUIT_STORY,
      shelfLife: 'Keeps about a week at room temperature, two in the fridge.',
    }),
    fruit('fresh-mangoes', 'Fresh Mangoes', '1 kg', {
      regular: 249, stock: 20,
      description: 'Ripe, fragrant mangoes, while the season lasts.',
      ingredients: ['Mangoes'],
      ingredientsText: 'Whole fresh mangoes. Nothing added.',
      nutrition: per100g([['Energy', '60 kcal'], ['Protein', '0.8 g'], ['Carbohydrate', '15.0 g'], ['of which sugars', '13.7 g'], ['Dietary fibre', '1.6 g'], ['Fat', '0.4 g'], ['Vitamin C', '36 mg']]),
      calories: 'About 60 kcal per 100 g',
      keyBenefits: ['Rich in vitamin A', 'Source of vitamin C', 'Naturally sweet'],
      brandStory: FRUIT_STORY,
      shelfLife: 'Ripen at room temperature. Once ripe, refrigerate and eat within 3 days.',
    }),
    fruit('fresh-papaya-cut', 'Fresh Papaya, Cut', '1 kg', {
      regular: 89, stock: 20,
      description: 'Ripe papaya, peeled, seeded and cut. Soft and gentle after a day of fasting.',
      ingredients: ['Papaya'],
      ingredientsText: 'Freshly cut papaya. Nothing added.',
      nutrition: per100g([['Energy', '43 kcal'], ['Protein', '0.5 g'], ['Carbohydrate', '10.8 g'], ['of which sugars', '7.8 g'], ['Dietary fibre', '1.7 g'], ['Fat', '0.3 g'], ['Vitamin C', '61 mg']]),
      calories: 'About 43 kcal per 100 g',
      keyBenefits: ['Rich in vitamin C', 'Gentle on the stomach', 'Low in calories'],
      brandStory: FRUIT_STORY,
      shelfLife: CUT_FRUIT_SHELF_LIFE,
      storage: 'Keep Refrigerated',
    }),
    fruit('black-seedless-grapes', 'Black Seedless Grapes', '500 g', {
      regular: 119, stock: 25,
      description: 'Sweet black grapes with no seeds, washed and ready to eat.',
      ingredients: ['Black Grapes'],
      ingredientsText: 'Fresh black seedless grapes. Nothing added.',
      nutrition: per100g([['Energy', '69 kcal'], ['Protein', '0.7 g'], ['Carbohydrate', '18.1 g'], ['of which sugars', '15.5 g'], ['Dietary fibre', '0.9 g'], ['Fat', '0.2 g'], ['Vitamin C', '3 mg']]),
      calories: 'About 69 kcal per 100 g',
      keyBenefits: ['Juicy and refreshing', 'Naturally sweet', 'No seeds, easy to eat'],
      brandStory: FRUIT_STORY,
      shelfLife: 'Refrigerate and eat within 5 days. Wash just before eating.',
    }),
    fruit('fresh-pomegranates', 'Fresh Pomegranates', '1 kg', {
      regular: 299, stock: 20,
      description: 'Deep red pomegranates with sweet-tart, juicy seeds.',
      ingredients: ['Pomegranates'],
      ingredientsText: 'Whole fresh pomegranates. Nothing added.',
      nutrition: per100g([['Energy', '83 kcal'], ['Protein', '1.7 g'], ['Carbohydrate', '18.7 g'], ['of which sugars', '13.7 g'], ['Dietary fibre', '4.0 g'], ['Fat', '1.2 g'], ['Vitamin C', '10 mg']]),
      calories: 'About 83 kcal per 100 g',
      keyBenefits: ['Source of fibre', 'Juicy, sweet-tart seeds', 'Keeps well in the fridge'],
      brandStory: FRUIT_STORY,
      shelfLife: 'Keeps up to 2 weeks in the fridge.',
    }),
    fruit('fresh-guavas', 'Fresh Guavas', '500 g', {
      regular: 79, stock: 20,
      description: 'Fragrant guavas, among the richest fruits in vitamin C.',
      ingredients: ['Guavas'],
      ingredientsText: 'Whole fresh guavas. Nothing added.',
      nutrition: per100g([['Energy', '68 kcal'], ['Protein', '2.6 g'], ['Carbohydrate', '14.3 g'], ['of which sugars', '8.9 g'], ['Dietary fibre', '5.4 g'], ['Fat', '1.0 g'], ['Vitamin C', '228 mg']]),
      calories: 'About 68 kcal per 100 g',
      keyBenefits: ['Very rich in vitamin C', 'High in fibre', 'Low in calories'],
      brandStory: FRUIT_STORY,
      shelfLife: 'Ripen at room temperature in 2 to 3 days. Once ripe, refrigerate and eat within 3 days.',
    }),
    fruit('muskmelon-cut', 'Muskmelon, Cut', '1 kg', {
      regular: 99, stock: 20,
      description: 'Sweet, fragrant muskmelon (kharbuja), cut and chilled.',
      ingredients: ['Muskmelon'],
      ingredientsText: 'Freshly cut muskmelon. Nothing added.',
      nutrition: per100g([['Energy', '34 kcal'], ['Protein', '0.8 g'], ['Carbohydrate', '8.2 g'], ['of which sugars', '7.9 g'], ['Dietary fibre', '0.9 g'], ['Fat', '0.2 g'], ['Vitamin C', '37 mg']]),
      calories: 'About 34 kcal per 100 g',
      keyBenefits: ['Naturally hydrating', 'Source of vitamin C', 'Low in calories'],
      brandStory: FRUIT_STORY,
      shelfLife: CUT_FRUIT_SHELF_LIFE,
      storage: 'Keep Refrigerated',
    }),

    // ----- drinks -----
    drink('rooh-afza-sharbat', 'Rooh Afza Sharbat', '500 ml', {
      regular: 79, stock: 30,
      description: 'The classic rose sharbat of iftar, mixed and chilled, ready to pour.',
      ingredients: ['Rooh Afza', 'Chilled Water'],
      ingredientsText: 'Rooh Afza rose syrup mixed with chilled water. Contains added sugar (from the syrup).',
      nutrition: table('Per 100 ml (estimate for the syrup mixed 1 part to 6 with water)', [['Energy', '47 kcal'], ['Protein', '0 g'], ['Carbohydrate', '11.7 g'], ['of which sugars', '11.7 g'], ['Fat', '0 g']]),
      calories: 'About 47 kcal per 100 ml',
      keyBenefits: ['The classic iftar sharbat', 'Served chilled', 'Ready to drink'],
      brandStory: DRINK_STORY,
      shelfLife: FRESH_DRINK_SHELF_LIFE,
      storage: 'Keep Refrigerated',
    }),
    drink('nimbu-pani', 'Nimbu Pani (Fresh Lemon Water)', '500 ml', {
      regular: 59, stock: 30,
      description: 'Fresh lemon water with a pinch of black salt and roasted cumin. Cool and refreshing.',
      ingredients: ['Lemon', 'Water', 'Sugar', 'Black Salt'],
      ingredientsText: 'Water, fresh lemon juice, sugar, black salt and roasted cumin.',
      nutrition: table('Per 100 ml (estimate)', [['Energy', '27 kcal'], ['Protein', '0.1 g'], ['Carbohydrate', '7.0 g'], ['of which sugars', '6.6 g'], ['Fat', '0 g'], ['Vitamin C', '5 mg']]),
      calories: 'About 27 kcal per 100 ml',
      keyBenefits: ['Made with fresh lemons', 'Cool and refreshing', 'Lightly sweetened'],
      brandStory: DRINK_STORY,
      shelfLife: FRESH_DRINK_SHELF_LIFE,
      storage: 'Keep Refrigerated',
    }),
    drink('jaljeera', 'Jaljeera', '500 ml', {
      regular: 59, stock: 25,
      description: 'Tangy cumin and mint cooler, spiced with black salt. Light and refreshing.',
      ingredients: ['Mint', 'Cumin', 'Tamarind', 'Lemon', 'Black Salt'],
      ingredientsText: 'Water, mint, roasted cumin, black salt, tamarind, lemon juice, ginger and a little sugar.',
      nutrition: table('Per 100 ml (estimate)', [['Energy', '15 kcal'], ['Protein', '0.2 g'], ['Carbohydrate', '3.6 g'], ['of which sugars', '2.8 g'], ['Fat', '0.1 g'], ['Sodium', '180 mg']]),
      calories: 'About 15 kcal per 100 ml',
      keyBenefits: ['Cumin and mint', 'Tangy and refreshing', 'Very low in calories'],
      brandStory: DRINK_STORY,
      shelfLife: FRESH_DRINK_SHELF_LIFE,
      storage: 'Keep Refrigerated',
    }),
    drink('sweet-lassi', 'Sweet Lassi', '300 ml', {
      regular: 79, stock: 25,
      description: 'Thick, creamy lassi made with fresh curd and a touch of cardamom.',
      ingredients: ['Curd', 'Milk', 'Sugar', 'Cardamom'],
      ingredientsText: 'Fresh curd, milk, sugar and cardamom.',
      allergens: 'Contains milk.',
      nutrition: table('Per 100 ml (estimate)', [['Energy', '87 kcal'], ['Protein', '3.1 g'], ['Carbohydrate', '12.4 g'], ['of which sugars', '12.0 g'], ['Fat', '2.8 g'], ['Calcium', '110 mg']]),
      calories: 'About 87 kcal per 100 ml',
      keyBenefits: ['Made with fresh curd', 'Cool and filling', 'Good source of calcium'],
      brandStory: DRINK_STORY,
      shelfLife: FRESH_DRINK_SHELF_LIFE,
      storage: 'Keep Refrigerated',
    }),
    drink('masala-chaas', 'Masala Chaas (Spiced Buttermilk)', '500 ml', {
      regular: 59, stock: 30,
      description: 'Light spiced buttermilk with roasted cumin, mint and coriander.',
      ingredients: ['Curd', 'Cumin', 'Mint', 'Coriander'],
      ingredientsText: 'Fresh curd, water, roasted cumin, black salt, mint, coriander and ginger.',
      allergens: 'Contains milk.',
      nutrition: table('Per 100 ml (estimate)', [['Energy', '25 kcal'], ['Protein', '1.3 g'], ['Carbohydrate', '2.0 g'], ['of which sugars', '1.9 g'], ['Fat', '1.2 g'], ['Calcium', '55 mg']]),
      calories: 'About 25 kcal per 100 ml',
      keyBenefits: ['Light and cooling', 'Low in calories', 'Made with fresh curd'],
      brandStory: DRINK_STORY,
      shelfLife: FRESH_DRINK_SHELF_LIFE,
      storage: 'Keep Refrigerated',
    }),
    drink('dry-fruit-milkshake', 'Dry Fruit Milkshake', '300 ml', {
      regular: 129, stock: 20,
      description: 'Rich milkshake with dates, almonds, cashews and pistachios. Filling for suhoor.',
      ingredients: ['Milk', 'Dates', 'Almonds', 'Cashews', 'Pistachios'],
      ingredientsText: 'Milk, dates, almonds, cashews and pistachios. No added sugar: it is sweetened with the dates.',
      allergens: 'Contains milk and tree nuts (almonds, cashews, pistachios).',
      nutrition: table('Per 100 ml (estimate)', [['Energy', '118 kcal'], ['Protein', '3.9 g'], ['Carbohydrate', '14.6 g'], ['of which sugars', '13.1 g'], ['Fat', '5.0 g'], ['Calcium', '118 mg']]),
      calories: 'About 118 kcal per 100 ml',
      keyBenefits: ['Sweetened with dates', 'Almonds, cashews and pistachios', 'Filling, good for suhoor'],
      brandStory: DRINK_STORY,
      shelfLife: FRESH_DRINK_SHELF_LIFE,
      storage: 'Keep Refrigerated',
    }),
    drink('mango-shake', 'Mango Shake', '300 ml', {
      regular: 99, stock: 20,
      description: 'Thick mango shake made with ripe mango and chilled milk.',
      ingredients: ['Mango', 'Milk', 'Sugar'],
      ingredientsText: 'Milk, ripe mango pulp and sugar.',
      allergens: 'Contains milk.',
      nutrition: table('Per 100 ml (estimate)', [['Energy', '92 kcal'], ['Protein', '2.4 g'], ['Carbohydrate', '15.2 g'], ['of which sugars', '14.6 g'], ['Fat', '2.5 g'], ['Vitamin C', '11 mg']]),
      calories: 'About 92 kcal per 100 ml',
      keyBenefits: ['Made with real mango', 'Thick and creamy', 'Served chilled'],
      brandStory: DRINK_STORY,
      shelfLife: FRESH_DRINK_SHELF_LIFE,
      storage: 'Keep Refrigerated',
    }),
    drink('banana-shake', 'Banana Shake', '300 ml', {
      regular: 79, stock: 20,
      description: 'Creamy banana shake made with fresh bananas and chilled milk.',
      ingredients: ['Banana', 'Milk', 'Sugar'],
      ingredientsText: 'Milk, fresh banana and a little sugar.',
      allergens: 'Contains milk.',
      nutrition: table('Per 100 ml (estimate)', [['Energy', '84 kcal'], ['Protein', '2.9 g'], ['Carbohydrate', '14.0 g'], ['of which sugars', '10.6 g'], ['Fat', '2.0 g'], ['Potassium', '230 mg']]),
      calories: 'About 84 kcal per 100 ml',
      keyBenefits: ['Made with fresh bananas', 'Filling, good for suhoor', 'Source of potassium'],
      brandStory: DRINK_STORY,
      shelfLife: FRESH_DRINK_SHELF_LIFE,
      storage: 'Keep Refrigerated',
    }),
    drink('fresh-mixed-fruit-juice', 'Fresh Mixed Fruit Juice', '300 ml', {
      regular: 99, stock: 25,
      description: 'Watermelon, orange and pomegranate, pressed fresh. No added sugar.',
      ingredients: ['Watermelon', 'Orange', 'Pomegranate'],
      ingredientsText: 'Freshly pressed watermelon, orange and pomegranate juice. No added sugar, water or preservatives.',
      nutrition: table('Per 100 ml (estimate for an equal-parts mix)', [['Energy', '43 kcal'], ['Protein', '0.5 g'], ['Carbohydrate', '10.4 g'], ['of which sugars', '9.0 g'], ['Fat', '0.2 g'], ['Vitamin C', '22 mg']]),
      calories: 'About 43 kcal per 100 ml',
      keyBenefits: ['Pressed fresh', 'No added sugar', 'Source of vitamin C'],
      brandStory: DRINK_STORY,
      shelfLife: FRESH_DRINK_SHELF_LIFE,
      storage: 'Keep Refrigerated',
    }),
    drink('tender-coconut-water', 'Tender Coconut Water', '1 coconut', {
      regular: 69, stock: 30,
      description: 'A whole green tender coconut, naturally sweet and hydrating.',
      ingredients: ['Tender Coconut'],
      ingredientsText: 'A whole tender coconut. Nothing added.',
      allergens: 'Contains coconut.',
      nutrition: table('Per 100 ml of coconut water', [['Energy', '19 kcal'], ['Protein', '0.7 g'], ['Carbohydrate', '3.7 g'], ['of which sugars', '2.6 g'], ['Fat', '0.2 g'], ['Potassium', '250 mg']]),
      calories: 'About 19 kcal per 100 ml',
      keyBenefits: ['Naturally hydrating', 'Source of potassium', 'Nothing added'],
      brandStory: 'Green tender coconuts from partner farms in Karnataka, delivered whole so the water inside stays fresh until you open it.',
      shelfLife: 'Keep in a cool place and drink within 2 days. Once opened, drink the same day.',
    }),
    drink('fresh-toned-milk', 'Fresh Toned Milk', '1 litre', {
      regular: 64, stock: 30,
      description: 'Pasteurised toned cow milk for suhoor tea, shakes and sharbat.',
      ingredients: ['Toned Cow Milk'],
      ingredientsText: 'Pasteurised toned cow milk (3% fat).',
      allergens: 'Contains milk.',
      nutrition: table('Per 100 ml', [['Energy', '58 kcal'], ['Protein', '3.2 g'], ['Carbohydrate', '4.7 g'], ['of which sugars (lactose)', '4.7 g'], ['Fat', '3.0 g'], ['Calcium', '120 mg']]),
      calories: 'About 58 kcal per 100 ml',
      keyBenefits: ['Good source of calcium', 'Good source of protein', 'Delivered chilled'],
      brandStory: 'Pasteurised toned milk from a partner dairy near Bengaluru, kept cold from the dairy to your door.',
      shelfLife: 'Pasteurised. Best before 2 days from packaging when kept refrigerated below 4°C.',
      storage: 'Keep Refrigerated below 4°C',
    }),
    drink('packaged-drinking-water', 'Packaged Drinking Water', '1 litre', {
      regular: 20, stock: 60,
      description: 'A sealed litre of drinking water, to add to any iftar order.',
      ingredients: ['Drinking Water'],
      ingredientsText: 'Packaged drinking water.',
      nutrition: table('Per 100 ml', [['Energy', '0 kcal'], ['Protein', '0 g'], ['Carbohydrate', '0 g'], ['of which sugars', '0 g'], ['Fat', '0 g']]),
      keyBenefits: ['Sealed bottle', 'Zero calories'],
      brandStory: 'Sealed bottles of packaged drinking water, so there is always water on the table when the fast ends.',
      shelfLife: 'Best before 6 months from packaging. Store away from direct sunlight.',
    }),
  ];
}

// 5600xx = Zone A (free), any other 560xxx = Zone B (Rs 30, free from Rs 499). The lowest
// priority number is checked first, so Zone A wins over the wider Zone B.
// Zone B's freeDeliveryFrom must equal FREE_DELIVERY_THRESHOLD in web/content/storefront.js: the cart's "free delivery"
// bar and the ticker promise that amount, and web/tests/freeDelivery.test.mjs fails if the two drift apart.
function buildZones() {
  return [
    { id: 'A', name: 'Zone A', fee: 0, etaMin: 30, etaMax: 45, match: { regex: '^5600\\d{2}$' }, priority: 1, freeDeliveryFrom: null, active: true },
    { id: 'B', name: 'Zone B', fee: 30, etaMin: 45, etaMax: 60, match: { regex: '^560\\d{3}$' }, priority: 2, freeDeliveryFrom: 499, active: true },
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
// 500 writes; we have under forty.
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
  // Policies hold placeholder text (scripts/policies.js), so they go to the emulator only: a real project gets its policies
  // written by hand once the business has approved the wording.
  if (target.remote) {
    console.log('  policies: skipped (placeholder text is for the local emulator only)');
  } else {
    await writeDocs(
      db,
      'policies',
      (await allPolicies()).map(({ id, ...rest }) => ({ id, data: { ...rest, updatedAt: now } })),
      opts,
    );
  }
  console.log('Done.');
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`\nSeed stopped: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { buildProducts, buildZones, buildPromos, resolveTarget };
