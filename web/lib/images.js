// Placeholder photography, so the shop looks finished before real product photos exist.
//
// WHAT THIS IS: stock fruit photos from Unsplash (free to use under the Unsplash licence; no credit is
// required). They are used ONLY for a product that has no photos of its own. The moment the shop owner adds
// real photo URLs to a product's `images` field in Firestore, those are shown instead and these are never
// used for it. Every photo below was looked at and checked to show the fruit it is used for.
//
// WHAT TO REMEMBER: customers will think a photo shows what they will receive. Replace these with photos
// of the real boxes before launch (docs/GO_LIVE.md, section 8.3). The product page says "Illustrative
// photo" under any placeholder, so it is never presented as the real thing.
//
// Pure functions (no React, no Firebase), so they are easy to test.

const HOST = 'https://images.unsplash.com';

// Unsplash photo ids, by what the picture shows.
const PHOTO = {
  fruitSpread: '1610832958506-aa56368176cf', // papaya, grapes, citrus, kiwi, pineapple, flat lay
  fruitBasket: '1619566636858-adf3ef46400b', // grapes, mango, kiwi, pineapple, plums in a basket
  fruitBowl: '1519996529931-28324d5a630e', // kiwi, watermelon, strawberries, berries in a coconut bowl
  breakfastBowl: '1490474418585-ba9bad8fd0ea', // a bowl of berries, banana and apple slices
  blueberries: '1498557850523-fd3d118b962e', // blueberries
  apple: '1568702846914-96b305d2aaeb', // a red apple
  mangoHalves: '1591073113125-e46713c829ed', // cut mango
  mango: '1553279768-865429fa0078', // a whole mango
  pineapple: '1550258987-190a2d41a8ba', // a pineapple
  grapes: '1596363505729-4190a9506133', // dark grapes
  kiwi: '1585059895524-72359e06133a', // halved kiwi
  berryMix: '1596591606975-97ee5cef3a1e', // blueberries, raspberries and blackberries
  orangeSlices: '1582979512210-99b6a53386f9', // orange slices, close up
  orangeBoard: '1580052614034-c55d20bfee3b', // a halved orange on a board
  orangePile: '1611080626919-7cf5a9dbab5b', // a pile of oranges
  avocado: '1523049673857-eb18f1d7b578', // a halved avocado
  vanillaScoops: '1560008581-09826d1de69e', // cream-coloured ice cream scoops in a bowl
  milkPour: '1550583724-b2692b85b150', // milk poured from a glass jug into a glass
  orangeJuice: '1621506289937-a8e4df240d0b', // a bottle of orange juice among cut oranges, limes and passion fruit
  watermelonCubes: '1563114773-84221bd62daa', // cubed watermelon
};

// The size is part of the address: the `w` and `q` in the link. Photos are stored at 800 pixels wide, and
// resizeImage() asks for a smaller one for thumbnails.
export const photo = (id, width = 800) => `${HOST}/photo-${id}?auto=format&fit=crop&w=${width}&q=80`;

// The home page banner behind the headline, one per season.
export const HERO_IMAGES = {
  everyday: photo(PHOTO.fruitSpread, 1600),
  ramadan: photo(PHOTO.fruitBasket, 1600),
};

// The Featured Product Promo banner on the home page (components/FeaturedPromo.js): a halved kiwi.
export const PROMO_IMAGE = photo(PHOTO.kiwi, 800);

// By product id: the seeded boxes, each with photos of what is in it.
const BY_PRODUCT = {
  'classic-fresh-mix': [PHOTO.fruitBowl, PHOTO.fruitBasket, PHOTO.kiwi],
  'tropical-bliss': [PHOTO.fruitSpread, PHOTO.pineapple, PHOTO.mangoHalves],
  'gym-fuel-pack': [PHOTO.breakfastBowl, PHOTO.blueberries, PHOTO.apple],
  'ramadan-special-box': [PHOTO.fruitBasket, PHOTO.grapes, PHOTO.fruitSpread], // no dates photo yet: mixed fruit stands in
  'mango-season-box': [PHOTO.mangoHalves, PHOTO.mango, PHOTO.pineapple],
  'exotic-berry-medley': [PHOTO.berryMix, PHOTO.blueberries, PHOTO.fruitBowl],
  'citrus-immunity-shield': [PHOTO.orangeSlices, PHOTO.orangeBoard, PHOTO.orangePile], // the supplied cherry photo was swapped for oranges
  'midnight-mango-indulgence': [PHOTO.mango, PHOTO.mangoHalves],
  'keto-green-pack': [PHOTO.avocado, PHOTO.kiwi],
  'madagascar-vanilla-ice-cream': [PHOTO.vanillaScoops],
  'a2-organic-farm-milk': [PHOTO.milkPour],
  'cold-pressed-orange-juice': [PHOTO.orangeJuice, PHOTO.orangeSlices],
  'chilled-watermelon-mint-bowl': [PHOTO.watermelonCubes, PHOTO.fruitBowl],
};

// By category, for a product added later that is not in the list above.
const BY_CATEGORY = {
  Fresh: [PHOTO.fruitBowl, PHOTO.fruitBasket],
  Fitness: [PHOTO.breakfastBowl, PHOTO.blueberries],
  Ramadan: [PHOTO.fruitBasket, PHOTO.grapes],
  Seasonal: [PHOTO.mangoHalves, PHOTO.mango],
  Exotics: [PHOTO.berryMix, PHOTO.mango],
  Immunity: [PHOTO.orangeSlices, PHOTO.orangePile],
  Combos: [PHOTO.fruitSpread, PHOTO.fruitBasket],
  'Ice Cream': [PHOTO.vanillaScoops],
  Dairy: [PHOTO.milkPour],
  Beverages: [PHOTO.orangeJuice],
  'Cut Fruits': [PHOTO.watermelonCubes, PHOTO.fruitBowl],
};
const FALLBACK = [PHOTO.fruitSpread, PHOTO.fruitBasket];

// Placeholder photo links for a product: its own list if it is a known box, else its category's, else a
// general fruit photo. Always at least one.
export function placeholderImagesFor({ id, category }) {
  const ids = BY_PRODUCT[id] ?? BY_CATEGORY[category] ?? FALLBACK;
  return ids.map((photoId) => photo(photoId));
}

// The same picture at a different width, for small thumbnails (a 64 pixel cart thumbnail should not load an
// 800 pixel photo). Only Unsplash links are rewritten; any other address is returned as it is.
export function resizeImage(url, width) {
  try {
    const u = new URL(url);
    if (u.hostname !== 'images.unsplash.com') return url;
    u.searchParams.set('w', String(width));
    return u.toString();
  } catch {
    return url;
  }
}
