// Follows one order in real time (Firestore onSnapshot), so a page showing it updates by itself.

import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebaseClient';

// Follows one order in real time.
//   status: 'loading' | 'ready' | 'missing' | 'error'
//   live:   true while the data is coming from the server (false = offline/cached)
const LOADING = Object.freeze({ status: 'loading', order: null, live: false });

export function useLiveOrder(orderId) {
  // Every answer is stored with the order id it is for, so when the page moves to another order the old
  // answer is simply not used (it shows "loading" until the new one arrives), with no reset step.
  const [answer, setAnswer] = useState({ forId: null, ...LOADING });

  useEffect(() => {
    if (!orderId) return undefined;
    const setState = (next) => setAnswer({ forId: orderId, ...next });

    let stopOrder = () => {};

    // Firestore only answers once we know who is asking, so wait for sign-in
    // state first. Security rules decide the rest: only the order's owner (or
    // staff) can read it.
    const stopAuth = onAuthStateChanged(auth, (user) => {
      stopOrder();
      if (!user) {
        setState({ status: 'missing', order: null, live: false });
        return;
      }
      stopOrder = onSnapshot(
        doc(db, 'orders', orderId),
        { includeMetadataChanges: true }, // so we also hear when the connection drops or returns
        (snap) => {
          if (!snap.exists()) {
            setState({ status: 'missing', order: null, live: false });
            return;
          }
          setState({ status: 'ready', order: { id: snap.id, ...snap.data() }, live: !snap.metadata.fromCache });
        },
        (err) => {
          // "Not yours" and "does not exist" look the same on purpose: the rules
          // refuse both, so a stranger cannot tell which order ids exist.
          setState({ status: err.code === 'permission-denied' ? 'missing' : 'error', order: null, live: false });
        },
      );
    });

    // Cleanup: stop BOTH listeners when the customer leaves the page (or the id changes).
    return () => {
      stopAuth();
      stopOrder();
    };
  }, [orderId]);

  return answer.forId === orderId ? answer : LOADING;
}
