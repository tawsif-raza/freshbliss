// Customer order tracking: /orders/<order id>
// Listens to the order document with Firestore onSnapshot, so when staff move
// the order to its next step this page updates by itself, with no refresh.

import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import Callout from '@/components/Callout';
import OrderTimeline from '@/components/OrderTimeline';
import SummaryRow from '@/components/SummaryRow';
import { auth, db } from '@/lib/firebaseClient';
import { ORDER_FLOW, expectedBy, formatTime } from '@/lib/orderStatus';

const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- the live order ----------

// Follows one order in real time.
//   status: 'loading' | 'ready' | 'missing' | 'error'
//   live:   true while the data is coming from the server (false = offline/cached)
function useLiveOrder(orderId) {
  const [state, setState] = useState({ status: 'loading', order: null, live: false });

  useEffect(() => {
    if (!orderId) return undefined;
    setState({ status: 'loading', order: null, live: false });

    let stopOrder = () => {};

    // Firestore only answers once we know who is asking, so wait for sign-in
    // state first. Security rules decide the rest: only the order's owner (or
    // staff) can read it.
    const stopAuth = onAuthStateChanged(auth, (user) => {
      stopOrder();
      if (!user) {
        setState({ status: 'missing', order: null, live: false });
        return;
      }
      stopOrder = onSnapshot(
        doc(db, 'orders', orderId),
        { includeMetadataChanges: true }, // so we also hear when the connection drops or returns
        (snap) => {
          if (!snap.exists()) {
            setState({ status: 'missing', order: null, live: false });
            return;
          }
          setState({ status: 'ready', order: { id: snap.id, ...snap.data() }, live: !snap.metadata.fromCache });
        },
        (err) => {
          // "Not yours" and "does not exist" look the same on purpose: the rules
          // refuse both, so a stranger cannot tell which order ids exist.
          setState({ status: err.code === 'permission-denied' ? 'missing' : 'error', order: null, live: false });
        },
      );
    });

    // Cleanup: stop BOTH listeners when the customer leaves the page (or the id changes).
    return () => {
      stopAuth();
      stopOrder();
    };
  }, [orderId]);

  return state;
}

// ---------- pieces ----------

function LivePill({ live }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-pill border border-line bg-surface-card px-3 py-1 text-small font-bold text-brand-text">
      <span aria-hidden="true" className={`size-2 rounded-full ${live ? 'bg-brand' : 'bg-gold'}`} />
      {live ? 'Live' : 'Reconnecting...'}
    </span>
  );
}

