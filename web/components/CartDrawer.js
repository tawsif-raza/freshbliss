// The slide-out cart. It slides in from the right edge when the visitor presses the cart button in the
// header (or "View cart" in a toast), so they can change quantities and head to checkout without ever
// leaving the page they were on.
//
// It is frosted glass like the header (the page colour at 80% over a blurred, dimmed page), with heavily rounded
// left corners and a wide soft shadow.
//
// It is a real <dialog>: the browser traps the keyboard inside it, Esc closes it, the page behind is
// not reachable by keyboard or screen reader, and focus goes back to the button that opened it. We add
// the slide animation, the backdrop click, and closing when the visitor navigates to another page.
// Prices and stock are live, from the same cart the cart page uses.

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useRef } from 'react';
import { MotionConfig, motion } from 'framer-motion';
import { ShoppingBag, Trash2, X } from 'lucide-react';
import { CartLinesSkeleton } from '@/components/CartSkeleton';
import QuantityStepper from '@/components/QuantityStepper';
import { useCart } from '@/context/CartContext';
import { useCartDrawer } from '@/context/CartDrawerContext';
import { resizeImage } from '@/lib/images';

const SLIDE_SECONDS = 0.28;
const CLOSE_AFTER_MS = 340; // just after the slide-out finishes

// One item in the drawer: a small photo, the name and size, the price, a stepper and a remove button.
function DrawerLine({ item, maxQty, onChangeQty, onRemove }) {
  const { name, sizeLabel, image, qty, lineTotal, available, inStock, stock } = item;
  const problem = !available ? 'No longer available' : !inStock ? (stock <= 0 ? 'Out of stock' : `Only ${stock} left`) : '';

  return (
    <li className="flex gap-3 border-b border-line py-4 last:border-b-0">
      <div className="relative size-16 shrink-0 overflow-hidden rounded-md bg-surface-cream">
        {image ? <Image src={resizeImage(image, 160)} alt="" fill sizes="64px" unoptimized className="object-cover" /> : <span className="grid h-full place-items-center px-1 text-center text-[11px] text-ink-muted">No photo</span>}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-body font-bold text-ink">{name}</p>
            <p className="text-small text-ink-muted">{sizeLabel}</p>
          </div>
          <p className="shrink-0 text-body font-bold text-ink">₹{lineTotal}</p>
        </div>

        {problem && <p className="text-small font-bold text-danger">{problem}</p>}

        <div className="mt-1 flex items-center justify-between gap-2">
          <QuantityStepper compact value={qty} max={maxQty} onChange={onChangeQty} label={`${name}, ${sizeLabel}`} />
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${name}, ${sizeLabel}`}
            className="grid size-10 place-items-center rounded-full text-ink-muted hover:bg-surface-cream hover:text-danger"
          >
            <Trash2 size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
    </li>
  );
}

export default function CartDrawer() {
  const { isOpen, close } = useCartDrawer();
  const { items, itemCount, subtotal, hydrated, catalogStatus, updateQuantity, removeFromCart, getMaxQuantity } = useCart();
  const router = useRouter();
  const dialogRef = useRef(null);

  // Open the real dialog when asked; when asked to close, let the slide-out play, then close it.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    if (isOpen) {
      if (!dialog.open) dialog.showModal();
      return undefined;
    }
    const timer = setTimeout(() => {
      if (dialog.open) dialog.close();
    }, CLOSE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [isOpen]);

  // The page behind must not scroll while the drawer is open.
  useEffect(() => {
    if (!isOpen) return undefined;
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = before;
    };
  }, [isOpen]);

  // Going to another page (checkout, a product) closes the drawer.
  useEffect(() => {
    router.events.on('routeChangeStart', close);
    return () => router.events.off('routeChangeStart', close);
  }, [router.events, close]);

  const loaded = hydrated && catalogStatus === 'ready';
  const problems = items.filter((i) => !i.available || !i.inStock);

  return (
    <MotionConfig reducedMotion="user">
      <dialog
        ref={dialogRef}
        aria-labelledby="cart-drawer-title"
        onCancel={(event) => {
          event.preventDefault(); // Esc: slide out first, then close (the effect above does the closing)
          close();
        }}
        onClose={close}
        onClick={(event) => {
          if (event.target === dialogRef.current) close(); // a click on the dimmed area
        }}
        className="fb-no-print m-0 h-full max-h-none w-full max-w-none bg-transparent p-0 backdrop:bg-ink/40"
      >
        <motion.div
          initial={false}
          animate={{ x: isOpen ? 0 : '100%' }}
          transition={{ type: 'tween', ease: 'easeOut', duration: SLIDE_SECONDS }}
          className="ml-auto flex h-full w-full max-w-md flex-col overflow-hidden rounded-l-2xl border-l border-line/60 bg-surface-page/80 text-ink shadow-2xl backdrop-blur-xl"
        >
          <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
            <h2 id="cart-drawer-title" className="flex items-center gap-2 text-heading-3 text-ink">
              <ShoppingBag size={22} className="text-brand-text" aria-hidden="true" />
              Your cart
              {hydrated && itemCount > 0 && <span className="text-small font-normal text-ink-muted">({itemCount})</span>}
            </h2>
            <button type="button" onClick={close} aria-label="Close cart" className="grid size-11 place-items-center rounded-full text-ink-muted hover:bg-surface-cream hover:text-ink">
              <X size={22} aria-hidden="true" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5">
            {!loaded && catalogStatus !== 'error' && (
              <div className="py-4">
                <CartLinesSkeleton count={2} />
              </div>
            )}

            {catalogStatus === 'error' && (
              <p role="alert" className="py-6 text-body text-danger">
                We could not load your cart prices. Check your connection and try again.
              </p>
            )}

            {loaded && items.length === 0 && (
              <div className="grid place-items-center gap-3 py-16 text-center">
                <ShoppingBag size={40} className="text-ink-muted" aria-hidden="true" />
                <p className="text-heading-3 text-ink">Your cart is empty</p>
                <p className="text-body text-ink-muted">Fresh boxes are waiting for you.</p>
                <Link href="/products" className="mt-2 inline-grid min-h-11 place-items-center rounded-pill bg-gold-bright px-6 text-nav-link text-on-gold hover:brightness-95">
                  Shop Now
                </Link>
              </div>
            )}

            {loaded && items.length > 0 && (
              <ul>
                {items.map((item) => (
                  <DrawerLine
                    key={item.id}
                    item={item}
                    maxQty={getMaxQuantity(item.productId, item.size)}
                    onChangeQty={(qty) => updateQuantity(item.productId, item.size, qty)}
                    onRemove={() => removeFromCart(item.productId, item.size)}
                  />
                ))}
              </ul>
            )}
          </div>

          {loaded && items.length > 0 && (
            <footer className="border-t border-line px-5 py-4">
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-body text-ink">Subtotal</p>
                <p className="text-kpi text-brand-text">₹{subtotal}</p>
              </div>
              <p className="mt-1 text-small text-ink-muted">Delivery, any promo code and a tip are added at checkout.</p>

              {problems.length > 0 && <p role="alert" className="mt-3 text-small font-bold text-danger">Some items need your attention before you can check out.</p>}

              {problems.length > 0 ? (
                <span aria-disabled="true" className="mt-4 grid min-h-13 w-full cursor-not-allowed place-items-center rounded-pill bg-surface-sunken px-6 text-heading-3 text-ink-muted">
                  Proceed to Checkout
                </span>
              ) : (
                <Link href="/checkout" className="mt-4 grid min-h-13 w-full place-items-center rounded-pill bg-gold-bright px-6 text-heading-3 text-on-gold motion-safe:transition-[filter] hover:brightness-95">
                  Proceed to Checkout
                </Link>
              )}
              <Link href="/cart" className="mt-2 grid min-h-11 w-full place-items-center rounded-pill text-nav-link text-brand-text underline hover:bg-surface-cream">
                View full cart
              </Link>
            </footer>
          )}
        </motion.div>
      </dialog>
    </MotionConfig>
  );
}
