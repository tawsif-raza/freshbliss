// One fruit box in the product grid.
// Presentational: it gets everything through props, so it works the same with
// the cart context, a test, or a different page.
//
//   product           a normalised product from useProducts()
//   wishlisted        is the heart on?
//   onToggleWishlist  (productId) => void
//   onAdd             (product) => { ok, message }   (CartContext.addToCart)

import { useEffect, useId, useState } from 'react';

const LOW_STOCK_AT = 5; // "Only N left" at 5 or fewer, per the design system

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
  const { id, name, description, price, badge, stock, images } = product;
  const soldOut = stock <= 0;
  const lowStock = !soldOut && stock <= LOW_STOCK_AT;
  const image = images[0];

  const titleId = useId();
  const stateId = useId();

  // A short message under the button ("Added to cart.", or why it could not be added).
  const [feedback, setFeedback] = useState(null);
  useEffect(() => {
    if (!feedback) return undefined;
    const timer = setTimeout(() => setFeedback(null), 2500);
    return () => clearTimeout(timer);
  }, [feedback]);

  function handleAdd() {
    const result = onAdd?.(product);
    if (result) setFeedback(result);
  }

  return (
    <article
      aria-labelledby={titleId}
      className={`relative flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface-card shadow-card motion-safe:transition-transform motion-safe:duration-200 ${
        soldOut ? '' : 'motion-safe:hover:-translate-y-1'
      }`}
    >
      {/* Photo */}
      <div className="relative aspect-[4/3] bg-surface-cream">
        {image ? (
          <img src={image} alt={name} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center text-small text-ink-muted">Photo coming soon</div>
        )}

        {badge && (
          <span className="absolute top-3 left-3 z-10 rounded-pill bg-gold-bright px-2.5 py-1 text-[11px] leading-none font-bold text-on-gold">
            {badge}
          </span>
        )}

        {/* Wishlist heart. The label stays the same; aria-pressed carries on/off. */}
        <button
          type="button"
          onClick={() => onToggleWishlist?.(id)}
          aria-pressed={wishlisted}
          aria-label={`Save ${name} to wishlist`}
          className="absolute top-3 right-3 z-10 grid size-11 place-items-center rounded-full bg-surface-card text-brand-text shadow-card motion-safe:transition-transform motion-safe:hover:scale-105 aria-pressed:bg-brand aria-pressed:text-on-brand"
        >
          <HeartIcon filled={wishlisted} />
        </button>

        {/* Out of stock: covers the photo but lets clicks through to the heart. */}
        {soldOut && (
          <div className="pointer-events-none absolute inset-0 z-[5] grid place-items-center bg-surface-card/90">
            <span className="rounded-pill border border-danger bg-surface-danger px-4 py-2 text-nav-link text-danger">
              Out of stock
            </span>
          </div>
        )}
      </div>

      {/* Details */}
      <div className="flex flex-1 flex-col gap-2 px-4.5 pt-4 pb-4.5">
        <h3 id={titleId} className="text-heading-3 text-ink">
          {name}
        </h3>
        <p className="text-small text-ink-muted">{description}</p>
        {lowStock && <p className="text-small font-bold text-danger">Only {stock} left</p>}

        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <p className={`text-kpi ${soldOut ? 'text-ink-muted' : 'text-brand-text'}`}>₹{price}</p>
          <button
            type="button"
            onClick={handleAdd}
            disabled={soldOut}
            aria-describedby={stateId}
            className="min-h-11 rounded-pill bg-gold-bright px-5 text-nav-link text-on-gold motion-safe:transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-muted disabled:hover:brightness-100"
          >
            Add to Cart
          </button>
        </div>

        {/* Always rendered so screen readers announce changes (live region). */}
        <p
          id={stateId}
          role="status"
          className={`min-h-[1.5em] text-small ${feedback && !feedback.ok ? 'text-danger' : 'text-brand-text'}`}
        >
          {soldOut ? 'Out of stock' : (feedback?.message ?? '')}
        </p>
      </div>
    </article>
  );
}
