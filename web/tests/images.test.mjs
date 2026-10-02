import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HERO_IMAGES, photo, placeholderImagesFor, resizeImage } from '../lib/images.js';

const SEEDED = ['classic-fresh-mix', 'tropical-bliss', 'gym-fuel-pack', 'ramadan-special-box', 'mango-season-box', 'exotic-berry-medley', 'citrus-immunity-shield', 'midnight-mango-indulgence', 'keto-green-pack'];

describe('placeholder photos', () => {
  it('every seeded box has its own photos (2 or more, so the gallery has thumbnails)', () => {
    for (const id of SEEDED) {
      const images = placeholderImagesFor({ id, category: null });
      assert.ok(images.length >= 2, id);
      assert.equal(new Set(images).size, images.length, `${id} has no repeated photo`);
    }
  });

  it('different boxes get different first photos', () => {
    const firsts = SEEDED.map((id) => placeholderImagesFor({ id })[0]);
    assert.ok(new Set(firsts).size >= 4, 'the shop grid does not show the same picture over and over');
  });

  it('a box added later falls back to its category, then to a general fruit photo', () => {
    assert.deepEqual(placeholderImagesFor({ id: 'new-box', category: 'Fitness' }), placeholderImagesFor({ id: 'other', category: 'Fitness' }));
    assert.notDeepEqual(placeholderImagesFor({ id: 'x', category: 'Fitness' }), placeholderImagesFor({ id: 'x', category: 'Seasonal' }));
    assert.ok(placeholderImagesFor({ id: 'x', category: 'Unheard-of' }).length >= 1);
    assert.ok(placeholderImagesFor({ id: 'x' }).length >= 1);
  });

  it('every link is an https Unsplash photo asking for a cropped, compressed 800 pixel version', () => {
    const all = [...SEEDED.flatMap((id) => placeholderImagesFor({ id })), ...Object.values(HERO_IMAGES)];
    for (const url of all) {
      const u = new URL(url);
      assert.equal(u.protocol, 'https:');
      assert.equal(u.hostname, 'images.unsplash.com');
      assert.match(u.pathname, /^\/photo-\d+-[0-9a-f]+$/);
      assert.equal(u.searchParams.get('fit'), 'crop');
      assert.equal(u.searchParams.get('auto'), 'format');
    }
    assert.equal(new URL(photo('1-a')).searchParams.get('w'), '800');
  });

  it('has a banner for each season', () => {
    assert.deepEqual(Object.keys(HERO_IMAGES).sort(), ['everyday', 'ramadan']);
    assert.notEqual(HERO_IMAGES.everyday, HERO_IMAGES.ramadan);
    assert.equal(new URL(HERO_IMAGES.everyday).searchParams.get('w'), '1600');
  });
});

describe('resizing', () => {
  it('asks Unsplash for a smaller copy of the same picture', () => {
    const big = photo('1610832958506-aa56368176cf');
    const small = resizeImage(big, 160);
    assert.equal(new URL(small).searchParams.get('w'), '160');
    assert.equal(new URL(small).pathname, new URL(big).pathname);
    assert.equal(new URL(small).searchParams.get('fit'), 'crop');
  });
  it('leaves any other address alone, and never throws', () => {
    for (const url of ['https://shop.example.com/box.jpg', '/relative.jpg', 'not a url', '', undefined, null]) {
      assert.equal(resizeImage(url, 160), url);
    }
  });
});
