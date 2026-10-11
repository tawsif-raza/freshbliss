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
  // The Ramadan range (dates, fruit and drinks for iftar and suhoor).
  datesPlate: '1777891258071-45b4cee69360', // a plate of dates on a linen cloth
  datesPile: '1771231591559-d19c89ad118a', // a pile of dates, amber and dark brown
  watermelonWhole: '1587049352846-4a222e784d38', // a whole watermelon with a slice
  watermelonBoard: '1625367601763-03c05b49937e', // watermelon cut into wedges on a board
  bananas: '1571771894821-ce9b6c11b08e', // a bunch of ripe bananas
  bananaBunch: '1587132137056-bfbf0166836e', // a bunch of bananas on a yellow background
  papayaHalves: '1552427085-45d07c9e950d', // two papaya halves on white
  papayaLeaf: '1526318472351-c75fcf070305', // halved papaya on a banana leaf
  pomegranateCut: '1571347586843-69826a524206', // halved pomegranates and seeds on red
  pomegranatePile: '1541344999736-83eca272f6fc', // a pile of pomegranates, some cut open
  guavas: '1536511132770-e5058c7e8c46', // two green guavas with leaves
  guavaCut: '1561109430-e2fcfbf6aee9', // a heap of guavas, some cut to show pink flesh
  muskmelonHalf: '1638865553538-2434be4c62bd', // a halved muskmelon (cantaloupe) on a white cloth
  muskmelonBowl: '1524527388315-7f7a81520e35', // muskmelon cut into pieces in a bowl
  roseSharbat: '1627683962231-c1fc5488e9da', // a glass of red rose sharbat beside a rose
  roseSharbatTop: '1676976196603-52ed1bc1225b', // red sharbat from above, with rose petals
  nimbuPani: '1507281549113-040fcfef650e', // lemon water with mint, lemons alongside
  nimbuPaniMint: '1513558161293-cdaf765ed2fd', // lemon and mint water in a tall glass
  mintCooler: '1536852386-74fd4d6daf8b', // a chilled mint drink with crushed ice (no jaljeera photo exists yet)
  lassi: '1558113583-d75f23fcb8a9', // a thick white lassi topped with mint and nuts
  lassiGlass: '1555791902-2bd22de5cd9c', // a white lassi in a stemmed glass with mint
  chaas: '1630409346699-79481a79db52', // buttermilk poured into a glass, with coriander
  dryFruitShake: '1555411093-41f7864ed3a2', // a milkshake topped with chopped nuts
  milkAlmonds: '1601436423474-51738541c1b1', // a bottle of milk with almonds
  mangoShake: '1623065422902-30a2d299bbe4', // a glass of mango shake beside cut mango
  mangoShakeBowl: '1622119745123-96bbf01909c0', // mango shake in a glass, mango slices behind
  bananaShake: '1707219811295-0f283760668b', // a banana shake with mint, banana halves in front
  bananaShakeOats: '1685967836529-b0e8d6938227', // a banana shake with sliced banana and oats
  fruitJuices: '1583577612013-4fecf7bf8f13', // three glasses of fruit juice with whole fruit
  juiceBottles: '1603569283847-aa295f0d016a', // jugs of fresh juice among fruit
  coconutWater: '1607262545961-1a75eb951b2c', // a tender coconut with a straw
  tenderCoconuts: '1566109964132-ec243417ca2d', // a pile of green tender coconuts
  waterBottle: '1616118132534-381148898bb4', // a plain bottle of drinking water, no brand showing
  waterGlass: '1534616042650-80f5c9b61f09', // a glass of water
};

// The size is part of the address: the `w` and `q` in the link. Photos are stored at 800 pixels wide, and
// resizeImage() asks for a smaller one for thumbnails.
export const photo = (id, width = 800) => `${HOST}/photo-${id}?auto=format&fit=crop&w=${width}&q=80`;

// The home page banner behind the headline, one per season.
export const HERO_IMAGES = {
  everyday: photo(PHOTO.fruitSpread, 1600),
  ramadan: photo(PHOTO.datesPlate, 1600),
};

// The "Our roots" photo on the home page (content/storefront.js).
export const ROOTS_IMAGE = photo(PHOTO.fruitBasket, 1200);

// The Featured Product Promo banner on the home page (components/FeaturedPromo.js): a halved kiwi.
export const PROMO_IMAGE = photo(PHOTO.kiwi, 800);

// The "Why fruit every day" section under the home page FAQ (components/HealthBenefits.js). Fruit, not a person: there
// is deliberately no before-and-after photo (content/benefits.js says why).
export const BENEFITS_IMAGE = photo(PHOTO.fruitBowl, 1200);

