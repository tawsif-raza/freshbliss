'use strict';

// Seed script: fills Firestore with launch products, delivery zones and one
// demo promo code so the UI has something to show.
//
//   npm run seed                 -> seeds the LOCAL EMULATOR (default, safe)
//   npm run seed -- --remote     -> seeds a real project (guarded, see below)
//
// Safety guard (so this can never wipe production by accident):
//   * Default mode ALWAYS points at the local emulator. If you have no
//     emulator running, it just fails to connect; it cannot reach a real project.
//   * Remote mode needs all of these: the --remote flag, a project id that does
//     not start with "demo-", and SEED_CONFIRM_PROJECT=<that project id>.
//   * Even then it only ADDS missing documents; it never overwrites one.
//     (In the emulator it does overwrite, so you can reset stock any time.)

const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { resolveTarget: resolveTargetFor } = require('./lib/target');

// ---------- the data ----------

const SIZES = [
  { id: 'regular', label: 'Regular', extra: 0 },
  { id: 'large', label: 'Large', extra: 50 },
];

// The first four are the launch boxes from the storefront design. The fifth is
// extra test data with stock 0, so you can see the "Out of stock" state.
function buildProducts() {
  const box = (slug, name, ingredients, price, stock, category, badge) => ({
    slug,
    name,
    description: ingredients.join(', '),
    ingredients,
    price, // whole rupees
    stock,
    category,
    badge, // null when there is no badge
    sizes: SIZES,
    images: [], // no photos supplied yet
    deliveryTime: 'Within 1 hour',
    active: true,
  });
  return [
    box('classic-fresh-mix', 'Classic Fresh Mix', ['Watermelon', 'Pineapple', 'Grapes', 'Kiwi'], 149, 25, 'Fresh', 'Popular'),
    box('tropical-bliss', 'Tropical Bliss', ['Mango', 'Pineapple', 'Papaya', 'Kiwi'], 179, 18, 'Fresh', 'New'),
    box('gym-fuel-pack', 'Gym Fuel Pack', ['Apple', 'Banana', 'Berries', 'Nuts'], 159, 4, 'Fitness', 'Fitness'),
    box('ramadan-special-box', 'Ramadan Special Box', ['Dates', 'Fruits', 'Pomegranate', 'Mixed'], 199, 12, 'Ramadan', 'Limited'),
    box('mango-season-box', 'Mango Season Box', ['Alphonso Mango', 'Papaya', 'Pineapple'], 229, 0, 'Seasonal', null),
  ];
}

// 5600xx = Zone A (free), any other 560xxx = Zone B (Rs 30). The lowest
// priority number is checked first, so Zone A wins over the wider Zone B.
function buildZones() {
  return [
    { id: 'A', name: 'Zone A', fee: 0, etaMin: 30, etaMax: 45, match: { regex: '^5600\\d{2}$' }, priority: 1, freeDeliveryFrom: null, active: true },
    { id: 'B', name: 'Zone B', fee: 30, etaMin: 45, etaMax: 60, match: { regex: '^560\\d{3}$' }, priority: 2, freeDeliveryFrom: null, active: true },
  ];
}

// A demo code for testing checkout. Server-only collection; clients cannot read it.
function buildPromos() {
  return [{ code: 'WELCOME10', type: 'percent', value: 10, min: 199, active: true, expiresAt: null }];
}

// ---------- the safety guard ----------

// Where may we write? The rules live in scripts/lib/target.js (shared with setAdmin.js).
const resolveTarget = (argv, env) =>
  resolveTargetFor(argv, env, { service: 'firestore', confirmVar: 'SEED_CONFIRM_PROJECT', what: 'seed' });

// ---------- writing ----------

// Writes documents in one batch. `overwrite` true = replace (emulator);
// false = only create the ones that are missing (remote). A batch holds up to
// 500 writes; we have about ten.
async function writeDocs(db, collectionName, docs, { overwrite }) {
  const refs = docs.map(({ id }) => db.collection(collectionName).doc(id));
  let toWrite = docs.map((d, i) => ({ ref: refs[i], data: d.data }));
  let skipped = 0;

  if (!overwrite) {
    const snaps = await db.getAll(...refs);
    toWrite = toWrite.filter((_, i) => !snaps[i].exists);
    skipped = docs.length - toWrite.length;
  }

  const batch = db.batch();
  for (const { ref, data } of toWrite) {
    if (overwrite) batch.set(ref, data);
    else batch.create(ref, data);
  }
  await batch.commit();
  console.log(`  ${collectionName}: wrote ${toWrite.length}${skipped ? `, skipped ${skipped} that already exist` : ''}`);
}

async function main() {
  const target = resolveTarget(process.argv.slice(2), process.env);

  // The Admin SDK sends traffic to the emulator whenever this variable is set.
  if (target.emulatorHost) process.env[target.emulatorVar] = target.emulatorHost;

  console.log(
    target.remote
      ? `Seeding REAL project "${target.projectId}" (add-only, nothing is overwritten)`
      : `Seeding the emulator at ${target.emulatorHost} (project "${target.projectId}")`,
  );

  initializeApp({ projectId: target.projectId });
  const db = getFirestore();
  const opts = { overwrite: !target.remote };
  const now = FieldValue.serverTimestamp();

  await writeDocs(
    db,
    'products',
    buildProducts().map((p) => ({ id: p.slug, data: { ...p, createdAt: now, updatedAt: now } })),
    opts,
  );
  await writeDocs(
    db,
    'deliveryZones',
    buildZones().map(({ id, ...rest }) => ({ id, data: rest })),
    opts,
  );
  await writeDocs(
    db,
    'promoCodes',
    buildPromos().map(({ code, ...rest }) => ({ id: code, data: rest })),
    opts,
  );
  console.log('Done.');
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`\nSeed stopped: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { buildProducts, buildZones, buildPromos, resolveTarget };
