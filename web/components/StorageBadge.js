// The temperature badge on a product page: a small frosted, cool-blue pill with a snowflake, saying how a chilled
// or frozen product must be kept ("Keep Frozen at -18°C"). It sits just under the price.
//
//   storage    the text to show. With none, nothing is drawn (every product without a `storage` field).
//   className  extra spacing from the page
//
// Colours: the pale blue, its border and the text are the "chill" colours defined in styles/globals.css. They are
// fixed (not tied to the light and dark page themes) because the pill brings its own light background, so it
// reads the same in both.

import { Snowflake } from 'lucide-react';

export default function StorageBadge({ storage, className = '' }) {
  if (!storage) return null;

  return (
    <p className={`inline-flex items-center gap-2 rounded-pill border border-chill-line bg-chill/80 px-3 py-1.5 text-small font-bold text-chill-text backdrop-blur-sm ${className}`}>
      <Snowflake size={16} strokeWidth={2.25} className="shrink-0 text-chill-icon" aria-hidden="true" />
      {storage}
    </p>
  );
}
