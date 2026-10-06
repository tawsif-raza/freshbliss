// "Shop by category": photo tiles, one per category that really holds boxes, each leading to that tab of the shop below
// (the same links the footer uses: /?category=fresh#shop). The tiles are built from the LIVE catalogue
// (lib/categories.js: categoryTiles), so a category with no boxes never shows and each photo is of a real box in it.
// Nothing is drawn until the catalogue has loaded, so there is never an empty frame.
//
// Phones: two across. Tablets: three. Desktops: four. The label sits low on a deep-green fade so it reads on any photo.

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import OptimizedImage from '@/components/OptimizedImage';
import Reveal from '@/components/Reveal';
import { CATEGORIES } from '@/content/storefront';
import { categoryTiles } from '@/lib/categories';

export default function ShopByCategory({ products }) {
  const tiles = categoryTiles(products, CATEGORIES);
  if (tiles.length === 0) return null;

  return (
    <section aria-labelledby="categories-title" className="fb-container pt-14.5">
      <Reveal>
        <p className="text-label text-gold">Browse</p>
        <h2 id="categories-title" className="mt-2 text-heading-2 text-brand-text">
          Shop by category
        </h2>
        <p className="mt-2 max-w-xl text-body text-ink-muted">Know what you are craving? Go straight to it.</p>
      </Reveal>

      <ul className="mt-8.5 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
        {tiles.map((tile, index) => (
          <Reveal key={tile.id} as="li" delay={Math.min(index, 4) * 0.06}>
            <Link
              href={tile.href}
              className="group relative block aspect-[4/5] overflow-hidden rounded-2xl bg-hero-deep shadow-card"
            >
              <OptimizedImage
                src={tile.image}
                alt={tile.alt}
                fill
                sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
                className="object-cover motion-safe:transition-transform motion-safe:duration-500 motion-safe:group-hover:scale-105"
              />
              <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#102d1f]/90 via-[#102d1f]/20 to-transparent" />
              <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-4 text-[#f5f1e9]">
                <span>
                  <span className="block font-serif text-[20px] leading-tight font-bold">{tile.label}</span>
                  <span className="mt-1 block text-small text-[#f5f1e9]/85">
                    {tile.count} {tile.count === 1 ? 'box' : 'boxes'}
                  </span>
                </span>
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gold-bright text-[#173f2a] motion-safe:transition-transform motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5">
                  <ArrowUpRight size={18} strokeWidth={2.25} aria-hidden="true" />
                </span>
              </span>
            </Link>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}
