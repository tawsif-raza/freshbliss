// Delivery zones and the visitor's saved pincode, as React hooks.
// The matching rules themselves are in lib/zoneMatch.js (plain functions, tested on their own).

import { useCallback, useEffect, useState } from 'react';
import { PINCODE, normaliseZone } from './zoneMatch';
import { usePersistedList } from './usePersistedList';

export { PINCODE, deliveryFeeFor, describeEta, feeLabel, matchZone } from './zoneMatch';

// ---------- the zones ----------

let cached = null;
let inflight = null;

// Zones are public and change rarely, so fetch them once and reuse. The `active == true` filter
// matches what the server does and what the security rules allow. The Firebase SDK is loaded here, on first use, rather
// than with the page: the footer on every page asks for the zones, and it must not hold the page up (lib/catalog.js).
function loadZones() {
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;
  inflight = Promise.all([import('firebase/firestore'), import('./firebaseClient')])
    .then(([{ collection, getDocs, query, where }, { db }]) => getDocs(query(collection(db, 'deliveryZones'), where('active', '==', true))))
    .then((snap) => {
      cached = snap.docs.map((d) => normaliseZone(d.id, d.data())).filter(Boolean);
      return cached;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

// { zones, status: 'loading' | 'ready' | 'error' }
// On 'error' a page should not block the customer: the server checks the pincode when they pay.
export function useZones() {
  const [state, setState] = useState(() => (cached ? { zones: cached, status: 'ready' } : { zones: [], status: 'loading' }));
  useEffect(() => {
    let cancelled = false;
    loadZones()
      .then((zones) => !cancelled && setState({ zones, status: 'ready' }))
      .catch(() => !cancelled && setState({ zones: [], status: 'error' }));
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

// ---------- the saved pincode ----------

// The visitor's pincode is remembered in this browser, so the product page, the cart and the
// checkout all start with it filled in. (It is a list in storage only so it shares the cart's
// tab-to-tab syncing; it holds zero or one pincode.)
const PINCODE_KEY = 'freshbliss:pincode:v1';
const sanitizePincode = (value) => (Array.isArray(value) && typeof value[0] === 'string' && PINCODE.test(value[0]) ? [value[0]] : []);

export function useSavedPincode() {
  const { list, commit } = usePersistedList(PINCODE_KEY, sanitizePincode);
  const setPincode = useCallback((pincode) => commit(PINCODE.test(pincode) ? [pincode] : []), [commit]);
  return { pincode: list[0] ?? '', setPincode };
}
