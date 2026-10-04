// Plain Firebase initialisation from the NEXT_PUBLIC_FIREBASE_* variables (copy .env.example to .env.local and fill
// them in; they are public web config values, not secrets). Exports `auth` and `db`.
//
// This file has NO emulator support and is not used by the storefront yet: the app imports lib/firebaseClient.js, which
// does the same job and also connects to the local emulators in `next dev`, sets up App Check and exports `functions`.
// Do not import both in one page: whichever loads first creates the app, and if that is this file the emulators are
// never connected.

import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Next only inlines NEXT_PUBLIC_ variables when they are written out in full like this.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Next's hot reload re-runs this file: reuse the existing app instead of creating a second one (which throws).
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
