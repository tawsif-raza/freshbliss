import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// The install-to-home-screen files. A manifest pointing at a missing or wrongly sized icon silently stops the browser
// offering "Install", so this checks every reference.
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const manifest = JSON.parse(read('public/manifest.webmanifest'));
const tokens = read('styles/tokens.css');

// width and height of a PNG, from its header
function pngSize(path) {
  const bytes = readFileSync(new URL(`../public${path}`, import.meta.url));
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG', `${path} is a PNG`);
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

describe('web app manifest', () => {
  it('has what a browser needs to offer "Install"', () => {
    assert.ok(manifest.name && manifest.short_name);
    assert.equal(manifest.display, 'standalone');
    assert.ok(manifest.start_url.startsWith('/') && manifest.scope === '/');
    const sizes = manifest.icons.filter((i) => i.purpose === 'any').map((i) => i.sizes);
    assert.ok(sizes.includes('192x192') && sizes.includes('512x512'), 'a 192 and a 512 icon');
    assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'), 'a maskable icon');
  });

  it('every icon exists and is exactly the size it claims', () => {
    for (const icon of manifest.icons) {
      assert.ok(existsSync(new URL(`../public${icon.src}`, import.meta.url)), `${icon.src} exists`);
      assert.equal(pngSize(icon.src), icon.sizes, icon.src);
    }
    assert.equal(pngSize('/icons/apple-touch-icon.png'), '180x180');
  });

  it('uses the brand colours from the light theme', () => {
    const light = tokens.slice(tokens.indexOf('{'), tokens.indexOf('}')); // the first rule: the light theme
    const value = (name) => light.match(new RegExp(`--fb-${name}: *(#[0-9a-fA-F]{6})`))?.[1].toLowerCase();
    assert.equal(manifest.theme_color, value('brand'));
    assert.equal(manifest.background_color, value('surface-page'));
  });

  it('is linked from every page, with the theme colour and the iOS icon', () => {
    const doc = read('pages/_document.js');
    assert.ok(doc.includes('rel="manifest" href="/manifest.webmanifest"'));
    assert.ok(doc.includes(`name="theme-color" content="${manifest.theme_color}"`));
    assert.ok(doc.includes('rel="apple-touch-icon" href="/icons/apple-touch-icon.png"'));
  });
});
