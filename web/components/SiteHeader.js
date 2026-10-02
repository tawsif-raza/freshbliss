// Top bar: wordmark, the main links, and the cart and wishlist counts.
// The cart count links to the cart; the wishlist page comes later.

import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCart } from '@/context/CartContext';
import { useWishlist } from '@/context/WishlistContext';

function Count({ label, value, href }) {
  const text = `${value} ${value === 1 ? 'item' : 'items'} in ${label.toLowerCase()}`;
  const inner = (
    <>
      {label}
      <span className="ml-2 inline-grid min-w-6 place-items-center rounded-pill bg-brand px-2 py-0.5 text-[12px] leading-none text-on-brand">{value}</span>
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

// A main-menu link. The page you are on is marked for screen readers (aria-current) and underlined.
function NavLink({ href, children }) {
  const { pathname } = useRouter();
  const here = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={here ? 'page' : undefined}
      className={`inline-flex min-h-11 items-center text-nav-link text-brand-text hover:underline ${here ? 'underline underline-offset-4' : ''}`}
    >
      {children}
    </Link>
  );
}

export default function SiteHeader() {
  const { itemCount } = useCart();
  const { count: wishlistCount } = useWishlist();

  return (
    <header className="fb-no-print sticky top-0 z-20 border-b border-line bg-surface-page/90 backdrop-blur">
      <div className="fb-container flex min-h-18 flex-wrap items-center justify-between gap-x-6 gap-y-1 py-1">
        {/* The wordmark is set in display type; no logo file has been supplied. */}
        <Link href="/" className="font-serif text-[26px] leading-none font-bold text-brand-text">
          FreshBliss
        </Link>
        <div className="flex flex-wrap items-center gap-x-6">
          <nav aria-label="Main" className="flex items-center gap-6">
            <NavLink href="/products">Shop</NavLink>
            <NavLink href="/account">My orders</NavLink>
          </nav>
          <nav aria-label="Your lists" className="flex items-center gap-6">
            <Count label="Wishlist" value={wishlistCount} />
            <Count label="Cart" value={itemCount} href="/cart" />
          </nav>
        </div>
      </div>
    </header>
  );
}
