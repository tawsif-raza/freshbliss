// A responsive grid of fruit boxes with its loading, error and empty states.
// Used by the home page and the shop page, so both look and behave the same.
//
//   products   the boxes to show (already filtered)
//   status     'loading' | 'ready' | 'error' (from useProducts)
//   onRetry    called by "Try again" after an error
//   empty      what to show when status is ready and there are no boxes: { title, text }

import ProductCard from '@/components/ProductCard';
import { ProductGridSkeleton } from '@/components/ProductSkeleton';
import { usingEmulators } from '@/lib/firebaseEnv';

// A warning callout: danger rule on the danger surface.
function LoadError({ onRetry }) {
  return (
    <div role="alert" className="rounded-sm border-l-[5px] border-danger bg-surface-danger p-6">
      <h2 className="text-heading-3 text-ink">We could not load the fruit boxes.</h2>
      <p className="mt-2 text-body text-ink">Check your connection and try again.</p>
      {usingEmulators && (
        <p className="mt-2 text-small text-ink-muted">
          Developer note: is the Firebase emulator running and seeded? In <code className="text-code">firebase/</code> run{' '}
          <code className="text-code">npm run emulators</code>, then <code className="text-code">npm run seed</code>.
        </p>
      )}
      <button type="button" onClick={onRetry} className="mt-4 min-h-11 rounded-pill bg-brand px-5 text-nav-link text-on-brand hover:brightness-110">
        Try again
      </button>
    </div>
  );
}

const GRID = 'grid grid-cols-1 gap-4.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

export default function ProductGrid({ products, status, onRetry, empty, wishlist, onAdd }) {
  if (status === 'error') return <LoadError onRetry={onRetry} />;

  if (status === 'loading') return <ProductGridSkeleton />;

  if (products.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-surface-card p-8 shadow-card">
        <h3 className="text-heading-3 text-ink">{empty?.title ?? 'No fruit boxes right now'}</h3>
        <p className="mt-1 text-body text-ink-muted">{empty?.text ?? 'Please check back soon.'}</p>
      </div>
    );
  }

  return (
    <ul className={GRID}>
      {products.map((product) => (
        <li key={product.id}>
          <ProductCard product={product} wishlisted={wishlist.isWishlisted(product.id)} onToggleWishlist={wishlist.toggleWishlist} onAdd={onAdd} />
        </li>
      ))}
    </ul>
  );
}
