'use strict';

// The error alert, checked without Google Cloud. Run: npm run test:unit

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { POLICY_NAME, LOG_FILTER, buildPolicy } = require('../monitoring/alertPolicy');

describe('the Cloud Function error alert', () => {
  it('watches ERROR (and worse) logs from Cloud Functions, v1 and v2, and not warnings or info', () => {
    assert.match(LOG_FILTER, /severity>=ERROR/);
    assert.match(LOG_FILTER, /cloud_run_revision/);
    assert.match(LOG_FILTER, /cloud_function/);
    assert.doesNotMatch(LOG_FILTER, /WARNING|INFO/);
  });

  it('is a log-match alert that emails at most once an hour and closes itself after a quiet day', () => {
    const p = buildPolicy({ channelNames: ['projects/p/notificationChannels/1'] });
    assert.equal(p.displayName, POLICY_NAME);
    assert.equal(p.enabled, true);
    assert.deepEqual(p.conditions[0].conditionMatchedLog, { filter: LOG_FILTER });
    assert.equal(p.alertStrategy.notificationRateLimit.period, '3600s');
    assert.equal(p.alertStrategy.autoClose, '86400s');
    assert.deepEqual(p.notificationChannels, ['projects/p/notificationChannels/1']);
  });

  it('tells whoever gets it what to do first, with the query to paste', () => {
    const { content } = buildPolicy().documentation;
    assert.match(content, /Razorpay/);
    assert.ok(content.includes(LOG_FILTER));
  });

  it('is plain JSON (gcloud reads it from a file)', () => {
    assert.deepEqual(JSON.parse(JSON.stringify(buildPolicy({ channelNames: ['x'] }))), buildPolicy({ channelNames: ['x'] }));
  });

  it('npm run setup-alerts exists, and the setup script refuses a demo project and a missing email', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    assert.equal(pkg.scripts['setup-alerts'], 'node scripts/setup-alerts.js');
    const { main } = require('../scripts/setup-alerts');
    const quiet = (fn) => {
      const err = console.error;
      console.error = () => {};
      try {
        return fn();
      } finally {
        console.error = err;
      }
    };
    assert.equal(quiet(() => main([])), 1, 'no email');
    assert.equal(quiet(() => main(['--email', 'not-an-email'])), 1);
    assert.equal(quiet(() => main(['--email', 'a@b.co', '--project', 'default'])), 1, '"default" is the demo project in .firebaserc');
  });
});
