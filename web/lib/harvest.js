// The "Harvest & Health" facts of a product: where it was grown, how much energy it holds, and what is good
// about it. Pure functions (no React, no Firebase), so they are easy to test.
//
// All three are optional fields the shop owner fills in Firestore. A missing or malformed one becomes
// null / [] and the product page leaves that card out; we never make up a figure.
//
//   origin        text, for example "Ratnagiri, Konkan coast"
//   calories      text, for example "About 45 kcal per 100 g". A whole number (the older format) is read as kcal per box
//   storage       how to keep it, for chilled and frozen products, for example "Keep Refrigerated below 4°C"
//   keyBenefits   a list of short phrases, for example ["High in vitamin C", "Rich in fibre"]

const MAX_BENEFITS = 6;
const MAX_STORAGE_LENGTH = 60;

const cleanText = (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);

export function normaliseOrigin(value) {
  return cleanText(value);
}

// How a chilled or frozen product must be kept, as text ("Keep Frozen at -18°C"). Missing or malformed is null,
// and the product page then shows no badge.
export function normaliseStorage(value) {
  const text = cleanText(value);
  return text ? text.slice(0, MAX_STORAGE_LENGTH) : null;
}

export function normaliseCalories(value) {
  if (Number.isInteger(value) && value > 0) return `${value} kcal per box`;
  return cleanText(value);
}

export function normaliseBenefits(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const item of value) {
    const text = cleanText(item);
    if (text && !seen.has(text.toLowerCase())) {
      seen.add(text.toLowerCase());
      out.push(text);
    }
  }
  return out.slice(0, MAX_BENEFITS);
}

// Is there anything to show? (When not, the whole section is left out.)
export const hasHarvestFacts = ({ origin, calories, keyBenefits }) => Boolean(origin || calories || (keyBenefits && keyBenefits.length > 0));
