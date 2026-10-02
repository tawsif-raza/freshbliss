// "Add something with it": a sliding row of small product cards under a box's details, each with a quick
// "+ Add" button, so a customer can put a complementary box in the cart without leaving the page.
//
//   product    the box being viewed (it is never suggested to itself)
//   products   the whole live catalogue
//   status     'loading' | 'ready' | 'error' (from useProducts)
//   onAdd      (product, { size }) => { ok, message }   (CartContext.addToCart: it shows the toast)
//
// Which boxes: lib/related.js (other categories first, never sold out). With nothing to suggest the whole
// section is left out. On large screens arrows move the row; on touch screens it is a swipe, and the
// cards snap into place. The row is a keyboard-reachable scroll area too.

import Image from 'next/image';
import Link from 'next/link';
import { useRef } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { MiniProductSkeleton } from '@/components/ProductSkeleton';
import StockBadge from '@/components/StockBadge';
import { resizeImage } from '@/lib/images';
import { pickRelated } from '@/lib/related';

function MiniCard({ product, onAdd }) {
  const { id, name, price, stock, images, sizes } = product;
  const href = `/products/${id}`;
  const image = images[0];

  return (
    <li className="w-44 shrink-0 snap-start sm:w-52">
      <article aria-label={name} className="flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface-card shadow-card">
        <Link href={href} className="relative block aspect-[4/3] bg-surface-cream" tabIndex={-1} aria-hidden="true">
          {image ? <Image src={resizeImage(image, 420)} alt="" fill sizes="208px" unoptimized className="object-cover" /> : <span className="grid h-full place-items-center text-[12px] text-ink-muted">Photo coming soon</span>}
        </Link>
        <div className="flex flex-1 flex-col gap-2 p-3">
          <h3 className="text-nav-link text-ink">
            <Link href={href} className="hover:underline">
              {name}
            </Link>
          </h3>
          <div>
            <StockBadge stock={stock} className="!px-2 !py-0.5 !text-[12px]" />
          </div>
          <div className="mt-auto flex items-center justify-between gap-2 pt-1">
            <p className="text-heading-3 text-brand-text">₹{price}</p>
            <button
              type="button"
              onClick={() => onAdd(product, { size: sizes[0].id })}
              aria-label={`Add ${name} to cart`}
              className="inline-flex min-h-11 items-center gap-1 rounded-pill bg-gold-bright px-3 text-nav-link text-on-gold motion-safe:transition-[filter] hover:brightness-95"
            >
              <Plus size={16} aria-hidden="true" />
              Add
            </button>
          </div>
        </div>
      </article>
    </li>
  );
}

export default function RelatedProducts({ product, products, status, onAdd }) {
  const row = useRef(null);

  if (status === 'error') return null; // the page already told them; a missing suggestion is not worth a second warning

  const related = status === 'ready' ? pickRelated(products, product) : [];
  if (status === 'ready' && related.length === 0) return null;

  // Move by about one card and a bit, smoothly (instantly if the visitor wants less motion).
  function slide(direction) {
    const el = row.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: direction * (el.clientWidth * 0.8), behavior: reduce ? 'auto' : 'smooth' });
  }

  const arrow =
    'hidden size-11 place-items-center rounded-full border border-green-accent bg-surface-card text-brand-text hover:bg-surface-cream md:grid';

  return (
    <section aria-labelledby="related-title" className="mt-12">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-label text-gold">Pairs well</p>
          <h2 id="related-title" className="mt-1 text-heading-3 text-ink">
            Add something with it
          </h2>
        </div>
        {status === 'ready' && related.length > 2 && (
          <div className="flex gap-2">
            <button type="button" onClick={() => slide(-1)} aria-label="Previous suggestions" className={arrow}>
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => slide(1)} aria-label="Next suggestions" className={arrow}>
              <ChevronRight size={20} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {status === 'loading' ? (
        <>
          <p role="status" className="sr-only">
            Loading suggestions
          </p>
          <div className="mt-4 flex gap-4 overflow-hidden">
            {Array.from({ length: 4 }, (_, i) => (
              <MiniProductSkeleton key={i} />
            ))}
          </div>
        </>
      ) : (
        <ul
          ref={row}
          tabIndex={0}
          aria-label="Suggested fruit boxes"
          className="-mx-6 mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-6 pb-3 [scrollbar-width:thin] motion-reduce:scroll-auto"
        >
          {related.map((p) => (
            <MiniCard key={p.id} product={p} onAdd={onAdd} />
          ))}
        </ul>
      )}
    </section>
  );
}
