'use strict';

// Rate limits for the functions anyone can reach. Anonymous accounts are free to create, so a limit on the
// signed-in user alone is easy to dodge; every limit is therefore kept TWICE: per user and per network address.
//
// How it counts: one small document per (limit, user or address) in the server-only `rateLimits` collection,
// holding a count and the start of the current window. Each call adds one inside a transaction; when the window
// is over the count starts again. A Firestore TTL policy on `expiresAt` deletes old documents (firestore.indexes.json),
// and the security rules keep the collection closed to every browser.
//
// Network addresses are stored only as a one-way hash, never as an address.
//
// If counting itself fails (Firestore hiccup) the request is ALLOWED and the problem is logged at ERROR level:
// a broken counter must never stop a customer from paying. (Money is still protected: the server re-prices
// everything and the rules block direct writes.)

const crypto = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');

// Each limit: how many calls are allowed in a window of `windowSec` seconds.
const LIMITS = {
  // The checkout page asks for a price whenever the cart, pincode, tip or promo changes (debounced).
  previewCheckout: { uid: { limit: 40, windowSec: 60 }, ip: { limit: 240, windowSec: 60 } },
  // Each call creates a real Razorpay order, so this is tighter.
  createCheckout: { uid: { limit: 8, windowSec: 600 }, ip: { limit: 40, windowSec: 600 } },
  // Counted only for promo codes that were WRONG. This is what stops code guessing.
  badPromo: { uid: { limit: 6, windowSec: 900 }, ip: { limit: 30, windowSec: 900 } },
};

// The caller's address as a short hash, or null if it cannot be told.
// On Cloud Run (which Cloud Functions v2 runs on) the platform APPENDS the real client address to the end of
// X-Forwarded-For, so the LAST entry is the one to trust: anything before it was typed by the caller.
function clientAddress(request) {
  const raw = request.rawRequest;
  const forwarded = raw?.headers?.['x-forwarded-for'];
  const entries = typeof forwarded === 'string' ? forwarded.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const ip = entries.length > 0 ? entries[entries.length - 1] : raw?.ip;
  if (!ip) return null;
  return crypto.createHash('sha256').update(`freshbliss-rate-limit:${ip}`).digest('hex').slice(0, 32);
}

// The two keys one request is counted under.
function keysFor(request) {
  const keys = [];
  if (request.auth?.uid) keys.push({ scope: 'uid', id: request.auth.uid });
  const ip = clientAddress(request);
  if (ip) keys.push({ scope: 'ip', id: ip });
  return keys;
}

const docPath = (bucket, key) => `rateLimits/${bucket}__${key.scope}__${key.id}`;

const tooMany = (retryAfterSec) =>
  new HttpsError('resource-exhausted', `You are doing that too often. Please wait ${retryAfterSec} second${retryAfterSec === 1 ? '' : 's'} and try again.`, { retryAfterSec });

// Adds `cost` to the count for one key. Returns { count, retryAfterSec }.
async function addToCount(db, bucket, key, { windowSec }, { cost = 1, now = Date.now() } = {}) {
  const ref = db.doc(docPath(bucket, key));
  const windowMs = windowSec * 1000;
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const start = snap.exists ? snap.get('windowStart') : null;
    const fresh = !Number.isFinite(start) || now - start >= windowMs;
    const count = (fresh ? 0 : snap.get('count') || 0) + cost;
    const windowStart = fresh ? now : start;
    tx.set(ref, { count, windowStart, expiresAt: new Date(windowStart + windowMs * 2) });
    return { count, retryAfterSec: Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000)) };
  });
}

// Reads the count for one key without changing it.
async function readCount(db, bucket, key, { windowSec }, now = Date.now()) {
  const snap = await db.doc(docPath(bucket, key)).get();
  const start = snap.exists ? snap.get('windowStart') : null;
  if (!Number.isFinite(start) || now - start >= windowSec * 1000) return { count: 0, retryAfterSec: 0 };
  return { count: snap.get('count') || 0, retryAfterSec: Math.max(1, Math.ceil((start + windowSec * 1000 - now) / 1000)) };
}

// Counts this call, and throws `resource-exhausted` if any of its keys is over the limit.
async function enforce(db, request, bucket, { now } = {}) {
  const rules = LIMITS[bucket];
  try {
    for (const key of keysFor(request)) {
      const rule = rules[key.scope];
      const { count, retryAfterSec } = await addToCount(db, bucket, key, rule, { now });
      if (count > rule.limit) {
        logger.warn('Rate limit hit', { bucket, scope: key.scope, count, limit: rule.limit });
        throw tooMany(retryAfterSec);
      }
    }
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    logger.error('Rate limiter failed; letting the request through', { bucket, detail: err?.message });
  }
}

// Throws `resource-exhausted` if the caller has already used up the allowed number of failures. Does not count.
async function assertNotBlocked(db, request, bucket, { now } = {}) {
  const rules = LIMITS[bucket];
  try {
    for (const key of keysFor(request)) {
      const rule = rules[key.scope];
      const { count, retryAfterSec } = await readCount(db, bucket, key, rule, now);
      if (count >= rule.limit) throw tooMany(retryAfterSec);
    }
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    logger.error('Rate limiter failed; letting the request through', { bucket, detail: err?.message });
  }
}

// Records one failure (for example a wrong promo code). Never throws.
async function recordFailure(db, request, bucket, { now } = {}) {
  const rules = LIMITS[bucket];
  try {
    for (const key of keysFor(request)) await addToCount(db, bucket, key, rules[key.scope], { now });
  } catch (err) {
    logger.error('Rate limiter could not record a failure', { bucket, detail: err?.message });
  }
}

module.exports = { LIMITS, clientAddress, keysFor, enforce, assertNotBlocked, recordFailure };
