// The delivery address on the checkout page: its parts, and the one line they are joined into for the order.
// Pure functions (no React, no Firebase), so they are easy to test.
//
// The customer fills in separate boxes (house or flat, road or area, an optional landmark) and picks a tag
// (Home, Work, Other). The server stores ONE address string, at most 200 characters, so formatAddress() joins
// the parts into one tidy line, for example:
//     "Home: Flat 4B, MG Road, near Metro. Pincode: 560041"

// The tags. `label` is what is written at the front of the address line.
export const ADDRESS_TYPES = [
  { id: 'home', label: 'Home' },
  { id: 'work', label: 'Work' },
  { id: 'other', label: 'Other' },
];
export const DEFAULT_ADDRESS_TYPE = 'home';

// How long each part may be. The longest possible line is 40 + 80 + 40 plus the label, the "near " and the
// pincode wording (about 31 characters), which stays under the server's 200 character limit.
export const ADDRESS_LIMITS = { flat: 40, area: 80, landmark: 40 };
export const MAX_ADDRESS_LENGTH = 200; // the server's limit (firebase/functions/createCheckout.js)

// Whitespace squeezed to single spaces, and stray commas or full stops trimmed off the ends.
const tidy = (value) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.;]+|[\s,.;]+$/g, '');

// "Near Metro", "near metro" and "Metro" all read as "near Metro" in the line (no "near near").
const landmarkText = (value) => tidy(String(value ?? '').replace(/^\s*near\b[\s:,-]*/i, ''));

// The single address line for the order. Empty parts are left out, so a missing landmark leaves no trace.
//   parts  { type, flat, area, landmark, pincode }
export function formatAddress({ type, flat, area, landmark, pincode } = {}) {
  const label = ADDRESS_TYPES.find((t) => t.id === type)?.label ?? ADDRESS_TYPES.find((t) => t.id === DEFAULT_ADDRESS_TYPE).label;
  const place = [tidy(flat), tidy(area)].filter(Boolean).join(', ');
  const near = landmarkText(landmark);
  const body = [place, near ? `near ${near}` : ''].filter(Boolean).join(', ');
  const pin = tidy(pincode);
  return `${label}: ${body}.${pin ? ` Pincode: ${pin}` : ''}`.trim();
}

// What is wrong with the typed parts, as { flat, area } messages (null when fine). The landmark is optional.
export function addressErrors({ flat, area } = {}) {
  return {
    flat: tidy(flat) ? null : 'Enter your house, flat or block number.',
    area: tidy(area) ? null : 'Enter your apartment, road or area.',
  };
}
