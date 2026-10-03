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
import { normaliseProduct } from './product';

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
