// "Use Current Location": one press asks the browser where the visitor is (it asks their permission first), looks
// the position up on OpenStreetMap, and hands back the pincode and the road/area to fill in. No Google account
// or key is needed. The work is in lib/geocode.js; every failure there arrives here as a plain message.
//
//   onFound({ pincode, area })  called with what was found (either may be '' if the map did not know it)
//   disabled                    true while the order is being paid
//
// The visitor always stays in charge: it only fills boxes they can still change, never touches the house or flat
// number, and says what it did. The line under the button says plainly that their position goes to
// OpenStreetMap, because it does (content/privacy.js says so too).

import { useState } from 'react';
import { LoaderCircle, LocateFixed } from 'lucide-react';
import { findMyAddress } from '@/lib/geocode';

export default function LocationButton({ onFound, disabled = false }) {
  const [state, setState] = useState({ status: 'idle', message: '' });
  const locating = state.status === 'locating';

  async function handleClick() {
    if (locating) return;
    setState({ status: 'locating', message: '' });
    try {
      const found = await findMyAddress();
      if (!found.pincode && !found.area) {
        setState({ status: 'error', message: 'We found your location but not an address for it. Please type your address in.' });
        return;
      }
      onFound({ pincode: found.pincode, area: found.area });
      setState({
        status: 'found',
        message: found.pincode
          ? 'Filled in from your location. Please check the pincode and area, and add your house or flat number.'
          : 'We filled in your area but could not find a pincode. Please type your pincode.',
      });
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error ? err.message : 'We could not find your location. Please type your address.' });
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || locating}
        className="inline-flex min-h-11 items-center gap-2 rounded-pill border border-brand px-4 text-nav-link text-brand-text motion-safe:transition-colors motion-safe:duration-200 hover:bg-surface-cream disabled:cursor-not-allowed disabled:opacity-60"
      >
        {locating ? <LoaderCircle size={18} className="motion-safe:animate-spin" aria-hidden="true" /> : <LocateFixed size={18} aria-hidden="true" />}
        {locating ? 'Finding your location...' : 'Use Current Location'}
      </button>
      <p role="status" className={`mt-2 text-small ${state.status === 'error' ? 'font-bold text-danger' : 'text-ink-muted'}`}>
        {state.message || 'Uses your device location and OpenStreetMap to fill in your pincode and area. Nothing is saved.'}
      </p>
    </div>
  );
}
