// Sign-in helper.
//
// The checkout functions need a signed-in user (the server reads that user's
// cart and ties the order to them). There is no login screen yet, so this signs
// the visitor in ANONYMOUSLY the first time they check out. Firebase keeps the
// same anonymous account in this browser across visits.
//
// PLACEHOLDER until Phase 3 (real login, e.g. phone OTP):
//   - Anonymous accounts are lost if the visitor clears site data, and they
//     cannot see their orders on another device.
//   - In a real Firebase project the Anonymous provider must be switched on
//     (Console > Authentication > Sign-in method). The Auth emulator allows it.
//   - When real login arrives, link the anonymous account to it
//     (linkWithCredential) so the guest's orders and cart carry over.

import { signInAnonymously } from 'firebase/auth';
import { auth } from './firebaseClient';

// Resolves to the current user, signing in anonymously if there is none.
export async function ensureSignedIn() {
  await auth.authStateReady(); // wait for Firebase to restore any saved session
  if (auth.currentUser) return auth.currentUser;
  const credential = await signInAnonymously(auth);
  return credential.user;
}
