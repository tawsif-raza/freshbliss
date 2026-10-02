'use strict';

// preflight: checks the deployment settings BEFORE `firebase deploy`, so a launch
// does not fail half way (or worse, succeed with the wrong settings).
//
//   npm run preflight                      checks the project aliased "production"
//   npm run preflight -- --project staging checks another alias from .firebaserc
//   npm run preflight -- --skip-secrets    does not ask Firebase whether the secrets exist
//
// It only READS: your .firebaserc, functions/.env.<alias> (or .env.<project id>), and,
// unless skipped, the names (never the values) of the secrets in Secret Manager.
// It never deploys, writes or prints a secret. Exit code 1 means "do not deploy yet".
//
// What it catches:
//   - the alias is missing, or points at a "demo-" project (those only exist in the emulator)
//   - RAZORPAY_KEY_ID missing, or not matching RAZORPAY_MODE (a live key with mode test, or the reverse)
//   - an emulator-only setting (EXCEL_S3_ENDPOINT) left in the production file
//   - a secret written into the plain settings file instead of Secret Manager
//   - AWS settings half filled in
// And it warns about things that are legal but worth knowing (still in test mode, Excel sync off,
// a secret it could not confirm).

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { razorpayKeyProblem } = require('../functions/shared/razorpayMode');

const ROOT = path.join(__dirname, '..'); // the firebase/ folder

// Secrets live in Secret Manager. They must never be in a settings file.
const SECRETS = ['RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'EXCEL_AWS_SECRET_ACCESS_KEY'];

// ---------- small pure helpers (tested in tests/preflight.test.js) ----------

// Reads the text of an env file: KEY=value lines, # comments, optional quotes.
function parseEnv(text) {
  const env = {};
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (/^(".*"|'.*')$/.test(value)) value = value.slice(1, -1);
    env[key] = value;
  }
  return env;
}

// alias -> project id, from the text of .firebaserc. Throws a readable error.
function resolveProject(firebaserc, alias) {
  const projects = (firebaserc && firebaserc.projects) || {};
  const projectId = projects[alias];
  if (!projectId) {
    const known = Object.keys(projects).join(', ') || 'none';
    throw new Error(`No project aliased "${alias}" in .firebaserc (found: ${known}). Create it with:  firebase use --add  (choose your real project and call the alias "${alias}").`);
  }
  return projectId;
}

// The actual checks. `env` is the parsed settings file ({} if there is none).
// `secretsMissing` lists secrets we asked Firebase about and could not confirm.
// Returns { errors, warnings, mode }.
function checkSettings({ alias, projectId, env, envFile, secretsMissing = [] }) {
  const errors = [];
  const warnings = [];
  const mode = (env.RAZORPAY_MODE || 'test').trim();

  if (projectId.startsWith('demo-')) errors.push(`"${projectId}" is a demo project that only exists in the emulator. Point the "${alias}" alias at your real Firebase project.`);
  if (!envFile) warnings.push(`No functions/.env.${alias} (or .env.${projectId}) found. Without it the deploy asks for each setting by hand. Create it from functions/.env.example.`);

  if (!env.RAZORPAY_KEY_ID) {
    errors.push('RAZORPAY_KEY_ID is missing from the settings file.');
  } else {
    const problem = razorpayKeyProblem(env.RAZORPAY_KEY_ID, mode);
    if (problem) errors.push(problem);
  }
  if (mode === 'test') warnings.push('RAZORPAY_MODE is "test": customers will NOT be charged real money. That is right for a rehearsal, wrong for launch.');

  if (env.EXCEL_S3_ENDPOINT) errors.push('EXCEL_S3_ENDPOINT is set. It is only for a local S3 look-alike and would send orders to the wrong place. Remove it.');
  if (env.EXCEL_S3_BUCKET) {
    if (!env.EXCEL_AWS_ACCESS_KEY_ID) errors.push('EXCEL_S3_BUCKET is set but EXCEL_AWS_ACCESS_KEY_ID is not.');
  } else {
    warnings.push('EXCEL_S3_BUCKET is empty: orders will not be copied to Excel and the "Download orders sheet" button will say it is not set up.');
  }

  for (const name of SECRETS) {
    if (name in env) errors.push(`${name} is in the settings file. Secrets belong in Secret Manager only:  firebase functions:secrets:set ${name} --project ${alias}   (then delete the line from the file).`);
  }
  for (const name of secretsMissing) {
    warnings.push(`Could not confirm the secret ${name} exists in "${projectId}". If it does not:  firebase functions:secrets:set ${name} --project ${alias}`);
  }
  return { errors, warnings, mode };
}

// ---------- the part that touches the disk and the Firebase CLI ----------

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  } catch {
    return {};
  }
};

// Finds functions/.env.<alias> or .env.<projectId>. Returns { file, env } or { file: null, env: {} }.
function loadEnvFile(alias, projectId) {
  for (const name of [`.env.${alias}`, `.env.${projectId}`]) {
    const file = path.join(ROOT, 'functions', name);
    if (fs.existsSync(file)) return { file: name, env: parseEnv(fs.readFileSync(file, 'utf8')) };
  }
  return { file: null, env: {} };
}

// Asks Firebase whether a secret exists (metadata only: this never prints its value).
function secretExists(name, projectId) {
  const run = spawnSync('firebase', ['functions:secrets:get', name, '--project', projectId, '--non-interactive'], {
    encoding: 'utf8',
    shell: process.platform === 'win32', // firebase is firebase.cmd on Windows
    timeout: 60000,
  });
  return run.status === 0;
}

function main(argv) {
  const flag = (name) => argv.includes(name);
  const projectArg = argv.indexOf('--project');
  const alias = projectArg >= 0 && argv[projectArg + 1] ? argv[projectArg + 1] : 'production';

  let projectId;
  try {
    projectId = resolveProject(readJson('.firebaserc'), alias);
  } catch (err) {
    console.error(`FAIL  ${err.message}`);
    return 1;
  }

  const { file, env } = loadEnvFile(alias, projectId);

  const secretsMissing = [];
  if (!flag('--skip-secrets')) {
    const needed = ['RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', ...(env.EXCEL_S3_BUCKET ? ['EXCEL_AWS_SECRET_ACCESS_KEY'] : [])];
    for (const name of needed) if (!secretExists(name, projectId)) secretsMissing.push(name);
  }

  const { errors, warnings, mode } = checkSettings({ alias, projectId, env, envFile: file, secretsMissing });

  console.log(`Project: ${projectId} (alias "${alias}")   Settings file: ${file || 'none'}   Razorpay mode: ${mode}`);
  for (const w of warnings) console.log(`WARN  ${w}`);
  for (const e of errors) console.error(`FAIL  ${e}`);
  if (errors.length > 0) {
    console.error(`\n${errors.length} problem${errors.length === 1 ? '' : 's'} to fix before deploying.`);
    return 1;
  }
  console.log(warnings.length > 0 ? '\nOK to deploy (read the warnings above first).' : '\nAll good.');
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { SECRETS, parseEnv, resolveProject, checkSettings };
