// The phone's bottom tab bar: Home, Categories, Cart (with a count) and Account, like a native shopping app.
//
// It is fixed to the bottom edge and only exists below the "md" breakpoint; from tablet width up the header
// carries every link. The page leaves room for it (the .fb-has-bottom-nav class on the page wrapper in
// pages/_app.js, styles/globals.css), which includes the room under the footer, so the bar never covers
// the footer's last line or the product page's buy bar (that bar sits just above this one).
//
// The Cart tab opens the slide-out cart, like the header's cart button; on the cart and checkout pages, where the
// cart is already on screen, it links to /cart instead. The badge counts boxes in the cart. The saved cart is
// empty on the server and in the first browser render, so the badge appears just after load, never mismatching.
// "Categories" goes to the shop, where the boxes are filtered by category. "Account" holds orders and sign-in.

import Link from 'next/link';
import { useRouter } from 'next/router';
import { Home, LayoutGrid, ShoppingBag, User } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { useCartDrawer } from '@/context/CartDrawerContext';

const tabClass = (active) =>
  `relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] leading-none font-bold motion-safe:transition-colors ${
    active ? 'text-brand-text' : 'text-ink-muted'
  }`;

function Tab({ href, label, icon: Icon, active, badge = 0, onClick }) {
  const inner = (
    <>
      {/* a small gold bar over the icon marks the current tab, besides the darker colour (not colour alone) */}
      <span aria-hidden="true" className={`absolute top-0 h-0.5 w-8 rounded-full bg-gold-bright motion-safe:transition-opacity ${active ? 'opacity-100' : 'opacity-0'}`} />
      <span className="relative">
        <Icon size={22} strokeWidth={active ? 2.5 : 2} aria-hidden="true" />
        {badge > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-1.5 -right-2.5 grid min-w-4.5 place-items-center rounded-pill bg-brand px-1 py-0.5 text-[10px] leading-none text-on-brand"
          >
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      <span>{label}</span>
    </>
  );
  const accessibleName = badge > 0 ? `${label}, ${badge} ${badge === 1 ? 'item' : 'items'}` : label;

  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-haspopup="dialog" aria-label={`${accessibleName}. Open`} className={tabClass(active)}>
        {inner}
      </button>
    );
  }
  return (
    <Link href={href} aria-current={active ? 'page' : undefined} aria-label={accessibleName} className={tabClass(active)}>
      {inner}
    </Link>
  );
}

export default function MobileBottomNav() {
  const { pathname } = useRouter();
  const { itemCount } = useCart();
  const { open: openCart } = useCartDrawer();
  const cartIsOnScreen = pathname === '/cart' || pathname === '/checkout';

  return (
    <nav
      aria-label="Mobile"
      className="fb-no-print fixed bottom-0 left-0 z-50 w-full border-t border-line bg-surface-page pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="mx-auto flex h-(--fb-bottom-nav-h) max-w-xl items-stretch">
        <Tab href="/" label="Home" icon={Home} active={pathname === '/'} />
        <Tab href="/products" label="Categories" icon={LayoutGrid} active={pathname === '/products' || pathname.startsWith('/products/')} />
        {cartIsOnScreen ? (
          <Tab href="/cart" label="Cart" icon={ShoppingBag} active badge={itemCount} />
        ) : (
          <Tab label="Cart" icon={ShoppingBag} badge={itemCount} onClick={openCart} />
        )}
        <Tab href="/account" label="Account" icon={User} active={pathname === '/account' || pathname.startsWith('/account/') || pathname === '/login'} />
      </div>
    </nav>
  );
}
