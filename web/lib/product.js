// Turns a raw Firestore product document into a clean, predictable object the whole storefront can rely on.
// Pure (no React, no Firebase), so it is easy to test. lib/catalog.js feeds every live document through it.
//
// Nothing a shop owner types (or forgets to type) can crash a page: a missing or malformed image list, benefits
// list, description, badge and so on falls back to a safe default, and only a product that cannot be priced is
// refused.

import { normaliseBenefits, normaliseCalories, normaliseOrigin, normaliseStorage } from './harvest.js';
import { placeholderImagesFor } from './images.js';
import { normaliseNutrition, normaliseSpecText } from './specs.js';

// Same fallback the server uses when a product has no sizes.
const DEFAULT_SIZES = [{ id: 'regular', label: 'Regular', extra: 0 }];

// A photo address we can show: a non-empty http(s) link. Anything else (an empty string, a number, a made-up
// word) would make the image component refuse to draw, so it is dropped and the placeholder photos are used.
const isImageUrl = (u) => typeof u === 'string' && /^https?:\/\/\S+$/i.test(u.trim());

// Turn a raw Firestore doc into a clean, predictable object. Returns null for a
// product we cannot price safely (the server would reject it too).
//
// Optional fields a shop owner may add to a product in the Firestore console. When one is missing
// the storefront simply leaves that part out; it never makes up a figure:
//   images        up to 4 photo URLs. With none, stock placeholder photos are shown (lib/images.js) and
//                 `placeholderImages` is true so the page can say the photo is illustrative
//   origin        where it was grown, for example "Ratnagiri, Konkan coast"      (the "Harvest & Health"
//   calories      text, for example "About 45 kcal per 100 g" (a whole number      section of the product
//                 is still read, as kcal per box)                                  page: lib/harvest.js)
//   keyBenefits   up to 6 short phrases, for example ["High in vitamin C"]
//   nutritionNote short text under the calories, for example "Per Regular box"
//   packaging     short text about how the box is packed
//   ingredientsText, allergens, nutrition, brandStory, shelfLife
//                 the "Product Specifications" accordion on the product page (lib/specs.js). `ingredients` stays the
//                 LIST of item names; `ingredientsText` is the full declaration as one line of text
//   storage       how a chilled or frozen product must be kept, for example "Keep Frozen at -18°C". It is
//                 shown as a temperature badge on the product page (lib/harvest.js)
export function normaliseProduct(id, data) {
  if (!Number.isInteger(data.price) || data.price < 0) return null;

  const sizes =
    Array.isArray(data.sizes) && data.sizes.length > 0
      ? data.sizes.map((s) => ({
          id: String(s.id),
          label: String(s.label ?? s.id),
          extra: Number.isInteger(s.extra) ? s.extra : 0, // rupees added to the base price
        }))
      : DEFAULT_SIZES;

  const own = Array.isArray(data.images) ? data.images.filter(isImageUrl).slice(0, 4) : [];
  const category = typeof data.category === 'string' && data.category !== '' ? data.category : null;

  return {
    id, // also the page address: /products/<id>
    name: typeof data.name === 'string' && data.name.trim() !== '' ? data.name : id,
    description: typeof data.description === 'string' ? data.description : '',
    ingredients: Array.isArray(data.ingredients) ? data.ingredients.filter((i) => typeof i === 'string') : [],
    price: data.price, // whole rupees
    stock: Number.isInteger(data.stock) ? Math.max(0, data.stock) : 0,
    badge: typeof data.badge === 'string' && data.badge !== '' ? data.badge : null,
    category,
    images: own.length > 0 ? own : placeholderImagesFor({ id, category }),
    placeholderImages: own.length === 0,
    deliveryTime: typeof data.deliveryTime === 'string' && data.deliveryTime !== '' ? data.deliveryTime : null,
    origin: normaliseOrigin(data.origin),
    calories: normaliseCalories(data.calories),
    keyBenefits: normaliseBenefits(data.keyBenefits),
    storage: normaliseStorage(data.storage),
    ingredientsText: normaliseSpecText(data.ingredientsText, 'ingredientsText'),
    allergens: normaliseSpecText(data.allergens, 'allergens'),
    nutrition: normaliseNutrition(data.nutrition),
    brandStory: normaliseSpecText(data.brandStory, 'brandStory'),
    shelfLife: normaliseSpecText(data.shelfLife, 'shelfLife'),
    nutritionNote: typeof data.nutritionNote === 'string' ? data.nutritionNote : '',
    packaging: typeof data.packaging === 'string' ? data.packaging : '',
    sizes,
  };
}
