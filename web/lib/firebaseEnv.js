// Whether the browser talks to the local Firebase emulators: on in `next dev` unless NEXT_PUBLIC_USE_FIREBASE_EMULATORS=false,
// always off in production.
//
// It lives on its own, with no Firebase import, so a component that only needs to know this (the "dev data" note on the
// product grid, the checkout's test-payment path) does not pull the whole Firebase SDK into every page's JavaScript.
// lib/firebaseClient.js re-exports it, so both import paths give the same value.

export const usingEmulators = process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS !== 'false';
