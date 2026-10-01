// Top bar: wordmark plus the cart and wishlist counts.
// The cart count links to the cart; the wishlist page comes later.

import Link from 'next/link';
import { useCart } from '@/context/CartContext';
import { useWishlist } from '@/context/WishlistContext';

function Count({ label, value, href }) {
  const text = `${value} ${value === 1 ? 'item' : 'items'} in ${label.toLowerCase()}`;
  const inner = (
    <>
      {label}
      <span className="ml-2 inline-grid min-w-6 place-items-center rounded-pill bg-brand px-2 py-0.5 text-[12px] leading-none text-on-brand">
        {value}
      </span>
    </>
  );

  if (href) {
    return (
      <Link href={href} aria-label={`${label}, ${text}`} className="inline-flex min-h-11 items-center text-nav-link text-brand-text">
        {inner}
      </Link>
    );
  }
  return (
    <span className="text-nav-link text-brand-text" aria-label={text}>
      {inner}
    </span>
  );
}

export default function SiteHeader() {
  const { itemCount } = useCart();
  const { count: wishlistCount } = useWishlist();

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface-page/90 backdrop-blur">
      <div className="fb-container flex min-h-18 items-center justify-between gap-4">
        {/* The wordmark is set in display type; no logo file has been supplied. */}
        <Link href="/products" className="font-serif text-[26px] leading-none font-bold text-brand-text">
          FreshBliss
        </Link>
        <nav aria-label="Your lists" className="flex items-center gap-6">
          <Count label="Wishlist" value={wishlistCount} />
          <Count label="Cart" value={itemCount} href="/cart" />
        </nav>
      </div>
    </header>
  );
}
