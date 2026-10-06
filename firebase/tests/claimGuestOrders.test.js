'use strict';

// Tests for moving a guest's orders to the account they sign in to.
// Run: npm run test:orders   (uses the real Firestore emulator)

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');

// Use the SAME firebase-admin copy the functions use (two copies cannot share FieldValue).
const fromFunctions = createRequire(path.join(__dirname, '..', 'functions', 'package.json'));
const { initializeApp, getApps } = fromFunctions('firebase-admin/app');
const { getFirestore } = fromFunctions('firebase-admin/firestore');
const { checkClaim, claimOrders } = require('../functions/claimGuestOrders');

const guest = (uid) => ({ uid, firebase: { sign_in_provider: 'anonymous' } });
const member = (uid, provider = 'google.com') => ({ uid, firebase: { sign_in_provider: provider } });

describe('who may claim a guest session', () => {
  it('lets a signed-in customer take over a different guest session', () => {
    assert.deepEqual(checkClaim(member('cust'), guest('g1')), { guestUid: 'g1', customerUid: 'cust' });
    assert.deepEqual(checkClaim(member('cust', 'phone'), guest('g1')), { guestUid: 'g1', customerUid: 'cust' });
  });

  it('refuses a caller who is not signed in', () => {
    assert.throws(() => checkClaim(null, guest('g1')), { code: 'unauthenticated' });
    assert.throws(() => checkClaim({}, guest('g1')), { code: 'unauthenticated' });
  });

  it('refuses a caller who is only a guest too', () => {
    assert.throws(() => checkClaim(guest('g2'), guest('g1')), { code: 'failed-precondition' });
  });

  it('refuses a token that is not a guest session, so a real account cannot be raided', () => {
    assert.throws(() => checkClaim(member('cust'), member('someone-else')), { code: 'invalid-argument' });
    assert.throws(() => checkClaim(member('cust'), {}), { code: 'invalid-argument' });
  });

  it('refuses to claim from yourself', () => {
    assert.throws(() => checkClaim(member('same'), guest('same')), { code: 'invalid-argument' });
  });
});

describe('moving the orders', () => {
  let db;
  before(() => {
    process.env.GCLOUD_PROJECT = 'demo-freshbliss';
    if (getApps().length === 0) initializeApp({ projectId: 'demo-freshbliss' });
    db = getFirestore();
  });

  const t = Date.now();
  const order = (id, uid, extra = {}) => db.doc(`orders/${id}`).set({ uid, status: 'DELIVERED', paymentStatus: 'PAID', total: 349, ...extra });
  const get = async (id) => (await db.doc(`orders/${id}`).get()).data();

  it('moves every order of the guest, and nobody else’s', async () => {
    const g = `guest-${t}-a`;
    const c = `cust-${t}-a`;
    await order(`${g}-1`, g);
    await order(`${g}-2`, g, { status: 'PREPARING' });
    await order(`${g}-other`, `stranger-${t}`);

    assert.equal(await claimOrders(db, { guestUid: g, customerUid: c }), 2);

    for (const id of [`${g}-1`, `${g}-2`]) {
      const o = await get(id);
      assert.equal(o.uid, c);
      assert.equal(o.claimedFrom, g);
      assert.ok(o.claimedAt);
    }
    assert.equal((await get(`${g}-other`)).uid, `stranger-${t}`);
  });

  it('changes only the owner: status, payment and total stay as they were', async () => {
    const g = `guest-${t}-b`;
    await order(`${g}-1`, g, { status: 'OUT_FOR_DELIVERY', total: 612 });
    await claimOrders(db, { guestUid: g, customerUid: `cust-${t}-b` });
    const o = await get(`${g}-1`);
    assert.equal(o.status, 'OUT_FOR_DELIVERY');
    assert.equal(o.paymentStatus, 'PAID');
    assert.equal(o.total, 612);
  });

  it('is safe to repeat, and a guest with no orders moves nothing', async () => {
    const g = `guest-${t}-c`;
    await order(`${g}-1`, g);
    assert.equal(await claimOrders(db, { guestUid: g, customerUid: `cust-${t}-c` }), 1);
    assert.equal(await claimOrders(db, { guestUid: g, customerUid: `cust-${t}-c` }), 0);
    assert.equal(await claimOrders(db, { guestUid: `nobody-${t}`, customerUid: `cust-${t}-c` }), 0);
  });
});
