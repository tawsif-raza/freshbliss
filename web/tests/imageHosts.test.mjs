import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BLUR_DATA_URL, OPTIMIZED_IMAGE_HOSTS, canOptimize, remotePatterns } from '../lib/imageHosts.mjs';
import { HERO_IMAGES, placeholderImagesFor } from '../lib/images.js';
import { OUR_ROOTS, TESTIMONIALS } from '../content/storefront.js';
import config from '../next.config.mjs';

describe('which photos the optimiser may fetch', () => {
  it('allows the hosts on the list, over https only', () => {
    assert.equal(canOptimize('https://images.unsplash.com/photo-1?w=800'), true);
    assert.equal(canOptimize('https://firebasestorage.googleapis.com/v0/b/x/o/y.jpg'), true);
    assert.equal(canOptimize('http://images.unsplash.com/photo-1'), false, 'plain http is not optimised');
  });

  it('refuses everything else, so the optimiser can never be used as an open proxy (they are shown as they are instead)', () => {
    for (const src of ['https://evil.example/a.jpg', 'https://images.unsplash.com.evil.example/a.jpg', 'https://evil.example/https://images.unsplash.com/a.jpg', '/local.jpg', 'data:image/png;base64,AAAA', '', undefined, null, 42]) {
      assert.equal(canOptimize(src), false, String(src));
    }
  });

  it('next.config allows exactly the same hosts, as https', () => {
    assert.deepEqual(remotePatterns, OPTIMIZED_IMAGE_HOSTS.map((hostname) => ({ protocol: 'https', hostname })));
    assert.deepEqual(config.images.remotePatterns, remotePatterns);
  });

  it('every photo the shop itself ships is on the list, so none of them is left unoptimised', () => {
    const shipped = [...Object.values(HERO_IMAGES), OUR_ROOTS.image, ...TESTIMONIALS.map((t) => t.avatar)];
    for (const category of ['Fresh', 'Fitness', 'Ramadan', 'Seasonal', 'Exotics', 'Immunity', 'Combos', 'Ice Cream', 'Dairy', 'Beverages', 'Cut Fruits']) shipped.push(...placeholderImagesFor({ id: 'x', category }));
    assert.ok(shipped.length > 15);
    for (const src of shipped) assert.equal(canOptimize(src), true, src);
  });

  it('serves modern formats and caches photos for a month', () => {
    assert.deepEqual(config.images.formats, ['image/avif', 'image/webp']);
    assert.ok(config.images.minimumCacheTTL >= 60 * 60 * 24 * 30);
  });

  it('the placeholder tile is an inline image (nothing to download) that works in a browser, where Buffer does not exist', () => {
    assert.match(BLUR_DATA_URL, /^data:image\/svg\+xml,/);
    assert.doesNotMatch(BLUR_DATA_URL, /base64/);
    assert.ok(BLUR_DATA_URL.length < 300);
  });
});
