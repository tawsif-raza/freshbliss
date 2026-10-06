// `auth` and `db`, under the short name. There is ONE place that creates the Firebase app, lib/firebaseClient.js: it reads
// the NEXT_PUBLIC_FIREBASE_* variables (.env.local, see .env.example), connects to the local emulators in `next dev`,
// sets up App Check and reuses the existing app on hot reload. This file only re-exports from it, so importing either
// name gives the same instances and can never create a second app that skips the emulators.
//
// Prefer importing from '@/lib/firebaseClient' directly (as the rest of the storefront does).

export { app, auth, db } from './firebaseClient';
