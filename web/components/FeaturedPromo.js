// The "Featured Product Promo" banner on the home page: a deep-green card split in two, words on the left and a
// gently floating fruit photo on the right (stacked, photo second, on a phone).
//
// Like the hero, it is always dark, so its cream and gold are fixed colours that do not change with the page theme.
// "Buy now" opens the Beverages tab of the shop (there is no kiwi-juice box yet, so it never points at a missing page).
// The photo is the shop's placeholder kiwi (lib/images.js); swap it when a real juice photo exists. The float is a CSS
// animation that stops for visitors who asked their device for less motion (styles/globals.css).

import Link from 'next/link';
import { Citrus, Droplet, Sparkles } from 'lucide-react';
import OptimizedImage from '@/components/OptimizedImage';
import { PROMO_IMAGE } from '@/lib/images';

const BADGES = [
  { label: 'Natural Juice', Icon: Droplet },
  { label: 'Fresh Fruits', Icon: Citrus },
  { label: '100% Pure', Icon: Sparkles },
];

export default function FeaturedPromo() {
  return (
    <section aria-labelledby="promo-title" className="fb-container py-6 md:py-10">
      <div className="relative isolate overflow-hidden rounded-3xl bg-[#173f2a] text-[#f5f1e9] shadow-2xl">
        {/* A soft lighter disc behind the fruit, for depth. Decorative. */}
        <div aria-hidden="true" className="absolute -right-24 top-1/2 -z-10 size-[28rem] -translate-y-1/2 rounded-full bg-[#214c34] md:size-[34rem]" />

        <div className="grid items-center gap-10 px-6 py-12 md:grid-cols-2 md:gap-6 md:px-14 md:py-16">
          <div>
            <p className="text-label text-gold-bright">Fresh Juice</p>
            <h2 id="promo-title" className="mt-3 max-w-md text-[2.5rem] font-bold leading-[1.05] text-[#f5f1e9] md:text-6xl">
              The perfect Kiwi Juice
            </h2>
            <p className="mt-5 max-w-sm text-body text-[#f5f1e9]/90">Keep your body healthy, made with fresh and natural fruits to refresh you.</p>

            <Link
              href="/?category=beverages#shop"
              className="mt-8 inline-flex min-h-11 items-center justify-center rounded-full border border-gold-bright bg-transparent px-6 py-2 text-nav-link text-gold-bright motion-safe:transition-colors hover:bg-gold-bright hover:text-[#173f2a]"
            >
              Buy now
            </Link>

            <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-3" aria-label="Why our juice">
              {BADGES.map(({ label, Icon }) => (
                <li key={label} className="flex items-center gap-2 text-small font-semibold text-[#f5f1e9]">
                  <span className="grid size-8 place-items-center rounded-full bg-[#f5f1e9]/10">
                    <Icon size={16} strokeWidth={2.2} className="text-gold-bright" aria-hidden="true" />
                  </span>
                  {label}
                </li>
              ))}
            </ul>
          </div>

          {/* The floating fruit. The photo has a plain background, so it is cropped to a circle with a gold ring
              rather than shown as a loose rectangle. */}
          <div className="grid place-items-center">
            <div className="relative aspect-square w-full max-w-sm motion-safe:animate-[fb-float_6s_ease-in-out_infinite] md:max-w-md">
              <OptimizedImage
                src={PROMO_IMAGE}
                alt="A kiwi cut in half, showing its bright green flesh"
                fill
                sizes="(min-width: 768px) 28rem, 90vw"
                className="rounded-full object-cover shadow-2xl ring-4 ring-gold-bright/70"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
