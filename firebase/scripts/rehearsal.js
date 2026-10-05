'use strict';

// One command to rehearse the money path:   npm run rehearsal
//
// Starts the Firebase emulators (Auth, Firestore, Functions) with a local stand-in for Razorpay wired in, then runs
// scripts/rehearsal/run.js: a simulated customer and a staff member sign up, apply a promo, pay, get tracked, cancel and
// are refunded, plus the race conditions and failures that matter. Exit code 0 = every check passed.
//
// It uses throw-away secrets and a project id that starts with "demo-", so it cannot touch a real Firebase project, and the
// Razorpay address override is honoured only inside the emulator (functions/shared/razorpayApi.js).
// Needs Java (for the Firestore emulator), like `npm test`.

const { spawn } = require('node:child_process');

const PORT = process.env.REHEARSAL_PORT || '9777';
const env = {
  ...process.env,
  RAZORPAY_KEY_SECRET: 'rehearsal_key_secret_not_real',
  RAZORPAY_WEBHOOK_SECRET: 'rehearsal_webhook_secret_not_real',
  RAZORPAY_API_BASE: `http://127.0.0.1:${PORT}`,
  REHEARSAL_PORT: PORT,
  GCLOUD_PROJECT: 'demo-freshbliss',
};

const child = spawn('firebase emulators:exec --only auth,firestore,functions --project demo-freshbliss "node scripts/rehearsal/run.js"', {
  env,
  shell: true,
  stdio: 'inherit',
});
child.on('exit', (code) => process.exit(code ?? 1));
