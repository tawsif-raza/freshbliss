// My orders: /account
// The customer's own past orders, live from Firestore, newest first. Filter chips (All Orders, In Progress,
// Past 30 Days, Delivered, Cancelled) narrow the list. Each order has its status, date, items and total,
// links to track it or print its receipt, and a one-click Reorder that puts the same boxes back in the cart.
//
// Above the orders sits the account card (components/auth/AccountCard.js): who is signed in, or a note to a guest. Orders
// belong to an account. A signed-in customer sees them on every device; a guest sees the ones placed from THIS browser,
// and signing in later keeps them (lib/auth.js). Visiting this page never creates an account.

import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useMemo, useState } from 'react';
import AccountCard from '@/components/auth/AccountCard';
import DeleteAccountCard from '@/components/auth/DeleteAccountCard';
import Callout from '@/components/Callout';
import OrderFilterChips from '@/components/orders/OrderFilterChips';
import OrderHistoryCard from '@/components/orders/OrderHistoryCard';
import { useToast } from '@/components/ToastProvider';
import { OrderListSkeleton } from '@/components/CartSkeleton';
import { useCart } from '@/context/CartContext';
import { useCartDrawer } from '@/context/CartDrawerContext';
import { useProducts } from '@/lib/catalog';
import { ORDER_FILTERS, countByFilter, filterOrders } from '@/lib/orderFilters';
import { useMyOrders } from '@/lib/orders';
import { linesFromOrder, shortOrderNumber } from '@/lib/pricing';

export default function AccountPage() {
  const router = useRouter();
  const { status, orders } = useMyOrders();
  const { products, status: catalogueStatus } = useProducts();
  const { addToCart } = useCart();
  const toast = useToast();
  const drawer = useCartDrawer();

  // Which chip is chosen. "Now" is read once per visit so the 30-day window does not shift while the page is open.
  const [filterId, setFilterId] = useState('all');
  const [now] = useState(() => Date.now());
  const counts = useMemo(() => countByFilter(orders, now), [orders, now]);
  const shown = useMemo(() => filterOrders(orders, filterId, now), [orders, filterId, now]);
  const filter = ORDER_FILTERS.find((f) => f.id === filterId) ?? ORDER_FILTERS[0];

  // Put an old order's boxes back in the cart, as far as they can still be bought. Each box goes through
  // the cart's own rules (stock, per-box limits), so nothing unavailable can slip in. The boxes are added
  // quietly and ONE toast sums it up, with a button to open the cart.
  function reorder(order) {
    const lines = linesFromOrder(order);
    let added = 0;
    const notes = [];
    for (const line of lines) {
      const product = products.find((p) => p.id === line.productId);
      const name = order.items.find((i) => i.productId === line.productId)?.name ?? 'A box';
      if (!product) {
        notes.push(`${name} is no longer available.`);
        continue;
      }
      const result = addToCart(product, { size: line.size, qty: line.qty, silent: true });
      if (result.ok) added += 1;
      else notes.push(`${name}: ${result.message}`);
    }

    if (added === 0) {
      toast.error(notes.join(' ') || 'Nothing from this order could be added.');
      return;
    }
    toast.success(notes.length === 0 ? `Order ${shortOrderNumber(order.id)} is back in your cart.` : `Added ${added} to your cart. ${notes.join(' ')}`, {
      action: { label: 'View cart', onClick: drawer.open },
    });
  }

  return (
    <>
      <Head>
        <title>My orders | FreshBliss</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="fb-container py-14.5">
        <p className="text-label text-gold">Your account</p>
        <h1 className="mt-2 text-heading-2 text-brand-text">My orders</h1>
        <AccountCard />

        <div className="mt-8.5">
          {status === 'loading' && <OrderListSkeleton />}

          {status === 'error' && (
            <Callout tone="danger" title="We could not load your orders.">
              Check your connection and try again.
              <div>
                <button type="button" onClick={() => router.reload()} className="mt-3 min-h-11 rounded-pill bg-brand px-5 text-nav-link text-on-brand hover:brightness-110">
                  Try again
                </button>
              </div>
            </Callout>
          )}

          {status === 'ready' && orders.length === 0 && (
            <div className="rounded-xl border border-line bg-surface-card p-8 shadow-card">
              <h2 className="text-heading-3 text-ink">No orders yet</h2>
              <p className="mt-1 text-body text-ink-muted">When you order, it shows up here, ready to track or reorder.</p>
              <Link href="/products" className="mt-4 inline-grid min-h-11 place-items-center rounded-pill bg-gold-bright px-6 text-nav-link text-on-gold hover:brightness-95">
                Shop Now
              </Link>
            </div>
          )}

          {status === 'ready' && orders.length > 0 && (
            <>
              <OrderFilterChips filters={ORDER_FILTERS} counts={counts} value={filterId} onChange={setFilterId} />
              <p role="status" className="mt-4.5 mb-4.5 text-small text-ink-muted">
                {shown.length} {shown.length === 1 ? 'order' : 'orders'}
                {filterId === 'all' ? ', newest first' : `: ${filter.label.toLowerCase()}`}
              </p>
              {shown.length === 0 ? (
                <div className="rounded-xl border border-line bg-surface-card p-8 shadow-card">
                  <h2 className="text-heading-3 text-ink">No orders here</h2>
                  <p className="mt-1 text-body text-ink-muted">None of your orders match &quot;{filter.label}&quot;.</p>
                  <button type="button" onClick={() => setFilterId('all')} className="mt-4 min-h-11 rounded-pill bg-brand px-6 text-nav-link text-on-brand hover:brightness-110">
                    Show all orders
                  </button>
                </div>
              ) : (
                <ul className="flex flex-col gap-4.5">
                  {shown.map((order) => (
                    <OrderHistoryCard key={order.id} order={order} onReorder={reorder} reorderReady={catalogueStatus === 'ready'} />
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        {/* The right to erasure (DPDP). Asks for confirmation; keeps the shop's accounts, without the customer's details. */}
        <DeleteAccountCard />
      </div>
    </>
  );
}
