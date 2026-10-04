// Customer order tracking: /orders/<order id>
// Listens to the order document with Firestore onSnapshot, so when staff move
// the order to its next step this page updates by itself, with no refresh.

import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import Callout from '@/components/Callout';
import OrderReceipt from '@/components/OrderReceipt';
import OrderStepper from '@/components/OrderStepper';
import TrackingSkeleton from '@/components/TrackingSkeleton';
import CancelOrderCard from '@/components/orders/CancelOrderCard';
import DeliveryCodeCard from '@/components/orders/DeliveryCodeCard';
import InfoCard from '@/components/orders/InfoCard';
import LivePill from '@/components/orders/LivePill';
import OrderSummary from '@/components/orders/OrderSummary';
import { useLiveOrder } from '@/lib/liveOrder';
import { ORDER_FLOW, expectedBy, formatTime } from '@/lib/orderStatus';
import { slotText } from '@/lib/slots';

// ---------- the page ----------

export default function OrderTrackingPage() {
  const router = useRouter();
  const orderId = router.isReady && typeof router.query.id === 'string' ? router.query.id : null;
  const { status, order, live } = useLiveOrder(orderId);

  // The printable receipt. It opens by itself when the address ends in ?receipt=1 (the links from the
  // confirmation screen and the account page), or when the customer presses the button.
  //   'auto'   follow the address    'open'  the customer asked    'closed'  the customer closed it
  const [receipt, setReceipt] = useState('auto');
  const receiptOpen = status === 'ready' && (receipt === 'open' || (receipt === 'auto' && router.isReady && router.query.receipt === '1'));

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
          <TrackingSkeleton />
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
  const scheduled = slotText(order.slot); // '' for an "as soon as possible" order
  const deliveredAt = formatTime(order.timestamps?.DELIVERED);

  return (
    <MotionConfig reducedMotion="user">
      {head}
      {/* Left out of the printed receipt (see styles/globals.css). */}
      <div className="fb-container fb-no-print py-14.5">
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
                    : scheduled ? `Scheduled: ${scheduled}.` : eta && `Expected by ${eta}.`}
                </p>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {cancelled && (
          <Callout tone="danger" className="mt-6" title="Cancelled">
            {order.cancelReason || 'This order was cancelled.'}
            {order.paymentStatus === 'REFUND_PENDING' && <p className="mt-2">Your refund is being sent to your original payment method.</p>}
            {order.paymentStatus === 'REFUNDED' && <p className="mt-2">Your payment has been refunded.</p>}
          </Callout>
        )}

        {/* One column, so the stepper has the whole width to spread across. */}
        <div className="mt-8.5 flex max-w-3xl flex-col gap-6">
          {!cancelled && (
            <InfoCard title="Order status">
              <OrderStepper status={order.status} timestamps={order.timestamps} />
            </InfoCard>
          )}
          <AnimatePresence>{order.status === 'OUT_FOR_DELIVERY' && <DeliveryCodeCard order={order} />}</AnimatePresence>
          <OrderSummary order={order} />
          <CancelOrderCard order={order} />
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setReceipt('open')}
            className="min-h-11 rounded-pill bg-gold-bright px-6 text-nav-link text-on-gold hover:brightness-95"
          >
            View receipt
          </button>
          <Link href="/products" className="inline-grid min-h-11 place-items-center rounded-pill border border-brand px-6 text-nav-link text-brand-text hover:bg-surface-cream">
            Continue shopping
          </Link>
        </div>
      </div>

      <OrderReceipt order={order} open={receiptOpen} onClose={() => setReceipt('closed')} />
    </MotionConfig>
  );
}
