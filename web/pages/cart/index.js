// The cart: /cart
// Shows what the customer picked and lets them change quantities. Where to deliver, a promo code, a
// tip and payment all happen on the checkout page (/checkout). Every figure here is a preview: the
// server prices the order, so the delivery fee is only worked out at checkout.

import Head from 'next/head';
import Link from 'next/link';
import Callout from '@/components/Callout';
import CartLineItem from '@/components/CartLineItem';
import SummaryRow from '@/components/SummaryRow';
import { useCart } from '@/context/CartContext';
import { useProducts } from '@/lib/catalog';

export default function CartPage() {
  const { items, subtotal, hydrated, catalogStatus, updateQuantity, removeFromCart, getMaxQuantity } = useCart();
  const { reload: reloadCatalogue } = useProducts();

  const loaded = hydrated && catalogStatus === 'ready';
  const problems = items.filter((i) => !i.available || !i.inStock);

  return (
    <>
      <Head>
        <title>Your Cart | FreshBliss</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="fb-container py-14.5">
        <p className="text-label text-gold">Almost yours</p>
        <h1 className="mt-2 text-heading-2 text-brand-text">Your Cart</h1>

        <div className="mt-8.5">
          {/* loading */}
          {!loaded && catalogStatus !== 'error' && (
            <div aria-hidden="true" className="h-40 rounded-xl border border-line bg-surface-card shadow-card motion-safe:animate-pulse" />
          )}
          {!loaded && catalogStatus !== 'error' && (
            <p role="status" className="sr-only">
              Loading your cart
            </p>
          )}

          {/* could not load prices */}
          {catalogStatus === 'error' && (
            <Callout tone="danger" title="We could not load your cart prices.">
              Check your connection and try again.
              <div>
                <button type="button" onClick={reloadCatalogue} className="mt-3 min-h-11 rounded-pill bg-brand px-5 text-nav-link text-on-brand hover:brightness-110">
                  Try again
                </button>
              </div>
            </Callout>
          )}

          {/* empty */}
          {loaded && items.length === 0 && (
            <div className="rounded-xl border border-line bg-surface-card p-8 shadow-card">
              <h2 className="text-heading-3 text-ink">Your cart is empty</h2>
              <p className="mt-1 text-body text-ink-muted">Fresh boxes are waiting for you.</p>
              <Link href="/products" className="mt-4 inline-grid min-h-11 place-items-center rounded-pill bg-gold-bright px-6 text-nav-link text-on-gold hover:brightness-95">
                Shop Now
              </Link>
            </div>
          )}

          {/* items + summary */}
          {loaded && items.length > 0 && (
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
              <ul className="flex flex-col gap-4.5">
                {items.map((item) => (
                  <CartLineItem
                    key={item.id}
                    item={item}
                    maxQty={getMaxQuantity(item.productId, item.size)}
                    locked={false}
                    onChangeQty={(qty) => updateQuantity(item.productId, item.size, qty)}
                    onRemove={() => removeFromCart(item.productId, item.size)}
                  />
                ))}
              </ul>

              <aside aria-labelledby="summary-title" className="rounded-xl border border-line bg-surface-card p-6 shadow-card lg:sticky lg:top-24">
                <h2 id="summary-title" className="text-heading-3 text-ink">
                  Order summary
                </h2>

                <dl className="mt-4 flex flex-col gap-2">
                  <SummaryRow label="Subtotal" value={`₹${subtotal}`} />
                  {/* The fee depends on the pincode, which is asked for at checkout. */}
                  <SummaryRow label="Delivery" value="Worked out at checkout" muted />
                </dl>
                <p className="mt-2 text-small text-ink-muted">At checkout you add your address, a promo code and a tip, and see your exact total before you pay.</p>

                {problems.length > 0 && (
                  <Callout tone="danger" className="mt-5">
                    Some items need your attention before you can check out.
                  </Callout>
                )}

                {problems.length > 0 ? (
                  <span
                    aria-disabled="true"
                    className="mt-5 grid min-h-13 w-full cursor-not-allowed place-items-center rounded-pill bg-surface-sunken px-6 text-heading-3 text-ink-muted"
                  >
                    Proceed to Checkout
                  </span>
                ) : (
                  <Link
                    href="/checkout"
                    className="mt-5 grid min-h-13 w-full place-items-center rounded-pill bg-gold-bright px-6 text-heading-3 text-on-gold motion-safe:transition-[filter] hover:brightness-95"
                  >
                    Proceed to Checkout
                  </Link>
                )}
              </aside>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
