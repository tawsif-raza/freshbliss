// Sign-in helpers.
//
// Two kinds of visitor reach the Cloud Functions:
//   - a GUEST, signed in ANONYMOUSLY the first time they check out (ensureSignedIn). Firebase keeps that anonymous
//     account in this browser across visits, but it is lost if site data is cleared and cannot see orders on another
//     device;
//   - a CUSTOMER who signed in on /login with Google, Microsoft or a phone number (one-time code).
//
// A guest who then signs in keeps their orders, one of two ways:
//   - LINKED (the usual case): the provider is attached to the same account, so the uid does not change and the cart and
//     orders are simply still theirs;
//   - MOVED: if that Google/Microsoft/phone identity already belongs to a different, older account, the visitor is signed
//     in to THAT account, and the guest's orders are moved over by the claimGuestOrders function (firebase/functions).
//     The guest's own ID token goes with the request as proof that the guest account is theirs; it has to be fetched
//     BEFORE signing in as the other account, because afterwards the guest session is gone.
//
// Every sign-in below resolves to { user, claimed }: `claimed` is how many guest orders were moved (0 when linked, or when
// there was nothing to move). A failed move never fails the sign-in; the orders stay safe under the guest account.
//
// In a real Firebase project switch these on under Console > Authentication > Sign-in method: Anonymous, Google,
// Microsoft (needs an Azure app registration) and Phone, and add the shop's domain under Settings > Authorized
// domains. The Auth emulator allows all of them (docs/GO_LIVE.md).

import {
  GoogleAuthProvider,
  OAuthProvider,
  PhoneAuthProvider,
  RecaptchaVerifier,
  linkWithPhoneNumber,
  linkWithPopup,
  signInAnonymously,
  signInWithCredential,
  signInWithPhoneNumber,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions, usingEmulators } from './firebaseClient';

// Resolves to the current user, signing in anonymously if there is none.
export async function ensureSignedIn() {
  await auth.authStateReady(); // wait for Firebase to restore any saved session
  if (auth.currentUser) return auth.currentUser;
  const credential = await signInAnonymously(auth);
  return credential.user;
}

// Signs out. The next checkout will start a new guest session.
export const signOutUser = () => signOut(auth);

// Asks the server to move the guest's orders to the account we are now signed in to. Returns how many moved; 0 on any
// failure (logged), because the sign-in itself has already worked.
async function claimGuestOrders(guestToken) {
  try {
    const result = await httpsCallable(functions, 'claimGuestOrders')({ guestToken });
    return Number.isInteger(result.data?.moved) ? result.data.moved : 0;
  } catch (err) {
    console.error('Could not move guest orders to the account:', err);
    return 0;
  }
}

// Sign in to the account that already owns this identity, then bring the guest's orders along.
async function signInToExisting(guest, credential) {
  const guestToken = guest ? await guest.getIdToken().catch(() => null) : null;
  const { user } = await signInWithCredential(auth, credential);
  return { user, claimed: guestToken ? await claimGuestOrders(guestToken) : 0 };
}

// Open the provider's pop-up. A guest is linked; if the identity is already taken by another account, sign in to
// that account with the credential Firebase hands back in the error.
//
// No await before the pop-up opens: browsers only allow a pop-up straight after a tap, and Safari is strict about it.
// The login page already waited for the saved session to load (authStateReady) before showing the buttons.
async function popupSignIn(provider, credentialFromError) {
  const guest = auth.currentUser?.isAnonymous ? auth.currentUser : null;
  if (!guest) return { user: (await signInWithPopup(auth, provider)).user, claimed: 0 };
  try {
    return { user: (await linkWithPopup(guest, provider)).user, claimed: 0 };
  } catch (err) {
    const credential = err?.code === 'auth/credential-already-in-use' ? credentialFromError(err) : null;
    if (!credential) throw err;
    return signInToExisting(guest, credential);
  }
}

export function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return popupSignIn(provider, (err) => GoogleAuthProvider.credentialFromError(err));
}

export function signInWithMicrosoft() {
  const provider = new OAuthProvider('microsoft.com');
  provider.setCustomParameters({ prompt: 'select_account' });
  return popupSignIn(provider, (err) => OAuthProvider.credentialFromError(err));
}

// Phone sign-in needs a bot check. This is Firebase's own invisible reCAPTCHA, drawn into the element with this id
// (the login page has an empty <div id="recaptcha-container">). Make a fresh verifier for every code request and
// clear() it when done: a used one cannot be reused. The emulators do not check it, so it is switched off there.
export function createRecaptcha(containerId) {
  if (usingEmulators) auth.settings.appVerificationDisabledForTesting = true;
  return new RecaptchaVerifier(auth, containerId, { size: 'invisible' });
}

// Texts a 6-digit code to `e164` ("+919876543210"). Resolves to a confirmation to pass to confirmPhoneCode.
export async function sendPhoneCode(e164, verifier) {
  await auth.authStateReady();
  const guest = auth.currentUser?.isAnonymous ? auth.currentUser : null;
  return guest ? linkWithPhoneNumber(guest, e164, verifier) : signInWithPhoneNumber(auth, e164, verifier);
}

export async function confirmPhoneCode(confirmation, code) {
  // Still the guest at this point, even if the number turns out to belong to someone else: a failed link changes nothing.
  const guest = auth.currentUser?.isAnonymous ? auth.currentUser : null;
  try {
    return { user: (await confirmation.confirm(code)).user, claimed: 0 };
  } catch (err) {
    // The number already belongs to another account: sign in to that one instead of linking.
    const credential = err?.code === 'auth/credential-already-in-use' ? PhoneAuthProvider.credentialFromError(err) : null;
    if (!credential) throw err;
    return signInToExisting(guest, credential);
  }
}
