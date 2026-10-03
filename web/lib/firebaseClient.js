// Firebase client setup (browser SDK).
//
// In `next dev` this connects to the LOCAL EMULATORS automatically, so the app
// talks to the seeded data and never to a real project. In production builds
// emulators are never used, no matter what the env says.

import { getApp, getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';

// Cloud Functions are deployed to Mumbai (see firebase/functions). The client
// must ask the same region or calls will not find the function.
const FUNCTIONS_REGION = 'asia-south1';

// Emulators ports match firebase/firebase.json.
const EMULATOR_HOST = process.env.NEXT_PUBLIC_EMULATOR_HOST || '127.0.0.1';
const PORTS = { auth: 9099, firestore: 8080, functions: 5001 };

// On in development unless NEXT_PUBLIC_USE_FIREBASE_EMULATORS=false. Always off in production.
export const usingEmulators =
  process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS !== 'false';

function readConfig() {
  if (usingEmulators) {
    // The emulators do not check keys. The project id must match the emulator's.
    return {
      apiKey: 'demo-key',
      authDomain: 'demo-freshbliss.firebaseapp.com',
      projectId: 'demo-freshbliss',
      appId: 'demo-app',
    };
  }

  // Next only inlines NEXT_PUBLIC_ variables when they are written out in full like this.
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
  const missing = Object.entries(config).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length > 0) {
    throw new Error(`Missing Firebase config (${missing.join(', ')}). See web/.env.example.`);
  }
  return config;
}

// Next's hot reload re-runs this file. Reuse the existing app instead of
// creating a second one.
export const app = getApps().length > 0 ? getApp() : initializeApp(readConfig());

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, FUNCTIONS_REGION);

// connect*Emulator may only be called once per instance, and before the first
// request. A flag on globalThis survives hot reloads.
if (usingEmulators && !globalThis.__freshblissEmulatorsConnected) {
  globalThis.__freshblissEmulatorsConnected = true;
  connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${PORTS.auth}`, { disableWarnings: true });
  connectFirestoreEmulator(db, EMULATOR_HOST, PORTS.firestore);
  connectFunctionsEmulator(functions, EMULATOR_HOST, PORTS.functions);
}
