'use strict';

// setAdmin: give (or take away) the "staff" role for a user.
//
// Staff are people whose sign-in token carries a custom claim: { staff: true }.
// Only the server can set it, so this script (run by a trusted person) is how
// someone becomes staff. The dashboard at /admin/orders, and the functions that
// move, cancel and refund orders, all check that claim.
//
// USAGE (run from the firebase/ folder)
//   npm run set-admin -- <uid>              give the staff role
//   npm run set-admin -- <uid> --revoke     take it away
//   npm run set-admin -- --list             show the users that exist (to find a uid)
//   STAFF_UID=<uid> npm run set-admin       same as passing the uid as an argument
//
// TRY IT LOCALLY (the private-window test)
//   1. Start the emulators:           npm run emulators      (keep it running)
//   2. Start the web app:             cd ../web && npm run dev
//   3. Open a PRIVATE window and go to http://localhost:3001/admin/orders
//      You will see "Staff only" and an "Account ID". That is your uid.
//      (Or run `npm run set-admin -- --list` to see every user and their uid.)
//   4. Run:                           npm run set-admin -- <that uid>
//   5. Back in the private window, press "Check again". The dashboard opens.
//      (The browser keeps a copy of your token, so it needs that refresh to see the new role.)
//
// SAFETY: by default this only ever talks to the LOCAL Auth emulator. A real
// project needs --remote, a non-"demo-" project id, and ADMIN_CONFIRM_PROJECT=<project id>.
// For a real project the script also needs credentials (GOOGLE_APPLICATION_CREDENTIALS).

const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { resolveTarget } = require('./lib/target');

const UID_PATTERN = /^[A-Za-z0-9:_-]{1,128}$/;
const TIMEOUT_MS = 15000;

// A mistake in how the script was run (not a crash): shown plainly, exit code 2.
class UsageError extends Error {}

// ---------- reading the command line ----------

function parseArgs(argv, env) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const positional = argv.filter((a) => !a.startsWith('--'));
  const known = new Set(['--remote', '--revoke', '--list', '--help']);
  for (const f of flags) if (!known.has(f)) throw new UsageError(`Unknown option ${f}. Use --help.`);
  if (positional.length > 1) throw new UsageError('Give just one uid.');

  const uid = positional[0] || env.STAFF_UID || '';
  return { uid: uid.trim(), list: flags.has('--list'), revoke: flags.has('--revoke'), help: flags.has('--help') };
}

// ---------- doing the work ----------

// Never hang forever if the emulator is not there.
function withTimeout(promise, what) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`TIMEOUT: ${what} took longer than ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function describeUser(u) {
  const kind = u.providerData.length === 0 ? 'anonymous' : u.providerData.map((p) => p.providerId).join(', ');
  return `${u.uid}  ${kind.padEnd(10)}  ${u.customClaims?.staff === true ? 'STAFF' : '-'}`;
}

async function listUsers(auth) {
  const { users } = await withTimeout(auth.listUsers(50), 'listing users');
  if (users.length === 0) {
    console.log('No users yet. Open http://localhost:3001/admin/orders in a browser first; that creates one.');
    return;
  }
  console.log('uid                           account     role');
  for (const u of users) console.log(describeUser(u));
  if (users.length === 50) console.log('(showing the first 50)');
}

async function setStaff(auth, uid, revoke) {
  const user = await withTimeout(auth.getUser(uid), 'looking up the user');

  // Keep any other claims the user already has; only touch "staff".
  const claims = { ...(user.customClaims || {}) };
  if (revoke) delete claims.staff;
  else claims.staff = true;

  await withTimeout(auth.setCustomUserClaims(uid, Object.keys(claims).length > 0 ? claims : null), 'saving the role');

  // Read it back so we report what is actually stored, not what we hoped.
  const after = await withTimeout(auth.getUser(uid), 'checking the result');
  const isStaff = after.customClaims?.staff === true;
  if (isStaff === revoke) throw new Error('The role did not change. Check the project and try again.');

  console.log(`${revoke ? 'Removed the staff role from' : 'Granted the staff role to'} ${uid}`);
  console.log(`Claims now: ${JSON.stringify(after.customClaims || {})}`);
  console.log(
    revoke
      ? 'Their current sign-in token still says "staff" until it refreshes (up to an hour, or when they sign in again).'
      : 'Next: they press "Check again" on the dashboard, or sign out and back in, so their token picks up the new role.',
  );
}

// Turn a raw error into one helpful sentence.
function explain(err, target) {
  const text = `${err.code || ''} ${err.message || ''}`;
  if (err.code === 'auth/user-not-found') {
    return (
      `No user with that uid exists in ${target.remote ? `project "${target.projectId}"` : 'the Auth emulator'}.\n` +
      'Open /admin/orders in the browser (that creates the account), copy the Account ID shown there,\n' +
      'or run with --list to see the users that exist.'
    );
  }
  if (err.code === 'auth/invalid-uid') return 'That is not a valid uid (1 to 128 characters).';
  if (/ECONNREFUSED|ENOTFOUND|fetch failed|network|TIMEOUT/i.test(text)) {
    return target.remote
      ? `Could not reach Firebase for project "${target.projectId}". Check your internet connection and credentials (GOOGLE_APPLICATION_CREDENTIALS).`
      : `Could not reach the Auth emulator at ${target.emulatorHost}.\nStart it first: npm run emulators   (or npm run emulators:data)`;
  }
  if (/credential|permission|unauthenticated|403|401/i.test(text)) {
    return 'Firebase refused the request. For a real project, check that your credentials are for that project and may manage users.';
  }
  return err.message || String(err);
}

async function main() {
  const args = parseArgs(process.argv.slice(2), process.env);
  if (args.help) {
    console.log('Usage: npm run set-admin -- <uid> [--revoke] | --list   (see the top of scripts/setAdmin.js)');
    return;
  }
  if (!args.list) {
    if (!args.uid) throw new UsageError('Give the uid of the user. Example: npm run set-admin -- <uid>   (or use --list to find it)');
    if (!UID_PATTERN.test(args.uid)) throw new UsageError(`"${args.uid}" does not look like a uid.`);
  }

  const target = resolveTarget(process.argv.slice(2), process.env, {
    service: 'auth',
    confirmVar: 'ADMIN_CONFIRM_PROJECT',
    what: 'change staff roles',
  });

  // The Admin SDK sends traffic to the emulator whenever this variable is set.
  if (target.emulatorHost) process.env[target.emulatorVar] = target.emulatorHost;
  console.log(
    target.remote
      ? `Using the REAL project "${target.projectId}"`
      : `Using the Auth emulator at ${target.emulatorHost} (project "${target.projectId}")`,
  );

  initializeApp({ projectId: target.projectId });
  const auth = getAuth();

  try {
    if (args.list) await listUsers(auth);
    else await setStaff(auth, args.uid, args.revoke);
  } catch (err) {
    err.target = target;
    throw err;
  }
}

if (require.main === module) {
  main().catch((err) => {
    if (err instanceof UsageError) {
      console.error(`\n${err.message}`);
      process.exit(2);
    }
    // Guard errors from target.js are readable as they are; Firebase errors get explained.
    const message = err.target ? explain(err, err.target) : err.message;
    console.error(`\nSetAdmin stopped: ${message}`);
    process.exit(1);
  });
}

module.exports = { parseArgs, explain };
