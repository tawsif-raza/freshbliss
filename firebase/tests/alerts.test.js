'use strict';

// The error alert, checked without Google Cloud. Run: npm run test:unit

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { POLICY_NAME, LOG_FILTER, buildPolicy, STOCK_POLICY_NAME, STOCK_LOG_FILTER, buildStockPolicy } = require('../monitoring/alertPolicy');

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

describe('the low-stock alert', () => {
  it('is a separate policy from the error alert, so neither hides the other', () => {
    assert.notEqual(STOCK_POLICY_NAME, POLICY_NAME);
    assert.notEqual(STOCK_LOG_FILTER, LOG_FILTER);
    const p = buildStockPolicy({ channelNames: ['projects/p/notificationChannels/1'] });
    assert.equal(p.displayName, STOCK_POLICY_NAME);
    assert.deepEqual(p.conditions[0].conditionMatchedLog, { filter: STOCK_LOG_FILTER });
    assert.deepEqual(p.notificationChannels, ['projects/p/notificationChannels/1']);
    assert.equal(p.alertStrategy.notificationRateLimit.period, '3600s');
  });

  it('matches exactly what functions/lowStock.js logs: a WARNING with event LOW_STOCK or OUT_OF_STOCK', () => {
    assert.match(STOCK_LOG_FILTER, /severity=WARNING/);
    assert.match(STOCK_LOG_FILTER, /jsonPayload\.event=\("LOW_STOCK" OR "OUT_OF_STOCK"\)/);
    assert.match(STOCK_LOG_FILTER, /cloud_run_revision/);
    assert.doesNotMatch(LOG_FILTER, /WARNING/, 'the error alert still ignores warnings, so low stock never triggers it');
  });

  it('tells whoever gets it where to look and how to restock, and is plain JSON', () => {
    const { content } = buildStockPolicy().documentation;
    assert.ok(content.includes(STOCK_LOG_FILTER));
    assert.match(content, /Firestore console/);
    assert.deepEqual(JSON.parse(JSON.stringify(buildStockPolicy({ channelNames: ['x'] }))), buildStockPolicy({ channelNames: ['x'] }));
  });

  it('setup-alerts creates both policies', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'setup-alerts.js'), 'utf8');
    assert.match(source, /\[POLICY_NAME, buildPolicy\]/);
    assert.match(source, /\[STOCK_POLICY_NAME, buildStockPolicy\]/);
  });
});

describe('the lowStock trigger', () => {
  // Drives the real exported function with fake events, and captures what it logs.
  process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-freshbliss';
  const { logger } = require('../functions/node_modules/firebase-functions');
  const { lowStock } = require('../functions/lowStock');

  const change = (before, after, productId = 'classic') => ({ data: { before: { data: () => before }, after: { data: () => after } }, params: { productId } });
  function run(before, after) {
    const logged = [];
    const original = logger.warn;
    logger.warn = (message, data) => logged.push({ message, ...data });
    try {
      lowStock.run(change(before, after));
    } finally {
      logger.warn = original;
    }
    return logged;
  }

  it('logs one WARNING with the event, product and stock when a box first runs low', () => {
    assert.deepEqual(run({ name: 'Classic Fresh Mix', stock: 6, active: true }, { name: 'Classic Fresh Mix', stock: 5, active: true }), [
      { message: 'Stock is low', event: 'LOW_STOCK', productId: 'classic', name: 'Classic Fresh Mix', stock: 5, threshold: 5 },
    ]);
  });

  it('logs OUT_OF_STOCK at zero, and nothing for a sale below the line or a price edit', () => {
    assert.equal(run({ name: 'A', stock: 1, active: true }, { name: 'A', stock: 0, active: true })[0].event, 'OUT_OF_STOCK');
    assert.deepEqual(run({ name: 'A', stock: 4, active: true }, { name: 'A', stock: 3, active: true }), []);
    assert.deepEqual(run({ name: 'A', stock: 4, price: 1, active: true }, { name: 'A', stock: 4, price: 2, active: true }), []);
  });
});
