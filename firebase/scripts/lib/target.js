'use strict';

// The safety guard shared by the admin scripts (seed.js, setAdmin.js).
// It decides WHERE a script is allowed to act, so a command typed in a hurry can
// never touch a real project by accident.
//
//   Default (no flags): ALWAYS the local emulator. If no emulator is running the
//     script just fails to connect; it cannot reach a real project.
//   --remote: a real project. Needs ALL of: the flag, a project id that does not
//     start with "demo-", and <confirmVar>=<that project id> in the environment.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..'); // the firebase/ folder
const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '[::1]', '::1'];

// Which environment variable the Admin SDK reads to find each emulator, and the default port.
const EMULATORS = {
  firestore: { envVar: 'FIRESTORE_EMULATOR_HOST', defaultPort: 8080 },
  auth: { envVar: 'FIREBASE_AUTH_EMULATOR_HOST', defaultPort: 9099 },
};

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  } catch {
    return {};
  }
}

// Returns { remote, projectId, emulatorHost, emulatorVar } or throws a readable error.
// A pure function of argv and env, so it is easy to test.
//   service     'firestore' or 'auth'
//   confirmVar  the env var that must hold the project id for --remote
//   what        a word for the error messages, e.g. "seed"
function resolveTarget(argv, env, { service, confirmVar, what = 'run' }) {
  const emu = EMULATORS[service];
  if (!emu) throw new Error(`Unknown service "${service}".`);

  const remote = argv.includes('--remote');
  const projectId =
    env.GCLOUD_PROJECT || env.GOOGLE_CLOUD_PROJECT || (readJson('.firebaserc').projects || {}).default;
  if (!projectId) throw new Error('No project id found. Set GCLOUD_PROJECT or fill in .firebaserc.');

  if (!remote) {
    // Local mode: point at the emulator no matter what else is configured.
    const existing = env[emu.envVar];
    if (existing) {
      const host = existing.replace(/:\d+$/, '');
      if (!LOCAL_HOSTS.includes(host)) {
        throw new Error(`${emu.envVar} is "${existing}", which is not this machine. Refusing to ${what}.`);
      }
      return { remote: false, projectId, emulatorHost: existing, emulatorVar: emu.envVar };
    }
    const port = ((readJson('firebase.json').emulators || {})[service] || {}).port || emu.defaultPort;
    return { remote: false, projectId, emulatorHost: `127.0.0.1:${port}`, emulatorVar: emu.envVar };
  }

  // Remote mode: every check must pass.
  if (env[emu.envVar]) {
    throw new Error(`--remote was given but ${emu.envVar} is set. Unset it, or drop --remote.`);
  }
  if (projectId.startsWith('demo-')) {
    throw new Error(`"${projectId}" is a demo project that only exists in the emulator. Drop --remote.`);
  }
  if (env[confirmVar] !== projectId) {
    throw new Error(
      `Running against a real project needs confirmation. Run again with ${confirmVar}=${projectId} ` +
        `(you are about to ${what} on project "${projectId}").`,
    );
  }
  return { remote: true, projectId, emulatorHost: null, emulatorVar: emu.envVar };
}

module.exports = { resolveTarget };
