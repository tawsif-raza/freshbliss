import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ADDRESS_LIMITS, MAX_ADDRESS_LENGTH, addressErrors, formatAddress } from '../lib/address.js';
import { areaFrom, parseNominatim, reverseGeocode } from '../lib/geocode.js';

describe('formatAddress', () => {
  it('joins the parts into one line, like the example in the brief', () => {
    assert.equal(formatAddress({ type: 'home', flat: 'Flat 4B', area: 'MG Road', landmark: 'Metro', pincode: '560041' }), 'Home: Flat 4B, MG Road, near Metro. Pincode: 560041');
  });

  it('uses the tag as the label, and falls back to Home for an unknown one', () => {
    assert.match(formatAddress({ type: 'work', flat: '1', area: 'A' }), /^Work: /);
    assert.match(formatAddress({ type: 'other', flat: '1', area: 'A' }), /^Other: /);
    assert.match(formatAddress({ type: 'nonsense', flat: '1', area: 'A' }), /^Home: /);
    assert.match(formatAddress({ flat: '1', area: 'A' }), /^Home: /);
  });

  it('leaves out an empty landmark and an empty pincode', () => {
    assert.equal(formatAddress({ type: 'home', flat: '12', area: 'Park Street', landmark: '  ', pincode: '' }), 'Home: 12, Park Street.');
    assert.equal(formatAddress({ type: 'home', flat: '12', area: 'Park Street', pincode: '560001' }), 'Home: 12, Park Street. Pincode: 560001');
  });

  it('does not write "near" twice, and tidies spaces and stray commas', () => {
    assert.equal(formatAddress({ type: 'home', flat: ' 4B,  ', area: 'MG   Road. ', landmark: 'Near Metro', pincode: '560041' }), 'Home: 4B, MG Road, near Metro. Pincode: 560041');
    assert.match(formatAddress({ type: 'home', flat: '1', area: 'A', landmark: 'near: the temple' }), /near the temple/);
  });

  it('the longest allowed line still fits the server limit of 200 characters', () => {
    const longest = formatAddress({
      type: 'other',
      flat: 'x'.repeat(ADDRESS_LIMITS.flat),
      area: 'y'.repeat(ADDRESS_LIMITS.area),
      landmark: 'z'.repeat(ADDRESS_LIMITS.landmark),
      pincode: '560041',
    });
    assert.ok(longest.length <= MAX_ADDRESS_LENGTH, `${longest.length} characters`);
  });
});

describe('addressErrors', () => {
  it('needs the house/flat and the road/area, but not the landmark', () => {
    assert.deepEqual(addressErrors({ flat: '', area: '' }), { flat: 'Enter your house, flat or block number.', area: 'Enter your apartment, road or area.' });
    assert.deepEqual(addressErrors({ flat: '  ', area: 'MG Road' }).area, null);
    assert.equal(addressErrors({ flat: '  ', area: 'MG Road' }).flat !== null, true);
    assert.deepEqual(addressErrors({ flat: '4B', area: 'MG Road' }), { flat: null, area: null });
    assert.doesNotThrow(() => addressErrors());
  });
});

describe('parseNominatim', () => {
  it('takes the postcode, road and suburb', () => {
    assert.deepEqual(parseNominatim({ address: { postcode: '560041', road: 'MG Road', suburb: 'Indiranagar', city: 'Bengaluru' } }), { pincode: '560041', road: 'MG Road', suburb: 'Indiranagar' });
  });

  it('reads a postcode written with a space, and falls back to a neighbourhood for the suburb', () => {
    assert.deepEqual(parseNominatim({ address: { postcode: '560 041', neighbourhood: 'Jayanagar' } }), { pincode: '560041', road: '', suburb: 'Jayanagar' });
  });

  it('does not accept a postcode that is not six digits', () => {
    for (const postcode of ['5600', 'ABC123', '5600411', '', undefined, 560041]) assert.equal(parseNominatim({ address: { postcode } }).pincode, '');
  });

  it('copes with a missing, empty or odd answer', () => {
    for (const bad of [undefined, null, {}, { address: null }, { address: 'x' }, 'text', 5]) assert.deepEqual(parseNominatim(bad), { pincode: '', road: '', suburb: '' });
  });

  it('joins road and suburb for the area box', () => {
    assert.equal(areaFrom({ road: 'MG Road', suburb: 'Indiranagar' }), 'MG Road, Indiranagar');
    assert.equal(areaFrom({ road: '', suburb: 'Indiranagar' }), 'Indiranagar');
    assert.equal(areaFrom({ road: '', suburb: '' }), '');
  });
});

describe('reverseGeocode', () => {
  const answer = (body, ok = true, status = 200) => async () => ({ ok, status, json: async () => body });

  it('asks Nominatim for this position and returns the parts', async () => {
    let asked = '';
    const fetchImpl = async (url) => {
      asked = url;
      return { ok: true, status: 200, json: async () => ({ address: { postcode: '560041', road: 'MG Road', suburb: 'Indiranagar' } }) };
    };
    const found = await reverseGeocode({ lat: 12.97, lon: 77.59 }, fetchImpl);
    assert.deepEqual(found, { pincode: '560041', road: 'MG Road', suburb: 'Indiranagar' });
    assert.match(asked, /^https:\/\/nominatim\.openstreetmap\.org\/reverse\?format=json/);
    assert.match(asked, /lat=12\.97&lon=77\.59/);
  });

  it('turns every failure into the same friendly message instead of throwing the raw error', async () => {
    const friendly = /could not look up your address/;
    await assert.rejects(reverseGeocode({ lat: 1, lon: 2 }, answer({}, false, 429)), friendly);
    await assert.rejects(reverseGeocode({ lat: 1, lon: 2 }, async () => { throw new TypeError('Failed to fetch'); }), friendly);
    await assert.rejects(reverseGeocode({ lat: 1, lon: 2 }, async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad json'); } })), friendly);
  });
});
