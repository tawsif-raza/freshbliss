// Top bar: wordmark, the main links, and the wishlist and cart buttons.
//
// It is "sticky": it stays at the top of the screen as the visitor scrolls. It is frosted glass (the cream page
// colour at 80% with the page blurred behind it, so content softly passes beneath), with a fine bottom border,
// and it gains a soft shadow once the page has moved, so it reads as floating above the content. (The shadow is switched by an observer
// watching a 1px marker at the very top of the page: cheaper than listening to every scroll.)
//
// The Search button (or Ctrl+K / Cmd+K) opens the search palette (components/CommandPalette.js).
//
// The cart button opens the slide-out cart (components/CartDrawer.js). On the cart and checkout pages,
// where the cart is already on screen, it simply links to the cart instead.

import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import { Heart, LogOut, Search, ShoppingBag } from 'lucide-react';
import { useAuthUser, useSignOut } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { useCartDrawer } from '@/context/CartDrawerContext';
import { useCommandPalette } from '@/context/CommandPaletteContext';
import { useWishlist } from '@/context/WishlistContext';
import { loginHref } from '@/lib/authHelpers';

// A button-like item with an icon, a label (hidden on the smallest screens) and a count badge.
function Count({ label, value, icon: Icon, href, onClick }) {
  const text = `${value} ${value === 1 ? 'item' : 'items'} in ${label.toLowerCase()}`;
  const className = 'inline-flex min-h-11 items-center gap-2 rounded-pill px-2 text-nav-link text-brand-text hover:bg-surface-cream';
  const inner = (
    <>
      <Icon size={20} aria-hidden="true" />
      <span className="hidden sm:inline">{label}</span>
      <span className="inline-grid min-w-6 place-items-center rounded-pill bg-brand px-2 py-0.5 text-[12px] leading-none text-on-brand">{value}</span>
    </>
  );

  if (href) {
    return (
      <Link href={href} aria-label={`${label}, ${text}`} className={className}>
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-haspopup="dialog" aria-label={`${label}, ${text}. Open`} className={className}>
        {inner}
      </button>
    );
  }
  return (
    <span className={className} aria-label={text}>
      {inner}
    </span>
  );
}

// A main-menu link. The page you are on is marked for screen readers (aria-current) and underlined.
function NavLink({ href, children, className = '' }) {
  const { pathname } = useRouter();
  const here = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={here ? 'page' : undefined}
      className={`inline-flex min-h-11 items-center text-nav-link text-brand-text hover:underline ${here ? 'underline underline-offset-4' : ''} ${className}`}
    >
      {children}
    </Link>
  );
}

// "Sign in" for a guest or nobody (and back to this page afterwards), "Sign out" for a signed-in customer. Until Firebase
// has said who it is, an invisible placeholder holds the space, so the header does not jump and a signed-in customer never
// sees "Sign in" flash up.
function SignInOut() {
  const router = useRouter();
  const { status } = useAuthUser();
  const { signOut, busy } = useSignOut();

  if (status === 'loading') {
    return (
      <span aria-hidden="true" className="invisible inline-flex min-h-11 items-center px-4 text-nav-link">
        Sign in
      </span>
    );
  }

  if (status === 'user') {
    return (
      <button
        type="button"
        onClick={signOut}
        disabled={busy}
        className="inline-flex min-h-11 items-center gap-2 rounded-pill px-2 text-nav-link text-brand-text hover:bg-surface-cream disabled:opacity-60"
      >
        <LogOut size={18} aria-hidden="true" />
        <span className="max-sm:sr-only">Sign out</span>
      </button>
    );
  }

  return (
    <Link href={loginHref(router.asPath)} className="inline-grid min-h-11 place-items-center rounded-pill bg-brand px-4 text-nav-link text-on-brand hover:brightness-110">
      Sign in
    </Link>
  );
}

export default function SiteHeader() {
  const { status: authStatus } = useAuthUser();
  const { itemCount } = useCart();
  const { count: wishlistCount } = useWishlist();
  const { open: openCart } = useCartDrawer();
  const { open: openSearch } = useCommandPalette();
  const { pathname } = useRouter();
  const cartIsOnScreen = pathname === '/cart' || pathname === '/checkout';

  // Has the page scrolled away from the top? The marker below leaves the screen when it has.
  const marker = useRef(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const el = marker.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={marker} aria-hidden="true" className="fb-no-print pointer-events-none absolute top-0 left-0 h-px w-px" />
      <header
        className={`fb-no-print sticky top-0 z-20 border-b bg-surface-page/80 backdrop-blur-md motion-safe:transition-[box-shadow,border-color] motion-safe:duration-300 ${
          scrolled ? 'border-line shadow-[0_8px_30px_rgba(23,63,42,0.10)]' : 'border-line/60'
        }`}
      >
        <div className="fb-container flex min-h-18 flex-wrap items-center justify-between gap-x-6 gap-y-1 py-1">
          {/* The wordmark is set in display type; no logo file has been supplied. */}
          <Link href="/" className="font-serif text-[26px] leading-none font-bold text-brand-text">
            FreshBliss
          </Link>
          <div className="flex flex-wrap items-center gap-x-4 sm:gap-x-6">
            <nav aria-label="Main" className="flex items-center gap-4 sm:gap-6">
              <NavLink href="/products">Shop</NavLink>
              {/* A guest's orders live here too, so it stays "My orders" until they sign in. */}
              <NavLink href="/account">{authStatus === 'user' ? 'Account' : 'My orders'}</NavLink>
              {/* hidden on the smallest phones, where it would wrap the header onto a third line (the footer has the link) */}
              <NavLink href="/faq" className="max-sm:hidden">
                FAQ
              </NavLink>
              <SignInOut />
            </nav>
            <nav aria-label="Your lists" className="flex items-center gap-1 sm:gap-3">
              <button
                type="button"
                onClick={openSearch}
                aria-haspopup="dialog"
                aria-keyshortcuts="Control+K Meta+K"
                className="inline-flex min-h-11 items-center gap-2 rounded-pill px-2 text-nav-link text-brand-text hover:bg-surface-cream"
              >
                <Search size={20} aria-hidden="true" />
                <span className="hidden sm:inline">Search</span>
              </button>
              <Count label="Wishlist" value={wishlistCount} icon={Heart} />
              {cartIsOnScreen ? <Count label="Cart" value={itemCount} icon={ShoppingBag} href="/cart" /> : <Count label="Cart" value={itemCount} icon={ShoppingBag} onClick={openCart} />}
            </nav>
          </div>
        </div>
      </header>
    </>
  );
}
