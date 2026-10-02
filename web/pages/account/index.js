// My orders: /account
// The customer's own past orders, live from Firestore, newest first. Each has its status, date, items
// and total, links to track it or print its receipt, and a one-click Reorder that puts the same boxes
// back in the cart.
//
// There is no login yet (see lib/auth.js): "my orders" means the orders placed from THIS browser.
// Visiting this page never creates an account.

import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import Callout from '@/components/Callout';
import { useCart } from '@/context/CartContext';
import { useProducts } from '@/lib/catalog';
import { useMyOrders } from '@/lib/orders';
import { statusLabel } from '@/lib/orderStatus';
import { formatOrderDate, linesFromOrder, shortOrderNumber } from '@/lib/pricing';

const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// The status as a customer reads it, with the money side where it matters.
function statusText(order) {
  if (order.status === 'CANCELLED') {
    if (order.paymentStatus === 'REFUND_PENDING') return 'Cancelled, refund on its way';
    if (order.paymentStatus === 'REFUNDED') return 'Cancelled, refunded';
    return 'Cancelled';
  }
  return statusLabel(order.status);
}

function OrderCard({ order, onReorder, reorderReady, message }) {
  const placed = formatOrderDate(order.createdAt?.toDate?.());
  const items = Array.isArray(order.items) ? order.items : [];
  const total = order.pricing?.total;
  const done = order.status === 'DELIVERED';
  const cancelled = order.status === 'CANCELLED';

  return (
    <li className="rounded-xl border border-line bg-surface-card p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-label text-gold">{shortOrderNumber(order.id)}</p>
          {placed && <p className="mt-1 text-small text-ink-muted">{placed}</p>}
        </div>
        <span
          className={`rounded-pill border px-3 py-1 text-small font-bold ${
            cancelled ? 'border-danger bg-surface-danger text-danger' : done ? 'border-line bg-surface-tag text-brand-text' : 'border-gold bg-surface-callout text-ink'
          }`}
        >
          {statusText(order)}
        </span>
      </div>

      <ul className="mt-4 divide-y divide-line">
        {items.map((i) => (
          <li key={`${i.productId}:${i.size}`} className="flex justify-between gap-4 py-2 text-body text-ink first:pt-0 last:pb-0">
            <span>
              {i.qty} × {i.name} <span className="text-ink-muted">({capitalise(String(i.size))})</span>
            </span>
            <span className="font-bold">₹{i.lineTotal}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <p className="text-body text-ink">
          Total <span className="text-kpi text-brand-text">₹{total}</span>
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href={`/orders/${order.id}`} className="inline-grid min-h-11 place-items-center rounded-pill border border-brand px-5 text-nav-link text-brand-text hover:bg-surface-cream">
            {done || cancelled ? 'View order' : 'Track order'}
          </Link>
          <Link href={`/orders/${order.id}?receipt=1`} className="inline-grid min-h-11 place-items-center rounded-pill border border-brand px-5 text-nav-link text-brand-text hover:bg-surface-cream">
            Receipt
          </Link>
          <button
            type="button"
            onClick={() => onReorder(order)}
            disabled={!reorderReady}
            className="min-h-11 rounded-pill bg-gold-bright px-5 text-nav-link text-on-gold hover:brightness-95 disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-muted disabled:hover:brightness-100"
          >
            Reorder
          </button>
        </div>
      </div>

      {message && (
        <p role="status" className={`mt-3 text-small ${message.ok ? 'text-brand-text' : 'text-danger'}`}>
          {message.text}{' '}
          {message.ok && (
            <Link href="/cart" className="font-bold underline">
              Go to cart
            </Link>
          )}
        </p>
      )}
    </li>
  );
}

export default function AccountPage() {
  const router = useRouter();
  const { status, orders } = useMyOrders();
  const { products, status: catalogueStatus } = useProducts();
  const { addToCart } = useCart();
  const [messages, setMessages] = useState({}); // orderId -> { ok, text }

  // Put an old order's boxes back in the cart, as far as they can still be bought. Each box goes through
  // the cart's own rules (stock, per-box limits), so nothing unavailable can slip in.
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
      const result = addToCart(product, { size: line.size, qty: line.qty });
      if (result.ok) added += 1;
      else notes.push(`${name}: ${result.message}`);
    }

    if (added === 0) {
      setMessages((m) => ({ ...m, [order.id]: { ok: false, text: notes.join(' ') || 'Nothing from this order could be added.' } }));
      return;
    }
    if (notes.length === 0) {
      router.push('/cart'); // everything went in: take them to the cart
      return;
    }
    setMessages((m) => ({ ...m, [order.id]: { ok: true, text: `Added ${added} to your cart. ${notes.join(' ')}` } }));
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
        <p className="mt-2 max-w-xl text-small text-ink-muted">Orders placed from this browser. Sign-in is coming; until then, clearing your browser data hides them.</p>

        <div className="mt-8.5">
          {status === 'loading' && (
            <>
              <div aria-hidden="true" className="h-40 rounded-xl border border-line bg-surface-card shadow-card motion-safe:animate-pulse" />
              <p role="status" className="sr-only">
                Loading your orders
              </p>
            </>
          )}

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
              <p className="mb-4.5 text-small text-ink-muted">
                {orders.length} {orders.length === 1 ? 'order' : 'orders'}, newest first
              </p>
              <ul className="flex flex-col gap-4.5">
                {orders.map((order) => (
                  <OrderCard key={order.id} order={order} onReorder={reorder} reorderReady={catalogueStatus === 'ready'} message={messages[order.id]} />
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </>
  );
}
