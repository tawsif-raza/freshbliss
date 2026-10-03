// The ticker under the banner: the shop's promises scrolling past in a loop. The words are in content/storefront.js.
//
// The list is drawn twice and the track slides left by exactly one copy, so the loop has no visible jump (the
// keyframes are in styles/globals.css). The second copy is hidden from screen readers so each promise is read
// once. The parent clips with overflow-hidden, so the moving track can never make the page scroll sideways.
// Like the hero, it is a dark band whose cream and deep green are fixed colours that do not change with the page
// theme. It pauses while hovered, and for visitors who asked their device for less motion it stops and wraps into a
// centred, static row (see .fb-marquee in globals.css).

import { MARQUEE_ITEMS } from '@/content/storefront';

function Group({ hidden = false }) {
  return (
    <ul aria-hidden={hidden || undefined} className="fb-marquee-group flex shrink-0 items-center">
      {MARQUEE_ITEMS.map((item) => (
        <li key={item} className="px-6 text-nav-link whitespace-nowrap">
          {item}
          <span aria-hidden="true" className="ml-12 text-gold-bright">
            •
          </span>
        </li>
      ))}
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
