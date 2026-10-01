// Wishlist state: a list of product ids the customer has hearted.

import { createContext, useCallback, useContext, useMemo } from 'react';
import { usePersistedList } from '@/lib/usePersistedList';

const STORAGE_KEY = 'freshbliss:wishlist:v1';

// Same cap as the Firestore rules (wishlists/{uid}.productIds is at most 100).
export const MAX_WISHLIST = 100;

const SAFE_ID = /^[A-Za-z0-9_-]{1,100}$/;

// Keep only valid, unique ids from whatever is in localStorage.
function sanitizeIds(value) {
  if (!Array.isArray(value)) return [];
  const ids = value.filter((id) => typeof id === 'string' && SAFE_ID.test(id));
  return [...new Set(ids)].slice(0, MAX_WISHLIST);
}

const WishlistContext = createContext(null);

export function WishlistProvider({ children }) {
  const { list: ids, commit, current, hydrated } = usePersistedList(STORAGE_KEY, sanitizeIds);

  // ---- WHEN LOGIN ARRIVES (Phase 3: Firebase Auth) ----
  // Guests: this localStorage list is the source of truth.
  // After sign-in, merge it into Firestore once:
  //   1. read wishlists/{uid}
  //   2. take the UNION of the saved ids and the guest ids (a wishlist has no
  //      quantities, so nothing can conflict), capped at MAX_WISHLIST
  //   3. write { productIds: [...], updatedAt: serverTimestamp() } to
  //      wishlists/{uid} (the rules allow only those two fields)
  //   4. then listen to that doc; keep localStorage as an offline cache only.

  const idSet = useMemo(() => new Set(ids), [ids]);
  const isWishlisted = useCallback((productId) => idSet.has(productId), [idSet]);

  // Add the id if it is missing, remove it if it is there.
  // Returns the new state for that product: true = now in the wishlist.
  const toggleWishlist = useCallback(
    (productId) => {
      if (typeof productId !== 'string' || !SAFE_ID.test(productId)) return false;
      const ids = current();
      if (ids.includes(productId)) {
        commit(ids.filter((id) => id !== productId));
        return false;
      }
      if (ids.length >= MAX_WISHLIST) return false; // full: leave it out rather than drop another
      commit([...ids, productId]);
      return true;
    },
    [commit, current],
  );

  const value = useMemo(
    () => ({ ids, count: ids.length, hydrated, isWishlisted, toggleWishlist }),
    [ids, hydrated, isWishlisted, toggleWishlist],
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error('useWishlist must be used inside <WishlistProvider>.');
  return ctx;
}
