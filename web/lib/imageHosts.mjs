// Which photo hosts the image optimiser (next/image) may fetch from, in ONE place: next.config.mjs allows them and
// components/OptimizedImage.js checks against the same list. It is a .mjs file so the Next config can import it.
//
// Why a list at all: if the optimiser fetched ANY address it would be an open proxy anyone could point at their own
// images, at our cost. So it only serves the hosts below. A product whose photo is on some other host still shows: it is
// sent to the visitor as it is, unoptimised (see canOptimize), instead of breaking.
//
// Add a host here when the shop starts keeping real product photos somewhere new (docs/GO_LIVE.md, section 8.3).

export const OPTIMIZED_IMAGE_HOSTS = [
  'images.unsplash.com', // the placeholder photography (lib/images.js)
  'firebasestorage.googleapis.com', // photos uploaded to Firebase Storage
  'storage.googleapis.com', // photos in a Google Cloud Storage bucket
];

// next.config.mjs `images.remotePatterns`.
export const remotePatterns = OPTIMIZED_IMAGE_HOSTS.map((hostname) => ({ protocol: 'https', hostname }));

// True when next/image may optimise this address: an https link on a listed host.
export function canOptimize(src) {
  if (typeof src !== 'string') return false;
  try {
    const u = new URL(src);
    return u.protocol === 'https:' && OPTIMIZED_IMAGE_HOSTS.includes(u.hostname);
  } catch {
    return false; // a relative path (/hero.jpg) is also optimisable, but nothing here uses one
  }
}

// A plain warm-cream tile shown while a photo loads, so the card fills softly instead of popping in. It is a tiny
// inline SVG, the same for every photo, so nothing is downloaded or invented per image.
export const BLUR_DATA_URL = `data:image/svg+xml,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 3'><rect width='4' height='3' fill='#ece5d3'/></svg>")}`;
