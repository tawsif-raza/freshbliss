// The parts of sign-in that need no Firebase, so they can be tested: where to send the visitor afterwards, how a
// phone number or one-time code is cleaned up, and the plain-English message for each Firebase Auth error.

export const DEFAULT_AFTER_LOGIN = '/account';

// Where to go once signed in. `next` comes from the address bar (/login?next=/checkout), so it is untrusted: only a
// path on this site is accepted. "//evil.com", "/\evil.com" and "https://evil.com" would all send the customer to
// another site right after they typed a one-time code, so they fall back to the account page.
export function safeNextPath(raw, fallback = DEFAULT_AFTER_LOGIN) {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || !value.startsWith('/')) return fallback;
  if (value.startsWith('//') || value.includes('\\') || /[\u0000-\u001f]/.test(value)) return fallback;
  if (value === '/login' || value.startsWith('/login?') || value.startsWith('/login#')) return fallback; // no loop
  return value;
}

// The pages that ask a visitor to sign in first (components/auth/SignInGate.js). Checkout only: the cart, the shop and
// the product pages stay open to everyone. A visitor can still check out as a GUEST (see below).
export const GATED_PATHS = ['/checkout'];
export const needsSignIn = (pathname) => GATED_PATHS.includes(pathname);

// The path part of a "next" address: "/checkout?x=1#y" -> "/checkout".
const pathOf = (next) => String(next).split(/[?#]/)[0];

// True when signing in is being asked for because of a gated page, i.e. when "Continue as guest" makes sense.
export const isGatedTarget = (next) => needsSignIn(pathOf(safeNextPath(next)));

// The address of the login page that brings the visitor back to `next`. A `next` that is not a path on this site, or
// is just the default, gives plain "/login".
export function loginHref(next) {
  const target = safeNextPath(next, null);
  return target && target !== DEFAULT_AFTER_LOGIN ? `/login?next=${encodeURIComponent(target)}` : '/login';
}

// "Continue as guest": the visitor chose to check out without an account. Remembered for this browser tab only, so the
// checkout gate does not send them straight back to the login page. A stricter browser can block sessionStorage, so the
// answer is also kept in memory (it lasts until the page is reloaded).
const GUEST_KEY = 'fb-guest-checkout';
let guestInMemory = false;

export function allowGuestCheckout() {
  guestInMemory = true;
  try {
    sessionStorage.setItem(GUEST_KEY, '1');
  } catch {
    // blocked: the in-memory answer is enough for now
  }
}

export function guestCheckoutAllowed() {
  if (guestInMemory) return true;
  try {
    return sessionStorage.getItem(GUEST_KEY) === '1';
  } catch {
    return false;
  }
}

// An Indian mobile number as the customer types or pastes it ("98765 43210", "+91 98765-43210", "098765 43210").
// Returns { ok: true, e164: '+919876543210' } or { ok: false, message }. Mobile numbers start with 6, 7, 8 or 9.
export function normalizeIndianMobile(input) {
  let digits = String(input ?? '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 0) return { ok: false, message: 'Enter your mobile number.' };
  if (!/^[6-9]\d{9}$/.test(digits)) return { ok: false, message: 'Enter a 10-digit Indian mobile number.' };
  return { ok: true, e164: `+91${digits}` };
}

// "+919876543210" -> "+91 98765 43210". Anything else is shown as it is.
export const formatPhone = (e164) => String(e164 ?? '').replace(/^(\+91)(\d{5})(\d{5})$/, '$1 $2 $3');

const PROVIDER_NAMES = { 'google.com': 'Google', 'microsoft.com': 'Microsoft', phone: 'Mobile number' };

// What the account page shows about a signed-in person, from the Firebase user. Google and Microsoft give a name and an
// email; a phone sign-in gives only the number. `title` is the best single label for them.
export function describeAccount(user) {
  const providers = user?.providerData ?? [];
  const providerId = providers.map((p) => p.providerId).find((id) => PROVIDER_NAMES[id]);
  const name = String(user?.displayName ?? '').trim();
  const email = user?.email || providers.find((p) => p.email)?.email || '';
  const phone = formatPhone(user?.phoneNumber);
  const title = name || email || phone || 'Your account';
  return {
    title,
    name,
    email,
    phone,
    photoURL: user?.photoURL || '',
    provider: PROVIDER_NAMES[providerId] ?? '',
    initial: title.replace(/^\+/, '').charAt(0).toUpperCase() || 'F',
  };
}

export const OTP_LENGTH = 6;

// Keeps only digits, at most six, so a pasted "123 456" or "123-456" still fills the box.
export const cleanOtp = (input) => String(input ?? '').replace(/\D/g, '').slice(0, OTP_LENGTH);

// What to tell the customer. Raw Firebase text ("Firebase: Error (auth/...)") is never shown.
const MESSAGES = {
  'auth/popup-closed-by-user': 'The sign-in window was closed before you finished. Please try again.',
  'auth/cancelled-popup-request': 'The sign-in window was closed before you finished. Please try again.',
  'auth/popup-blocked': 'Your browser blocked the sign-in window. Allow pop-ups for this site, then try again.',
  'auth/account-exists-with-different-credential': 'An account with this email already exists under a different sign-in method. Use the one you signed up with.',
  'auth/invalid-phone-number': 'That mobile number does not look right. Check it and try again.',
  'auth/missing-phone-number': 'Enter your mobile number.',
  'auth/invalid-verification-code': 'That code is not right. Check the 6 digits and try again.',
  'auth/missing-verification-code': 'Enter the 6-digit code we sent you.',
  'auth/code-expired': 'That code has expired. Go back and ask for a new one.',
  'auth/session-expired': 'That code has expired. Go back and ask for a new one.',
  'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
  'auth/quota-exceeded': 'We cannot send more codes right now. Please try again later or use Google or Microsoft.',
  'auth/captcha-check-failed': 'We could not confirm you are not a robot. Please reload the page and try again.',
  'auth/network-request-failed': 'Could not reach the sign-in service. Check your connection and try again.',
  'auth/operation-not-allowed': 'This sign-in method is not switched on yet. Please use another one.',
  'auth/unauthorized-domain': 'Sign-in is not set up for this web address yet.',
  'auth/user-disabled': 'This account has been disabled. Please contact us.',
  'auth/internal-error': 'Sign-in hit a problem on our side. Please try again.',
};

export function authErrorMessage(err) {
  const code = typeof err?.code === 'string' ? err.code : '';
  if (MESSAGES[code]) return MESSAGES[code];
  console.error('Unexpected sign-in error:', err);
  return 'Something went wrong while signing you in. Please try again.';
}
