// The ticker under the banner: the shop's promises scrolling past in a loop. The words are in content/storefront.js.
//
// The list is drawn twice and the track slides left by exactly one copy, so the loop has no visible jump (the
// keyframes are in styles/globals.css). The second copy is hidden from screen readers so each promise is read
// once. The parent clips with overflow-hidden, so the moving track can never make the page scroll sideways.
// Like the hero, it is a dark band whose cream and deep green are fixed colours that do not change with the page
// theme. It pauses while hovered, and for visitors who asked their device for less motion it stops and wraps into a
// centred, static row (see .fb-marquee in globals.css).

import { CalendarClock, Leaf, Sprout, Truck } from 'lucide-react';
import { MARQUEE_ITEMS } from '@/content/storefront';

// One icon per promise, chosen by its `id` (no emoji: the design rules forbid them, and they draw differently on every phone).
const ICONS = { organic: Leaf, delivery: Truck, farm: Sprout, windows: CalendarClock };

function Group({ hidden = false }) {
  return (
    <ul aria-hidden={hidden || undefined} className="fb-marquee-group flex shrink-0 items-center">
      {MARQUEE_ITEMS.map(({ id, text }) => {
        const Icon = ICONS[id] ?? Leaf;
        return (
          <li key={id} className="flex items-center px-6 text-nav-link whitespace-nowrap">
            <Icon size={18} strokeWidth={2} aria-hidden="true" className="mr-2.5 text-gold-bright" />
            {text}
            <span aria-hidden="true" className="ml-12 text-gold-bright">
              •
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default function Marquee() {
  return (
    <section aria-label="Our promises" className="fb-no-print overflow-hidden bg-[#173f2a] py-3 text-[#f5f1e9]">
      <div className="fb-marquee flex w-max">
        <Group />
        <Group hidden />
      </div>
    </section>
  );
}
