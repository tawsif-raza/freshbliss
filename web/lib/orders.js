// The signed-in customer's own orders, live from Firestore (the account page).
//
// The security rules let a customer read only orders whose `uid` is theirs, and the query below
// says exactly that, so Firestore accepts it. It needs the composite index declared in
// firebase/firestore.indexes.json (uid + createdAt): deploy it with `npm run deploy:rules`.

import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { auth, db } from './firebaseClient';

const RECENT = 50;

// { status: 'loading' | 'ready' | 'error', orders: [{ id, ...order }] } newest first.
// A visitor who has never ordered has no account yet: that is 'ready' with no orders, and visiting
// the page does NOT create one.
export function useMyOrders() {
  const [state, setState] = useState({ status: 'loading', orders: [] });

  useEffect(() => {
    let stopOrders = () => {};
    const stopAuth = onAuthStateChanged(auth, (user) => {
      stopOrders();
      if (!user) {
        setState({ status: 'ready', orders: [] });
        return;
      }
      setState((s) => ({ ...s, status: 'loading' }));
      stopOrders = onSnapshot(
        query(collection(db, 'orders'), where('uid', '==', user.uid), orderBy('createdAt', 'desc'), limit(RECENT)),
        (snap) => setState({ status: 'ready', orders: snap.docs.map((d) => ({ id: d.id, ...d.data() })) }),
        (error) => {
          console.error('Could not load orders:', error);
          setState({ status: 'error', orders: [] });
        },
      );
    });
    return () => {
      stopAuth();
      stopOrders();
    };
  }, []);

  return state;
}
