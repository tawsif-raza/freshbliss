'use strict';

// devGrantStaff  (DEVELOPMENT ONLY)
// The "mock staff toggle" for the admin page: gives the signed-in user the
// `staff` claim so they can try the staff dashboard locally.
//
// It cannot be abused in production, three ways over:
//   1. index.js only exports it when running inside the emulator, so it is not
//      even deployed;
//   2. it refuses to run unless FUNCTIONS_EMULATOR is "true";
//   3. it refuses to run unless the project id starts with "demo-".
//
// Real staff accounts will get the claim from a trusted admin script (Admin SDK
// setCustomUserClaims), never from the browser.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getAuth } = require('firebase-admin/auth');

const fail = (code, message) => new HttpsError(code, message);

exports.devGrantStaff = onCall({ region: 'asia-south1' }, async (request) => {
  const inEmulator =
    process.env.FUNCTIONS_EMULATOR === 'true' && String(process.env.GCLOUD_PROJECT || '').startsWith('demo-');
  if (!inEmulator) throw fail('permission-denied', 'Not available.');
  if (!request.auth) throw fail('unauthenticated', 'Please sign in.');

  const auth = getAuth();
  const user = await auth.getUser(request.auth.uid);
  await auth.setCustomUserClaims(request.auth.uid, { ...(user.customClaims || {}), staff: true });
  return { ok: true }; // the browser must refresh its token to see the new claim
});
