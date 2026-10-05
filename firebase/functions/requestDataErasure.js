'use strict';

// requestDataErasure
// The "Delete my data / Close my account" button on the account page (DPDP Act: the right to erasure).
//
// What it does, in short (the full rules and the order of the steps are in shared/erasure.js): the caller's personal data is
// overwritten or deleted, their paid orders, refunds and payment records are KEPT for the shop's accounts with the personal
// fields replaced by "[REDACTED - DPDP ERASURE]" and the link to the person cut, and their sign-in account is deleted.
//
// Who may call it: a signed-in customer, or a guest (an anonymous account can have orders with an address too), and only for
// THEIR OWN data: the uid is taken from the sign-in token, never from the request. Staff accounts are refused (the audit trail
// of who moved an order, and a refund's `requestedBy`, belongs to the business). The request must carry the word DELETE, as
// the page's confirmation box asks, so a stray or scripted call cannot erase anything by accident.
//
// It refuses while an order is still on the way or a payment may be in flight, with a plain explanation.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const { defineSecret } = require('firebase-functions/params');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { callableOptions } = require('./shared/hardening');
const { enforce } = require('./shared/rateLimit');
const { REDACTED, eraseUserData } = require('./shared/erasure');
const { scrubOrderRows } = require('./shared/excelErasure');
const { EXCEL_AWS_SECRET_ACCESS_KEY, EXCEL_COLUMNS, readConfig, missingSettings } = require('./excelSync');

// A long random secret, kept only in Secret Manager (docs/GO_LIVE.md). It is what makes the replacement for a uid impossible to
// work backwards from. Without it the function refuses to run (shared/erasure.js hashUid).
const ERASURE_HASH_KEY = defineSecret('ERASURE_HASH_KEY');

const fail = (code, message) => new HttpsError(code, message);

// The Excel step for eraseUserData: scrub the sheet if Excel is set up, otherwise say it was not needed.
async function scrubExcel(orderIds) {
  const cfg = readConfig();
  if (missingSettings(cfg).length > 0) return 'SKIPPED_NOT_CONFIGURED';
  await scrubOrderRows(cfg, { orderIds, columns: EXCEL_COLUMNS, redacted: REDACTED });
  return 'DONE';
}

exports.requestDataErasure = onCall(callableOptions({ secrets: [ERASURE_HASH_KEY, EXCEL_AWS_SECRET_ACCESS_KEY] }), async (request) => {
  if (!request.auth) throw fail('unauthenticated', 'Please sign in.');
  if (request.auth.token.staff === true) throw fail('failed-precondition', 'Staff accounts cannot be closed here. Ask the shop owner.');
  if (request.data?.confirm !== 'DELETE') throw fail('invalid-argument', 'Type DELETE to confirm.');

  const db = getFirestore();
  await enforce(db, request, 'requestDataErasure');

  try {
    return await eraseUserData(db, { uid: request.auth.uid, auth: getAuth(), key: ERASURE_HASH_KEY.value(), scrubExcel });
  } catch (err) {
    if (err instanceof HttpsError) {
      if (err.code === 'internal') logger.error('Account erasure is not configured: set the ERASURE_HASH_KEY secret.');
      throw err;
    }
    // Unexpected: log the cause (never the data), tell the customer it is safe to try again.
    logger.error('Account erasure failed part way', { detail: err?.message });
    throw fail('unavailable', 'We could not finish erasing your data just now. Nothing was lost: please try again in a few minutes.');
  }
});
