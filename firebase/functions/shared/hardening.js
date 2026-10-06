'use strict';

// Settings every public callable function shares, so abuse protection is declared in ONE place.
//
// App Check: the storefront proves to Firebase that a request comes from the real FreshBliss site
// (reCAPTCHA v3), and the function refuses requests without that proof. It stops scripts and other
// websites from calling the checkout, promo and staff functions with a stolen sign-in.
//
// It is a switch (ENFORCE_APP_CHECK, in functions/.env.<alias>), OFF by default, because it only works once
// the Firebase console and the storefront have the reCAPTCHA key (docs/GO_LIVE.md, section 5.5). Turning it
// on before that would lock every customer out. scripts/preflight.js refuses to deploy LIVE (real money)
// with it off. The emulator never checks App Check, so local development is not affected.

const { defineBoolean } = require('firebase-functions/params');

const ENFORCE_APP_CHECK = defineBoolean('ENFORCE_APP_CHECK', { default: false });

const REGION = 'asia-south1';

// The options for a public callable function. `extra` adds the function's own (secrets, timeouts).
const callableOptions = (extra = {}) => ({ region: REGION, enforceAppCheck: ENFORCE_APP_CHECK, ...extra });

module.exports = { ENFORCE_APP_CHECK, REGION, callableOptions };
