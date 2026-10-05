// The parts of "Delete my data" that need no Firebase, so they can be tested: the word the customer must type, and wiping
// what this browser kept (cart, wishlist, pincode, the "continue as guest" note).
//
// What the SERVER erases and keeps is decided in firebase/functions/shared/erasure.js; the words on the account page
// (components/auth/DeleteAccountCard.js) and the privacy page (content/privacy.js) must say the same.

// The word the confirmation box asks for. The server insists on it as well (requestDataErasure.js), so a stray or scripted
// call cannot erase anything.
export const ERASE_PHRASE = 'DELETE';

// Exactly "DELETE", in capitals. Spaces around it are forgiven (a phone keyboard adds them); a different case or any other
// word is not.
export const isErasePhrase = (typed) => typeof typed === 'string' && typed.trim() === ERASE_PHRASE;

// Everything this site keeps in a browser starts with one of these (lib/usePersistedList.js, lib/zones.js, lib/authHelpers.js).
const OUR_KEYS = /^(freshbliss:|fb-)/;

// Removes our keys from a storage (localStorage or sessionStorage), leaving other sites' and the browser's own alone.
// Never throws: a blocked storage is simply skipped. Returns how many keys went.
export function clearOurKeys(storage) {
  try {
    const mine = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (typeof key === 'string' && OUR_KEYS.test(key)) mine.push(key);
    }
    mine.forEach((key) => storage.removeItem(key));
    return mine.length;
  } catch {
    return 0;
  }
}

// What the customer is told on the confirmation page, from the server's reply (counts only).
export function erasureSummary(result) {
  const orders = Number.isInteger(result?.orders) ? result.orders : 0;
  return orders === 0
    ? 'Your account and everything saved with it have been deleted.'
    : `Your account has been deleted, and the personal details on your ${orders === 1 ? 'order' : `${orders} orders`} have been erased.`;
}
