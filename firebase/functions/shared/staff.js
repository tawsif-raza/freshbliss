'use strict';

// One place that decides "is this caller staff?". Every staff-only function uses it.
//
// `staff` is a custom claim in the caller's sign-in token. Only the server can
// set it (scripts/setAdmin.js, or devGrantStaff in the emulator), so a browser
// cannot give itself the role.

const { HttpsError } = require('firebase-functions/v2/https');

// Returns the staff member's uid, or throws the right error.
function requireStaff(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
  if (request.auth.token.staff !== true) throw new HttpsError('permission-denied', 'Only staff can do this.');
  return request.auth.uid;
}

module.exports = { requireStaff };
