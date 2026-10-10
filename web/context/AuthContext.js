// Who is using the site right now, for the whole app (header, checkout gate, cart, account page).
//
//   const { status, user } = useAuthUser();
//     status  'loading'    Firebase has not said yet (also what the server-rendered page shows, so nothing flashes)
//             'signedOut'  nobody
//             'guest'      an anonymous account, made when someone checks out without signing in
//             'user'       signed in with Google, Microsoft or a phone number
//
// ONE listener serves every component. It listens for ID-token changes rather than sign-in changes, because linking a
// guest to Google or a phone number keeps the same account and fires only the first (lib/auth.js).
//
// This provider wraps every page, so it loads the Firebase SDK itself once the page is on screen instead of importing it:
// otherwise every page would wait for the SDK (the largest piece of JavaScript on the site) before it could respond to a
// tap. Until it has loaded, the status is 'loading', which every component already handles.

import { useRouter } from 'next/router';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/ToastProvider';
import { guestCheckoutAllowed, loginHref } from '@/lib/authHelpers';

const AuthContext = createContext({ status: 'loading', user: null });

const statusOf = (user) => (!user ? 'signedOut' : user.isAnonymous ? 'guest' : 'user');

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null });

  useEffect(() => {
    let stop = null;
    let cancelled = false;
    Promise.all([import('firebase/auth'), import('@/lib/firebaseClient')])
      .then(([{ onIdTokenChanged }, { auth }]) => {
        if (cancelled) return;
        stop = onIdTokenChanged(auth, (user) => {
          // A new object every time, so a profile change (name, linked provider) reaches the components too.
          setState({ status: statusOf(user), user });
        });
      })
      .catch((err) => console.error('Could not load sign-in:', err));
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  const value = useMemo(() => state, [state]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuthUser = () => useContext(AuthContext);

// Signs the customer out (header and account page share this). Leaves a page that has nothing to show without an account,
// says so in a toast, and reports a failure instead of staying silent.
export function useSignOut() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const signOut = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { signOutUser } = await import('@/lib/auth');
      await signOutUser();
      toast.success('You are signed out.');
      if (/^\/(account|orders|admin)(\/|$)/.test(router.pathname)) router.push('/');
    } catch {
      toast.error('We could not sign you out. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [busy, router, toast]);

  return { signOut, busy };
}

// Where the "Proceed to Checkout" buttons (cart page, slide-out cart) should go: straight to checkout for a signed-in
// customer or someone who chose to be a guest, otherwise to sign-in first, which sends them on to checkout afterwards.
// (The checkout page checks again by itself, so typing the address cannot skip this.) While Firebase is still working out
// who it is, the plain checkout address is used, which is also what the server-rendered page contains.
export function useCheckoutHref() {
  const { status } = useAuthUser();
  if (status === 'loading' || status === 'user' || guestCheckoutAllowed()) return '/checkout';
  return loginHref('/checkout');
}
