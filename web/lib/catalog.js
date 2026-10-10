// The product catalogue, live from Firestore, shared across the whole app.
//
// ONE listener (Firestore onSnapshot) feeds every page and the cart, however many components ask
// for products. So stock badges, prices and "Out of stock" change by themselves, with no refresh,
// the moment the last box sells or staff edit a price. It listens only while at least one component
// is on screen, and keeps the last data so the next page opens instantly.
//
// Prices and stock shown here are previews: the server re-checks both at checkout.
//
// The Firebase SDK is loaded when the listener first starts, not with the page: it is the largest piece of JavaScript on
// the site, and the shop pages already arrive with the catalogue in them (lib/serverCatalog.js), so the page can draw and
// respond to taps without waiting for it. The live data takes over a moment later.

import { useSyncExternalStore } from 'react';
import { normaliseProduct } from './product';

// ---------- the shared listener ----------

const LOADING = Object.freeze({ products: [], status: 'loading', error: null });
let state = LOADING; // replaced (never edited) on every change, so React can compare by identity
let stopListening = null;
let starting = false; // the SDK is being loaded for a listener that has not started yet
const subscribers = new Set();

function publish(next) {
  state = next;
  subscribers.forEach((notify) => notify());
}

function startListening() {
  if (stopListening || starting) return;
  starting = true;
  Promise.all([import('firebase/firestore'), import('./firebaseClient')])
    .then(([{ collection, onSnapshot, query, where }, { db }]) => {
      starting = false;
      if (stopListening || subscribers.size === 0) return; // everyone left while the SDK was loading
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
    })
    .catch((error) => {
      starting = false; // the SDK could not be downloaded (offline): "Try again" retries
      publish({ products: [], status: 'error', error });
    });
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

// useProducts, but starting from the catalogue the SERVER already put in the page (lib/serverCatalog.js, via
// getStaticProps). Until the live listener has its first answer, `initial` is shown as if it were ready, so the page is
// complete in the very first HTML (search engines, share cards, no skeleton flash). Once the live data arrives it takes
// over, so stock and prices stay live. If the live listener fails, the server's copy stays on screen rather than an
// error (checkout re-checks price and stock on the server anyway). With no `initial` this is exactly useProducts().
// The server render and the first browser render both see LOADING from the live side, so they agree (no hydration mismatch).
export function useCatalog(initial) {
  const live = useProducts();
  if (!initial || live.status === 'ready') return live;
  return { ...live, products: initial, status: 'ready', error: null };
}
