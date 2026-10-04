// Sign-in helpers.
//
// Two kinds of visitor reach the Cloud Functions:
//   - a GUEST, signed in ANONYMOUSLY the first time they check out (ensureSignedIn). Firebase keeps that anonymous
//     account in this browser across visits, but it is lost if site data is cleared and cannot see orders on another
//     device;
//   - a CUSTOMER who signed in on /login with Google, Microsoft or a phone number (one-time code).
//
// A guest who then signs in is LINKED rather than replaced: the provider is attached to the same account, so their
// cart and orders carry over. Only if that Google/Microsoft/phone identity already belongs to a different, older
// account is the visitor signed in to that account instead (the guest account's orders stay with the guest account).
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
} from 'firebase/auth';
import { auth, usingEmulators } from './firebaseClient';

// Resolves to the current user, signing in anonymously if there is none.
export async function ensureSignedIn() {
  await auth.authStateReady(); // wait for Firebase to restore any saved session
  if (auth.currentUser) return auth.currentUser;
  const credential = await signInAnonymously(auth);
  return credential.user;
}

// Open the provider's pop-up. A guest is linked; if the identity is already taken by another account, sign in to
// that account with the credential Firebase hands back in the error.
//
// No await before the pop-up opens: browsers only allow a pop-up straight after a tap, and Safari is strict about it.
// The login page already waited for the saved session to load (authStateReady) before showing the buttons.
async function popupSignIn(provider, credentialFromError) {
  const guest = auth.currentUser?.isAnonymous ? auth.currentUser : null;
  if (!guest) return (await signInWithPopup(auth, provider)).user;
  try {
    return (await linkWithPopup(guest, provider)).user;
  } catch (err) {
    const credential = err?.code === 'auth/credential-already-in-use' ? credentialFromError(err) : null;
    if (!credential) throw err;
    return (await signInWithCredential(auth, credential)).user;
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
  try {
    return (await confirmation.confirm(code)).user;
  } catch (err) {
    // The number already belongs to another account: sign in to that one instead of linking.
    const credential = err?.code === 'auth/credential-already-in-use' ? PhoneAuthProvider.credentialFromError(err) : null;
    if (!credential) throw err;
    return (await signInWithCredential(auth, credential)).user;
  }
}
