'use strict';

// When should the shop be told that a box is running out? Pure functions (no Firebase), so tests/stockAlerts.test.js can
// check every case without an emulator. functions/lowStock.js runs this on each change to a product.
//
// An alert is raised only when stock CROSSES a line, never for every sale below it, so one box that is nearly gone gives one
// message, not one per order:
//   LOW_STOCK     stock fell from above the threshold to the threshold or below, but is not yet zero
//   OUT_OF_STOCK  stock fell to zero from anything above zero
// Restocking, a price edit, or switching the product off raises nothing. A product that is switched off (`active: false`)
// is not on sale, so its stock is nobody's emergency.

const DEFAULT_THRESHOLD = 5;

// The threshold to use: the configured one if it is a whole number of at least 1, otherwise the default. (Outside a deployed
// function, a Firebase parameter reads as 0; a typo in the settings file must not switch the alert off either.)
const thresholdOf = (value) => (Number.isInteger(value) && value >= 1 ? value : DEFAULT_THRESHOLD);

// Stock as a whole number of boxes, or null when the field is missing or not a usable number (never guessed).
const stockOf = (product) => (Number.isInteger(product?.stock) && product.stock >= 0 ? product.stock : null);

// before / after: the product's data before and after the change (either may be missing).
// Returns 'LOW_STOCK', 'OUT_OF_STOCK' or null.
function stockAlertFor(before, after, threshold = DEFAULT_THRESHOLD) {
  const limit = thresholdOf(threshold);
  if (!after || after.active === false) return null;

  const was = stockOf(before);
  const now = stockOf(after);
  if (was === null || now === null || now >= was) return null; // not a drop, or not a number we can trust

  if (now === 0) return 'OUT_OF_STOCK';
  return was > limit && now <= limit ? 'LOW_STOCK' : null;
}

module.exports = { DEFAULT_THRESHOLD, thresholdOf, stockAlertFor };
