'use strict';

// setup-alerts: creates (or reuses) the email notification channel and two alert policies in Google Cloud Monitoring:
// "Cloud Function errors" (an ERROR in any function emails you) and "Low stock" (a box is running out; see
// functions/lowStock.js). docs/GO_LIVE.md, section 11.1.
//
//   npm run setup-alerts -- --email you@example.com                    the project aliased "production"
//   npm run setup-alerts -- --email you@example.com --project staging  another alias from .firebaserc
//   npm run setup-alerts -- --email you@example.com --dry-run          prints what it would create, changes nothing
//
// Needs the gcloud CLI, logged in (gcloud auth login) with permission to edit alerting policies on the project.
// Safe to run again: a channel for that email is reused, and a policy with the same name is updated in place.

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { resolveProject } = require('./preflight');
const { POLICY_NAME, buildPolicy, STOCK_POLICY_NAME, buildStockPolicy } = require('../monitoring/alertPolicy');

// Every policy this script keeps in step: [name, builder].
const POLICIES = [
  [POLICY_NAME, buildPolicy],
  [STOCK_POLICY_NAME, buildStockPolicy],
];

const ROOT = path.join(__dirname, '..');
const CHANNEL_NAME = 'FreshBliss alerts (email)';

function gcloud(args) {
  const run = spawnSync('gcloud', args, { encoding: 'utf8', shell: process.platform === 'win32', timeout: 120000 });
  if (run.status !== 0) throw new Error(`gcloud ${args.slice(0, 3).join(' ')} failed:\n${(run.stderr || run.stdout || 'no output').trim()}`);
  return run.stdout;
}

const listJson = (args) => JSON.parse(gcloud([...args, '--format=json']) || '[]');

function main(argv) {
  const value = (flag) => (argv.indexOf(flag) >= 0 ? argv[argv.indexOf(flag) + 1] : undefined);
  const email = value('--email');
  const alias = value('--project') || 'production';
  const dryRun = argv.includes('--dry-run');

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error('FAIL  Give the email that should receive alerts:  npm run setup-alerts -- --email you@example.com');
    return 1;
  }
  let projectId;
  try {
    projectId = resolveProject(JSON.parse(fs.readFileSync(path.join(ROOT, '.firebaserc'), 'utf8')), alias);
  } catch (err) {
    console.error(`FAIL  ${err.message}`);
    return 1;
  }
  if (projectId.startsWith('demo-')) {
    console.error(`FAIL  "${projectId}" is a demo project that only exists in the emulator. Point the "${alias}" alias at your real project.`);
    return 1;
  }

  if (dryRun) {
    console.log(`Would use project ${projectId}, create an email channel for ${email} (if there is none), and these ${POLICIES.length} policies:\n`);
    for (const [, build] of POLICIES) console.log(JSON.stringify(build({ channelNames: [`projects/${projectId}/notificationChannels/<channel id>`] }), null, 2));
    return 0;
  }

  try {
    const base = ['--project', projectId];
    // 1. The email channel (reused if this address already has one).
    const channels = listJson(['beta', 'monitoring', 'channels', 'list', ...base]);
    let channel = channels.find((c) => c.type === 'email' && c.labels?.email_address === email);
    if (channel) {
      console.log(`Using the existing email channel for ${email}.`);
    } else {
      channel = JSON.parse(gcloud(['beta', 'monitoring', 'channels', 'create', ...base, `--display-name=${CHANNEL_NAME}`, '--type=email', `--channel-labels=email_address=${email}`, '--format=json']));
      console.log(`Created an email channel for ${email}.`);
    }

    // 2. The policies (each updated in place if it exists, so running this again after a change is safe).
    const existingPolicies = listJson(['alpha', 'monitoring', 'policies', 'list', ...base]);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'freshbliss-alert-'));
    POLICIES.forEach(([name, build], i) => {
      const file = path.join(dir, `policy-${i}.json`);
      fs.writeFileSync(file, JSON.stringify(build({ channelNames: [channel.name] })));
      const existing = existingPolicies.find((p) => p.displayName === name);
      if (existing) {
        gcloud(['alpha', 'monitoring', 'policies', 'update', existing.name, ...base, `--policy-from-file=${file}`]);
        console.log(`Updated the alert policy "${name}".`);
      } else {
        gcloud(['alpha', 'monitoring', 'policies', 'create', ...base, `--policy-from-file=${file}`]);
        console.log(`Created the alert policy "${name}".`);
      }
    });
    console.log(`\nDone. Check it in Google Cloud Console > Monitoring > Alerting (project ${projectId}), then send a test (docs/GO_LIVE.md, section 11.1).`);
    return 0;
  } catch (err) {
    console.error(`FAIL  ${err.message}`);
    return 1;
  }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { main };
