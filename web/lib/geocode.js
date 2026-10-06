// "Use current location": find where the visitor is and turn it into a pincode and an area, with no Google
// account or API key. The browser gives the position (navigator.geolocation, which asks the visitor first), and
// the free OpenStreetMap Nominatim service turns it into an address.
//
// PRIVACY: the visitor's coordinates are sent to nominatim.openstreetmap.org, a third party. That only happens
// when they press the button, and nothing is stored by us. content/privacy.js says so. Nominatim's usage policy
// allows light use like this (one request per press, from the visitor's own browser); if the shop grows, use a
// paid geocoder or host Nominatim. vercel.json allows the address in its Content Security Policy and in its
// Permissions-Policy (which would otherwise switch geolocation off entirely).
//
// Every step can fail (permission refused, no signal, no network, an odd answer), so each one is wrapped and
// reports a plain-language reason instead of throwing at the page.

const NOMINATIM = 'https://nominatim.openstreetmap.org/reverse';
const LOOKUP_TIMEOUT_MS = 10000;

// What Nominatim's `address` object calls the neighbourhood varies from place to place; take the first present.
const SUBURB_KEYS = ['suburb', 'neighbourhood', 'city_district', 'quarter'];

const text = (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : '');

// Pull the useful parts out of a Nominatim reverse-geocoding answer. Always returns the same shape.
//   -> { pincode: '560041' | '', road: string, suburb: string }
export function parseNominatim(data) {
  const a = data && typeof data === 'object' && data.address && typeof data.address === 'object' ? data.address : {};
  const digits = text(a.postcode).replace(/\s+/g, ''); // Nominatim may say "560 041"
  const suburbKey = SUBURB_KEYS.find((key) => text(a[key]));
  return {
    pincode: /^\d{6}$/.test(digits) ? digits : '',
    road: text(a.road),
    suburb: suburbKey ? text(a[suburbKey]) : '',
  };
}

// "MG Road, Indiranagar": the road and suburb joined for the area box (either may be missing).
export const areaFrom = ({ road, suburb }) => [road, suburb].filter(Boolean).join(', ');

// Where is the device? Resolves { lat, lon }, or rejects with an Error whose message can be shown as it is.
export function getPosition() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('This browser cannot share your location. Please type your address instead.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => {
        const messages = {
          1: 'Location permission was turned off. You can allow it in your browser settings, or type your address.',
          2: 'We could not work out your location. Please type your address instead.',
          3: 'Finding your location took too long. Please try again, or type your address.',
        };
        reject(new Error(messages[err?.code] ?? messages[2]));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  });
}

// Turn coordinates into { pincode, road, suburb } through Nominatim. `fetchImpl` is injectable for tests.
export async function reverseGeocode({ lat, lon }, fetchImpl = globalThis.fetch) {
  const url = `${NOMINATIM}?format=json&addressdetails=1&zoom=18&accept-language=en&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) throw new Error(`status ${response.status}`);
    return parseNominatim(await response.json());
  } catch {
    throw new Error('We could not look up your address just now. Please type it in instead.');
  } finally {
    clearTimeout(timer);
  }
}

// The whole thing: ask for the position, then look it up. Resolves { pincode, road, suburb, area }.
export async function findMyAddress(fetchImpl) {
  const parts = await reverseGeocode(await getPosition(), fetchImpl);
  return { ...parts, area: areaFrom(parts) };
}
