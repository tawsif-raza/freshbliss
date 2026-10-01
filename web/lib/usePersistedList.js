// A list kept in localStorage, as a React hook.
// Used by the cart and the wishlist so guests keep their choices after a
// refresh or a closed tab.
//
// Built on useSyncExternalStore: the server render and the first browser render
// both see an empty list (so they match), then the saved list appears. It also
// stays in step across browser tabs through the `storage` event.

import { useCallback, useSyncExternalStore } from 'react';

const EMPTY = Object.freeze([]);
const cache = new Map(); // key -> { raw, value }  (keeps the same array until the data changes)
const listeners = new Map(); // key -> Set of callbacks
const memory = new Map(); // key -> raw text, used if localStorage is blocked (private mode)

function readRaw(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

// Read + clean the saved list. `sanitize` drops anything malformed, so a
// hand-edited or old value can never crash the app.
function readList(key, sanitize) {
  const raw = readRaw(key);
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value;

  let parsed = [];
  try {
    parsed = raw ? JSON.parse(raw) : [];
  } catch {
    parsed = [];
  }
  const value = sanitize(parsed);
  cache.set(key, { raw, value });
  return value;
}

function writeList(key, list) {
  const raw = JSON.stringify(list);
  memory.set(key, raw);
  try {
    window.localStorage.setItem(key, raw);
  } catch {
    // Storage is full or blocked. The list still works for this visit.
  }
  cache.set(key, { raw, value: list });
  listeners.get(key)?.forEach((notify) => notify());
}

function subscribe(key, notify) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(notify);

  // Another tab changed the same key.
  const onStorage = (e) => {
    if (e.key === key || e.key === null) notify();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.get(key)?.delete(notify);
    window.removeEventListener('storage', onStorage);
  };
}

const subscribeNever = () => () => {};

// `sanitize` must be a stable function (declare it outside the component).
//   list      the current saved list
//   commit    save a new list (updates every component using this key)
//   current   read the latest list right now (use inside handlers)
//   hydrated  false on the server and first render, true once saved data is loaded
export function usePersistedList(key, sanitize) {
  const list = useSyncExternalStore(
    useCallback((notify) => subscribe(key, notify), [key]),
    () => readList(key, sanitize),
    () => EMPTY,
  );
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);

  const commit = useCallback((next) => writeList(key, next), [key]);
  const current = useCallback(() => readList(key, sanitize), [key, sanitize]);

  return { list, commit, current, hydrated };
}
