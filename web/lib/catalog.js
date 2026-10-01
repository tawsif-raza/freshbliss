// Loads the product catalogue from Firestore and shares it across the app.
// The product page and the cart both need prices, sizes and stock; this keeps
// it to ONE fetch. Prices and stock shown here are previews: the server
// re-checks both at checkout.

import { useCallback, useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebaseClient';

// Same fallback the server uses when a product has no sizes.
const DEFAULT_SIZES = [{ id: 'regular', label: 'Regular', extra: 0 }];

// Turn a raw Firestore doc into a clean, predictable object. Returns null for a
// product we cannot price safely (the server would reject it too).
function normaliseProduct(id, data) {
  if (!Number.isInteger(data.price) || data.price < 0) return null;

  const sizes =
    Array.isArray(data.sizes) && data.sizes.length > 0
      ? data.sizes.map((s) => ({
          id: String(s.id),
          label: String(s.label ?? s.id),
          extra: Number.isInteger(s.extra) ? s.extra : 0, // rupees added to the base price
        }))
      : DEFAULT_SIZES;

  return {
    id,
    name: data.name ?? id,
    description: data.description ?? '',
    ingredients: Array.isArray(data.ingredients) ? data.ingredients : [],
    price: data.price, // whole rupees
    stock: Number.isInteger(data.stock) ? Math.max(0, data.stock) : 0,
    badge: data.badge ?? null,
    category: data.category ?? null,
    images: Array.isArray(data.images) ? data.images.filter((u) => typeof u === 'string').slice(0, 4) : [],
    deliveryTime: data.deliveryTime ?? null,
    sizes,
  };
}

let cached = null; // the last successful result
let inflight = null; // a request already on its way

// Fetch active products once and reuse the result. `force` refetches.
export function loadProducts({ force = false } = {}) {
  if (cached && !force) return Promise.resolve(cached);
  if (inflight) return inflight;

  // The `active == true` filter is required: the security rules only let
  // customers read active products, and a query must prove it stays inside that.
  const q = query(collection(db, 'products'), where('active', '==', true));
  inflight = getDocs(q)
    .then((snap) => {
      cached = snap.docs.map((d) => normaliseProduct(d.id, d.data())).filter(Boolean);
      return cached;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

// React hook: { products, status: 'loading' | 'ready' | 'error', error, reload }
export function useProducts() {
  const [state, setState] = useState(() =>
    cached ? { products: cached, status: 'ready', error: null } : { products: [], status: 'loading', error: null },
  );

  const run = useCallback((force) => {
    let cancelled = false;
    if (!cached || force) setState((s) => ({ ...s, status: 'loading', error: null }));
    loadProducts({ force })
      .then((products) => !cancelled && setState({ products, status: 'ready', error: null }))
      .catch((error) => !cancelled && setState({ products: [], status: 'error', error }));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => run(false), [run]);

  const reload = useCallback(() => run(true), [run]);
  return { ...state, reload };
}