// By product id: the seeded boxes, each with photos of what is in it.
const BY_PRODUCT = {
  'classic-fresh-mix': [PHOTO.fruitBowl, PHOTO.fruitBasket, PHOTO.kiwi],
  'tropical-bliss': [PHOTO.fruitSpread, PHOTO.pineapple, PHOTO.mangoHalves],
  'gym-fuel-pack': [PHOTO.breakfastBowl, PHOTO.blueberries, PHOTO.apple],
  'ramadan-special-box': [PHOTO.datesPlate, PHOTO.pomegranateCut, PHOTO.fruitBasket],
  'mango-season-box': [PHOTO.mangoHalves, PHOTO.mango, PHOTO.pineapple],
  'exotic-berry-medley': [PHOTO.berryMix, PHOTO.blueberries, PHOTO.fruitBowl],
  'citrus-immunity-shield': [PHOTO.orangeSlices, PHOTO.orangeBoard, PHOTO.orangePile], // the supplied cherry photo was swapped for oranges
  'midnight-mango-indulgence': [PHOTO.mango, PHOTO.mangoHalves],
  'keto-green-pack': [PHOTO.avocado, PHOTO.kiwi],
  'madagascar-vanilla-ice-cream': [PHOTO.vanillaScoops],
  'a2-organic-farm-milk': [PHOTO.milkPour],
  'cold-pressed-orange-juice': [PHOTO.orangeJuice, PHOTO.orangeSlices],
  'chilled-watermelon-mint-bowl': [PHOTO.watermelonCubes, PHOTO.fruitBowl],
  // Ramadan Fruits
  'premium-dates-khajoor': [PHOTO.datesPlate, PHOTO.datesPile],
  'fresh-watermelon-cut': [PHOTO.watermelonBoard, PHOTO.watermelonWhole, PHOTO.watermelonCubes],
  'fresh-bananas': [PHOTO.bananas, PHOTO.bananaBunch],
  'fresh-apples': [PHOTO.apple, PHOTO.breakfastBowl],
  'fresh-oranges': [PHOTO.orangePile, PHOTO.orangeBoard],
  'fresh-mangoes': [PHOTO.mango, PHOTO.mangoHalves],
  'fresh-papaya-cut': [PHOTO.papayaHalves, PHOTO.papayaLeaf],
  'black-seedless-grapes': [PHOTO.grapes, PHOTO.fruitBasket],
  'fresh-pomegranates': [PHOTO.pomegranatePile, PHOTO.pomegranateCut],
  'fresh-guavas': [PHOTO.guavas, PHOTO.guavaCut],
  'muskmelon-cut': [PHOTO.muskmelonBowl, PHOTO.muskmelonHalf],
  // Ramadan Drinks
  'rooh-afza-sharbat': [PHOTO.roseSharbat, PHOTO.roseSharbatTop],
  'nimbu-pani': [PHOTO.nimbuPani, PHOTO.nimbuPaniMint],
  jaljeera: [PHOTO.mintCooler], // illustrative: a mint cooler stands in until there is a real jaljeera photo
  'sweet-lassi': [PHOTO.lassi, PHOTO.lassiGlass],
  'masala-chaas': [PHOTO.chaas],
  'dry-fruit-milkshake': [PHOTO.dryFruitShake, PHOTO.milkAlmonds],
  'mango-shake': [PHOTO.mangoShake, PHOTO.mangoShakeBowl],
  'banana-shake': [PHOTO.bananaShake, PHOTO.bananaShakeOats],
  'fresh-mixed-fruit-juice': [PHOTO.fruitJuices, PHOTO.juiceBottles],
  'tender-coconut-water': [PHOTO.coconutWater, PHOTO.tenderCoconuts],
  'fresh-toned-milk': [PHOTO.milkPour, PHOTO.milkAlmonds],
  'packaged-drinking-water': [PHOTO.waterBottle, PHOTO.waterGlass],
};

// By category, for a product added later that is not in the list above.
const BY_CATEGORY = {
  Fresh: [PHOTO.fruitBowl, PHOTO.fruitBasket],
  Fitness: [PHOTO.breakfastBowl, PHOTO.blueberries],
  Ramadan: [PHOTO.datesPlate, PHOTO.fruitBasket],
  'Ramadan Fruits': [PHOTO.datesPile, PHOTO.fruitBasket],
  'Ramadan Drinks': [PHOTO.fruitJuices, PHOTO.roseSharbat],
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
