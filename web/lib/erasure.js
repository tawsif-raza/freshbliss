// "Delete my data": asks the server to erase the signed-in customer's personal data and close their account, then wipes what
// this browser kept and signs out. The server does the real work (firebase/functions/requestDataErasure.js); it takes the
// customer from their sign-in, never from anything we send.

import { httpsCallable } from 'firebase/functions';
import { clearOurKeys, ERASE_PHRASE } from './erasureHelpers';
import { functions } from './firebaseClient';
import { signOutUser } from './auth';

// Resolves to the server's summary ({ erased, orders, ... }). Throws the callable's error for the caller to show
// (lib/errors.js friendlyError): for example "You have an order still on the way..." when erasure has to wait.
export async function eraseMyData() {
  const { data } = await httpsCallable(functions, 'requestDataErasure')({ confirm: ERASE_PHRASE });
  return data;
}

// After a successful erasure: forget the cart, wishlist and pincode kept in this browser, and sign out. The Firebase account
// is already gone, so signing out can fail harmlessly (the saved session is rejected); that is ignored.
export async function leaveAfterErasure() {
  for (const which of ['localStorage', 'sessionStorage']) {
    try {
      clearOurKeys(window[which]); // merely reading a blocked storage can throw
    } catch {
      // nothing kept there that we can reach
    }
  }
  await signOutUser().catch(() => {});
}
