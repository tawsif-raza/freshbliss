'use strict';

// getOrdersDownloadUrl
// Gives a staff member a short-lived link for downloading the Orders spreadsheet
// (the .xlsx file kept in Amazon S3). The dashboard's "Download orders sheet" button calls it.
//
// WHY A LINK, AND NOT THE FILE ITSELF
// The bucket is private (it holds customer addresses), and a person should open a COPY of the
// file rather than edit the live one (see docs/EXCEL_SYNC.md). So the server signs a link that
// works for 15 minutes, for this one file, for reading only. Nothing else in the bucket can be
// reached with it, and it stops working by itself.
//
// WHO MAY ASK
// Staff only: the caller's sign-in token must have the `staff` claim (shared/staff.js). Every
// download is written to the log with the staff member's uid, so it is known who took the data.
//
// It never returns the AWS secret. A link carries the access key ID and a signature, not the secret.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const { requireStaff } = require('./shared/staff');
const { createDownloadLink, DOWNLOAD_LINK_SECONDS } = require('./shared/s3Workbook');
const { REGION, EXCEL_AWS_SECRET_ACCESS_KEY, readConfig, missingSettings, describeError } = require('./excelSync');

// The work of the function, apart from Firebase, so it can be tested.
//   request  the callable request ({ auth })
//   deps     { config, ...what createDownloadLink accepts } so tests can replace S3 and the clock
// Returns { url, filename, expiresAt, expiresInSeconds }. Throws an HttpsError whose message is safe to show staff.
async function issueDownloadLink(request, deps = {}) {
  const uid = requireStaff(request); // throws "unauthenticated" or "permission-denied"

  const cfg = deps.config || readConfig();
  if (missingSettings(cfg).length > 0) {
    throw new HttpsError('failed-precondition', 'Excel sync is not set up yet. See docs/AWS_SETUP.md.');
  }

  let link;
  try {
    link = await createDownloadLink(cfg, { expiresIn: DOWNLOAD_LINK_SECONDS }, deps);
  } catch (err) {
    // The real reason (and a hint for whoever looks after the system) goes to the log, not to the browser.
    logger.error('getOrdersDownloadUrl: could not make a download link.', { uid, ...describeError(err) });
    if (err?.retryable) throw new HttpsError('unavailable', 'Could not reach the orders sheet just now. Please try again in a minute.');
    throw new HttpsError('failed-precondition', 'The orders sheet could not be opened. Ask whoever looks after the system to check the AWS connection (the function log says why).');
  }

  if (!link) throw new HttpsError('not-found', 'There is no orders sheet yet. It is created when the first order comes in.');

  logger.info('getOrdersDownloadUrl: download link issued.', { uid, expiresAt: link.expiresAt });
  return { url: link.url, filename: link.filename, expiresAt: link.expiresAt, expiresInSeconds: DOWNLOAD_LINK_SECONDS };
}

exports.getOrdersDownloadUrl = onCall({ region: REGION, secrets: [EXCEL_AWS_SECRET_ACCESS_KEY], timeoutSeconds: 30 }, (request) => issueDownloadLink(request));

// Exported for the tests.
exports.issueDownloadLink = issueDownloadLink;