function Card({ title, children, className = '' }) {
  return (
    <section className={`rounded-xl border border-line bg-surface-card p-6 shadow-card ${className}`}>
      <h2 className="text-heading-3 text-ink">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

// Shown only while the order is out for delivery.
function DeliveryCodeCard({ order }) {
  const { rider, pin } = order;
  const telephone = rider?.phone ? rider.phone.replace(/[^0-9+]/g, '') : '';
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <section className="rounded-xl bg-gradient-to-br from-[var(--fb-hero-deep)] to-[var(--fb-hero-mid)] p-6 text-on-hero shadow-card">
        <p className="text-label text-gold-bright">Delivery code</p>
        <p className="mt-2 font-mono text-[40px] leading-none font-extrabold tracking-[0.3em] text-white" aria-label={`Delivery code ${pin ? pin.split('').join(' ') : 'not ready'}`}>
          {pin ?? '----'}
        </p>
        <p className="mt-3 text-small text-on-hero">Tell this code to your rider when they arrive.</p>
        {rider?.name && (
          <div className="mt-4 border-t border-white/20 pt-4">
            <p className="text-body font-bold text-white">{rider.name}</p>
            {rider.vehicle && <p className="text-small text-on-hero">{rider.vehicle}</p>}
            {telephone && (
              <a
                href={`tel:${telephone}`}
                className="mt-3 inline-grid min-h-11 place-items-center rounded-pill bg-gold-bright px-5 text-nav-link text-on-gold hover:brightness-95"
              >
                Call rider
              </a>
            )}
          </div>
        )}
      </section>
    </motion.div>
  );
}

function OrderSummary({ order }) {
  const items = order.items ?? [];
  const p = order.pricing ?? {};
  const totalLabel = { REFUND_PENDING: 'Total (refund pending)', REFUNDED: 'Total refunded' }[order.paymentStatus] ?? 'Total paid';

  return (
    <Card title="Order summary">
      <ul className="divide-y divide-line">
        {items.map((i) => (
          <li key={`${i.productId}:${i.size}`} className="flex justify-between gap-4 py-2 text-body text-ink first:pt-0">
            <span>
              {i.qty} × {i.name} <span className="text-ink-muted">({capitalise(i.size)})</span>
            </span>
            <span className="font-bold">₹{i.lineTotal}</span>
          </li>
        ))}
      </ul>

      <dl className="mt-3 flex flex-col gap-1 border-t border-line pt-3">
        <SummaryRow label="Subtotal" value={`₹${p.subtotal}`} />
        {p.discount > 0 && <SummaryRow label="Discount" value={`-₹${p.discount}`} />}
        <SummaryRow label="Delivery" value={p.deliveryFee === 0 ? 'Free' : `₹${p.deliveryFee}`} />
        {p.tip > 0 && <SummaryRow label="Rider tip" value={`₹${p.tip}`} />}
        <div className="mt-2 border-t border-line pt-2">
          <SummaryRow label={totalLabel} value={`₹${p.total}`} strong />
        </div>
      </dl>

      <div className="mt-5 border-t border-line pt-4">
        <h3 className="text-nav-link text-ink">Delivering to</h3>
        <p className="mt-1 text-body text-ink">{order.address}</p>
        <p className="text-small text-ink-muted">
          {order.zone?.name ? `${order.zone.name}, ` : ''}Pincode {order.pincode}
        </p>
        {order.note && <p className="mt-2 text-small text-ink-muted">Instructions: {order.note}</p>}
      </div>
    </Card>
  );
}

// ---------- the page ----------

export default function OrderTrackingPage() {
  const router = useRouter();
  const orderId = router.isReady && typeof router.query.id === 'string' ? router.query.id : null;
  const { status, order, live } = useLiveOrder(orderId);

  const head = (
    <Head>
      <title>Track your order | FreshBliss</title>
      <meta name="robots" content="noindex" />
    </Head>
  );

  if (status === 'loading') {
    return (
      <>
        {head}
        <div className="fb-container py-14.5">
          <div aria-hidden="true" className="h-64 rounded-xl border border-line bg-surface-card shadow-card motion-safe:animate-pulse" />
          <p role="status" className="sr-only">
            Loading your order
          </p>
        </div>
      </>
    );
  }

  if (status === 'missing' || status === 'error') {
    return (
      <>
        {head}
        <div className="fb-container py-14.5">
          <div className="mx-auto max-w-xl">
            <Callout tone={status === 'error' ? 'danger' : 'note'} title={status === 'error' ? 'We could not load your order.' : 'We could not find this order.'}>
              {status === 'error'
                ? 'Check your connection and try again.'
                : 'If you placed it on another device, open it from there.'}
            </Callout>
            <div className="mt-6 flex flex-wrap gap-3">
              {status === 'error' && (
                <button type="button" onClick={() => router.reload()} className="min-h-11 rounded-pill bg-brand px-6 text-nav-link text-on-brand hover:brightness-110">
                  Try again
                </button>
              )}
              <Link href="/products" className="inline-grid min-h-11 place-items-center rounded-pill bg-gold-bright px-6 text-nav-link text-on-gold hover:brightness-95">
                Shop Now
              </Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  const cancelled = order.status === 'CANCELLED';
  const step = ORDER_FLOW.find((s) => s.status === order.status);
  const eta = expectedBy(order);
  const deliveredAt = formatTime(order.timestamps?.DELIVERED);

  return (
    <MotionConfig reducedMotion="user">
      {head}
      <div className="fb-container py-14.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-label text-gold">
            Order <span className="text-code normal-case tracking-normal">{order.id}</span>
          </p>
          <LivePill live={live} />
        </div>

        {/* The headline is announced politely whenever the status changes. */}
        <div aria-live="polite" className="mt-2 min-h-[5.5rem]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={order.status}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
            >
              <h1 className="text-heading-2 text-brand-text">{cancelled ? 'Your order was cancelled.' : step?.line}</h1>
              {!cancelled && (
                <p className="mt-1 text-lead text-ink-muted">
                  {order.status === 'DELIVERED'
                    ? deliveredAt && `Delivered at ${deliveredAt}.`
                    : eta && `Expected by ${eta}.`}
                </p>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {cancelled && (
          <Callout tone="danger" className="mt-6" title="Cancelled">
            {order.cancelReason || 'This order was cancelled.'}
            {order.paymentStatus === 'REFUND_PENDING' && <p className="mt-2">Your payment will be refunded.</p>}
            {order.paymentStatus === 'REFUNDED' && <p className="mt-2">Your payment has been refunded.</p>}
          </Callout>
        )}

        <div className="mt-8.5 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-6">
            {!cancelled && (
              <Card title="Order status">
                <OrderTimeline status={order.status} timestamps={order.timestamps} />
              </Card>
            )}
            <AnimatePresence>{order.status === 'OUT_FOR_DELIVERY' && <DeliveryCodeCard order={order} />}</AnimatePresence>
          </div>
          <OrderSummary order={order} />
        </div>

        <div className="mt-8">
          <Link href="/products" className="inline-grid min-h-11 place-items-center rounded-pill border border-brand px-6 text-nav-link text-brand-text hover:bg-surface-cream">
            Continue shopping
          </Link>
        </div>
      </div>
    </MotionConfig>
  );
}
