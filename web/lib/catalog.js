// The product catalogue, live from Firestore, shared across the whole app.
//
// ONE listener (Firestore onSnapshot) feeds every page and the cart, however many components ask
// for products. So stock badges, prices and "Out of stock" change by themselves, with no refresh,
// the moment the last box sells or staff edit a price. It listens only while at least one component
// is on screen, and keeps the last data so the next page opens instantly.
//
// Prices and stock shown here are previews: the server re-checks both at checkout.

import { useSyncExternalStore } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from './firebaseClient';
import { normaliseBenefits, normaliseCalories, normaliseOrigin } from './harvest';
import { placeholderImagesFor } from './images';

// Same fallback the server uses when a product has no sizes.
const DEFAULT_SIZES = [{ id: 'regular', label: 'Regular', extra: 0 }];

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

  const own = Array.isArray(data.images) ? data.images.filter((u) => typeof u === 'string').slice(0, 4) : [];
  const category = data.category ?? null;

  return {
    id, // also the page address: /products/<id>
    name: data.name ?? id,
    description: data.description ?? '',
    ingredients: Array.isArray(data.ingredients) ? data.ingredients.filter((i) => typeof i === 'string') : [],
    price: data.price, // whole rupees
    stock: Number.isInteger(data.stock) ? Math.max(0, data.stock) : 0,
    badge: data.badge ?? null,
    category,
    images: own.length > 0 ? own : placeholderImagesFor({ id, category }),
    placeholderImages: own.length === 0,
    deliveryTime: data.deliveryTime ?? null,
    origin: normaliseOrigin(data.origin),
    calories: normaliseCalories(data.calories),
    keyBenefits: normaliseBenefits(data.keyBenefits),
    nutritionNote: typeof data.nutritionNote === 'string' ? data.nutritionNote : '',
    packaging: typeof data.packaging === 'string' ? data.packaging : '',
    sizes,
  };
}

// ---------- the shared listener ----------

const LOADING = Object.freeze({ products: [], status: 'loading', error: null });
let state = LOADING; // replaced (never edited) on every change, so React can compare by identity
let stopListening = null;
const subscribers = new Set();

function publish(next) {
  state = next;
  subscribers.forEach((notify) => notify());
}

function startListening() {
  if (stopListening) return;
  // The `active == true` filter is required: the security rules only let customers read active
  // products, and a query must prove it stays inside that.
  const q = query(collection(db, 'products'), where('active', '==', true));
  stopListening = onSnapshot(
    q,
    (snap) => publish({ products: snap.docs.map((d) => normaliseProduct(d.id, d.data())).filter(Boolean), status: 'ready', error: null }),
    (error) => {
      stopListening?.();
      stopListening = null; // allow "Try again" to start a fresh listener
      publish({ products: [], status: 'error', error });
    },
  );
}

function subscribe(notify) {
  subscribers.add(notify);
  startListening();
  return () => {
    subscribers.delete(notify);
    if (subscribers.size === 0 && stopListening) {
      stopListening(); // nobody is looking: stop paying for reads. The last data is kept.
      stopListening = null;
    }
  };
}

// "Try again" after an error (or to force a fresh look).
function reload() {
  stopListening?.();
  stopListening = null;
  publish(LOADING);
  if (subscribers.size > 0) startListening();
}

const getSnapshot = () => state;
const getServerSnapshot = () => LOADING; // the server render and the first browser render agree

// React hook: { products, status: 'loading' | 'ready' | 'error', error, reload }
export function useProducts() {
  const { products, status, error } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { products, status, error, reload };
}
