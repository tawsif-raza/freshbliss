// The shop: every active fruit box from Firestore, in a responsive grid.

import Head from 'next/head';
import { useMemo } from 'react';
import ProductCard from '@/components/ProductCard';
import { useCart } from '@/context/CartContext';
import { useWishlist } from '@/context/WishlistContext';
import { usingEmulators } from '@/lib/firebaseClient';
import { useProducts } from '@/lib/catalog';

// Grey placeholder shaped like a card, shown while products load.
function SkeletonCard() {
  return (
    <div aria-hidden="true" className="overflow-hidden rounded-xl border border-line bg-surface-card shadow-card">
      <div className="aspect-[4/3] bg-surface-sunken motion-safe:animate-pulse" />
      <div className="flex flex-col gap-3 p-4.5">
        <div className="h-5 w-2/3 rounded-sm bg-surface-sunken motion-safe:animate-pulse" />
        <div className="h-4 w-full rounded-sm bg-surface-sunken motion-safe:animate-pulse" />
        <div className="mt-4 h-11 w-full rounded-pill bg-surface-sunken motion-safe:animate-pulse" />
      </div>
    </div>
  );
}

// A warning callout: danger rule on the danger surface.
function LoadError({ onRetry }) {
  return (
    <div role="alert" className="rounded-sm border-l-[5px] border-danger bg-surface-danger p-6">
      <h2 className="text-heading-3 text-ink">We could not load the fruit boxes.</h2>
      <p className="mt-2 text-body text-ink">Check your connection and try again.</p>
      {usingEmulators && (
        <p className="mt-2 text-small text-ink-muted">
          Developer note: is the Firebase emulator running and seeded? In <code className="text-code">firebase/</code>{' '}
          run <code className="text-code">npm run emulators</code>, then <code className="text-code">npm run seed</code>.
        </p>
      )}
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 min-h-11 rounded-pill bg-brand px-5 text-nav-link text-on-brand hover:brightness-110"
      >
        Try again
      </button>
    </div>
  );
}

export default function ProductsPage() {
  const { products, status, reload } = useProducts();
  const { addToCart } = useCart();
  const { isWishlisted, toggleWishlist } = useWishlist();

  // Boxes you can buy first; sold-out ones last. Array.sort is stable, so each
  // group keeps Firestore's order.
  const ordered = useMemo(() => [...products].sort((a, b) => Number(a.stock <= 0) - Number(b.stock <= 0)), [products]);

  return (
    <>
      <Head>
        <title>Our Fruit Boxes | FreshBliss</title>
        <meta name="description" content="Freshly sliced. Perfectly packed. Always. Premium fruit boxes delivered in Bengaluru." />
      </Head>

      <div className="fb-container py-14.5">
        <p className="text-label text-gold">Freshness delivered</p>
        <h1 className="mt-2 text-heading-2 text-brand-text">Our Fruit Boxes</h1>
        <p className="mt-2 max-w-xl text-lead text-ink-muted">Freshly sliced. Perfectly packed. Always.</p>

        <div className="mt-8.5">
          {status === 'error' && <LoadError onRetry={reload} />}

          {status === 'loading' && (
            <>
              <p role="status" className="sr-only">
                Loading fruit boxes
              </p>
              <div className="grid grid-cols-1 gap-4.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 4 }, (_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            </>
          )}

          {status === 'ready' && ordered.length === 0 && (
            <p className="text-body text-ink-muted">No fruit boxes are available right now. Please check back soon.</p>
          )}

          {status === 'ready' && ordered.length > 0 && (
            <>
              <p className="mb-4.5 text-small text-ink-muted">
                {ordered.length} {ordered.length === 1 ? 'box' : 'boxes'}
              </p>
              <ul className="grid grid-cols-1 gap-4.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {ordered.map((product) => (
                  <li key={product.id}>
                    <ProductCard
                      product={product}
                      wishlisted={isWishlisted(product.id)}
                      onToggleWishlist={toggleWishlist}
                      onAdd={addToCart}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </>
  );
}
