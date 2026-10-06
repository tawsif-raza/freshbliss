// Draws the app icons in public/icons/ from the same green-and-gold "F" as the tab icon (pages/_document.js).
// Run by hand when the brand mark changes:  node scripts/build-icons.mjs   (the PNGs are committed, so a normal build
// never needs this). It uses `sharp`, which Next.js already installs for image optimisation, so nothing is added.
//
// PLACEHOLDER: this is a letter, not the brand's real logo (there is no logo file yet; see /README.md, "Logo").
// Replace the PNGs, or change drawIcon() below, once the real mark exists.
//
//   icon-192.png, icon-512.png   rounded square: shown by Android and desktop browsers ("any")
//   icon-maskable-512.png        full-bleed square with the F kept inside the centre 60%: Android crops it to a circle
//                                or squircle, so nothing important may sit near the edge ("maskable")
//   apple-touch-icon.png         180px, full-bleed: iOS rounds the corners itself and fills transparency with black

import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const BRAND = '#173f2a';
const GOLD = '#c99b3b';
const OUT = new URL('../public/icons/', import.meta.url);

// size: pixel width; rounded: draw rounded corners; scale: how big the F is (1 = the tab icon's proportion)
function drawIcon({ size, rounded, scale }) {
  const radius = rounded ? Math.round(size * 0.22) : 0;
  const fontSize = Math.round(size * 0.66 * scale);
  const baseline = Math.round(size * 0.5 + fontSize * 0.34);
  return Buffer.from(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'>` +
      `<rect width='${size}' height='${size}' rx='${radius}' fill='${BRAND}'/>` +
      `<text x='${size / 2}' y='${baseline}' font-family='Georgia,"Times New Roman",serif' font-size='${fontSize}' font-weight='700' text-anchor='middle' fill='${GOLD}'>F</text>` +
      `</svg>`,
  );
}

const ICONS = [
  ['icon-192.png', { size: 192, rounded: true, scale: 1 }],
  ['icon-512.png', { size: 512, rounded: true, scale: 1 }],
  ['icon-maskable-512.png', { size: 512, rounded: false, scale: 0.78 }],
  ['apple-touch-icon.png', { size: 180, rounded: false, scale: 0.9 }],
];

await mkdir(OUT, { recursive: true });
for (const [name, options] of ICONS) {
  const png = await sharp(drawIcon(options)).png({ compressionLevel: 9 }).toBuffer();
  await writeFile(new URL(name, OUT), png);
  console.log(`${name}  ${options.size}x${options.size}  ${png.length} bytes`);
}
