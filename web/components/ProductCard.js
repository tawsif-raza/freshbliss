// One fruit box in a product grid.
// Presentational: it gets everything through props, so it works the same with the cart context, a
// test, or a different page.
//
//   product           a normalised product from useProducts()
//   wishlisted        is the heart on?
//   onToggleWishlist  (productId) => void
//   onAdd             (product, { size }) => { ok, message }   (CartContext.addToCart)
//
// The look: a cream-white card with a hairline border. On hover it lifts a little and its shadow deepens, and
// the photo inside zooms slowly while the card keeps its shape (the photo sits in an overflow-hidden frame).
// A floating gold badge sits on the photo. Shows a live stock badge, a size row (when there is more than one
// size) and the price for the chosen size. The photo and the name open the product page. The motion stops for
// visitors who asked their device for less motion.

import OptimizedImage from '@/components/OptimizedImage';
import Link from 'next/link';
import { useId, useState } from 'react';
import SizeSelector from '@/components/SizeSelector';
import StockBadge from '@/components/StockBadge';
import { badgeFor } from '@/lib/badges';
import { unitPrice } from '@/lib/pricing';

function HeartIcon({ filled }) {
  // Outline heart, 1.75px stroke (Lucide-style). The brand has not supplied icons yet.
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  );
}

export default function ProductCard({ product, wishlisted = false, onToggleWishlist, onAdd }) {
  const { id, name, description, stock, images, sizes } = product;
  const soldOut = stock <= 0;
  const image = images[0];
  const badge = badgeFor(product);
  const href = `/products/${id}`;

  const [size, setSize] = useState(sizes[0].id);
  const price = unitPrice(product, size) ?? product.price;

  const titleId = useId();

  function handleAdd() {
    onAdd?.(product, { size }); // the cart shows a toast: "added", or why it could not be
  }

  return (
    <article
      aria-labelledby={titleId}
      className={`group relative flex h-full flex-col overflow-hidden rounded-xl border border-line/60 bg-surface-card shadow-card motion-safe:transition-all motion-safe:duration-300 ${
        soldOut ? '' : 'motion-safe:hover:-translate-y-1 hover:shadow-xl'
      }`}
    >
      {/* Photo: a 4:3 frame that clips the zoom, so only the picture grows */}
      <div className="relative aspect-[4/3] overflow-hidden bg-surface-cream">
        <Link href={href} tabIndex={-1} aria-hidden="true" className="absolute inset-0 block">
          {image ? (
            <OptimizedImage
              src={image}
              alt=""
              fill
              sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              className="object-cover motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out motion-safe:group-hover:scale-105"
            />
          ) : (
            <span className="grid h-full place-items-center text-small text-ink-muted">Photo coming soon</span>
          )}
        </Link>

        {/* A soft fade at the foot of the photo, so the card and the picture meet gently */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#173f2a]/15 to-transparent" />

        {badge && (
          <span className="absolute top-3 left-3 z-10 rounded-full bg-gold-bright px-3 py-1.5 text-[11px] leading-none font-bold tracking-[0.08em] text-[#173f2a] uppercase shadow-card">
            {badge}
          </span>
        )}

        {/* Wishlist heart. The label stays the same; aria-pressed carries on/off. */}
        <button
          type="button"
          onClick={() => onToggleWishlist?.(id)}
          aria-pressed={wishlisted}
          aria-label={`Save ${name} to wishlist`}
          className="absolute top-3 right-3 z-10 grid size-11 place-items-center rounded-full bg-surface-card/90 text-brand-text shadow-card backdrop-blur-sm motion-safe:transition-transform motion-safe:hover:scale-105 aria-pressed:bg-brand aria-pressed:text-on-brand"
        >
          <HeartIcon filled={wishlisted} />
        </button>

        {/* Out of stock: covers the photo but lets clicks through to the heart. */}
        {soldOut && (
          <div className="pointer-events-none absolute inset-0 z-[5] grid place-items-center bg-surface-card/90">
            <span className="rounded-full border border-danger bg-surface-danger px-4 py-2 text-nav-link text-danger">Out of stock</span>
          </div>
        )}
      </div>

      {/* Details */}
      <div className="flex flex-1 flex-col gap-2 px-5 pt-4 pb-5">
        <h3 id={titleId} className="text-[21px] leading-snug font-bold text-ink">
          <Link href={href} className="hover:underline">
            {name}
          </Link>
        </h3>
        <p className="text-small text-ink-muted">{description}</p>
        <div>
          <StockBadge stock={stock} />
        </div>

        {sizes.length > 1 && <SizeSelector sizes={sizes} basePrice={product.price} value={size} onChange={setSize} disabled={soldOut} />}

        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <p className={`font-serif text-[30px] leading-none font-bold ${soldOut ? 'text-ink-muted' : 'text-brand-text'}`}>₹{price}</p>
          <button
            type="button"
            onClick={handleAdd}
            disabled={soldOut}
            className="min-h-11 rounded-full bg-gold-bright px-6 text-nav-link text-on-gold motion-safe:transition-all motion-safe:duration-200 hover:brightness-95 motion-safe:hover:scale-[1.03] disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-muted disabled:hover:brightness-100"
          >
            Add to Cart
          </button>
        </div>
      </div>
    </article>
  );
}
