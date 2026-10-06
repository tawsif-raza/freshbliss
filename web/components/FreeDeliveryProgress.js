// "Add ₹X more to unlock FREE delivery": a progress bar at the top of the cart (the slide-out and the cart page).
//
//   subtotal   the cart's subtotal in whole rupees (CartContext.subtotal)
//
// Under the threshold the bar fills in deep green as the cart grows; at or over it the bar is solid gold with a tick.
// The numbers come from the live cart, which is empty on the server and in the first browser render, so the
// callers draw this only once the cart has loaded (nothing here can differ between server and browser).
// The fill animates with framer-motion (and not at all for visitors who prefer less motion: the cart drawer's
// MotionConfig, or the one below on the cart page). This is a preview: the server prices the delivery at checkout.

import { MotionConfig, motion } from 'framer-motion';
import { Check, Truck } from 'lucide-react';
import { FREE_DELIVERY_THRESHOLD } from '@/content/storefront';
import { freeDeliveryProgress } from '@/lib/pricing';

export default function FreeDeliveryProgress({ subtotal, className = '' }) {
  const { percent, remaining, unlocked } = freeDeliveryProgress(subtotal, FREE_DELIVERY_THRESHOLD);

  return (
    <MotionConfig reducedMotion="user">
      <div className={`rounded-xl border bg-surface-card p-3 ${unlocked ? 'border-gold-bright' : 'border-line'} ${className}`}>
        <p role="status" className="flex items-center gap-2 text-small font-bold text-ink">
          <span
            aria-hidden="true"
            className={`grid size-6 shrink-0 place-items-center rounded-full ${unlocked ? 'bg-gold-bright text-on-gold' : 'bg-surface-cream text-brand-text'}`}
          >
            {unlocked ? <Check size={14} strokeWidth={3} /> : <Truck size={14} />}
          </span>
          {unlocked ? (
            <span>
              You have unlocked FREE Delivery! <span aria-hidden="true">🎉</span>
            </span>
          ) : (
            <span>
              Add ₹{remaining} more to unlock FREE Delivery! <span aria-hidden="true">🚚</span>
            </span>
          )}
        </p>
        <div
          role="progressbar"
          aria-label="Progress towards free delivery"
          aria-valuemin={0}
          aria-valuemax={FREE_DELIVERY_THRESHOLD}
          aria-valuenow={Math.min(subtotal, FREE_DELIVERY_THRESHOLD)}
          className="mt-2 h-2 overflow-hidden rounded-full bg-surface-sunken"
        >
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${percent}%` }}
            transition={{ type: 'tween', ease: 'easeOut', duration: 0.5 }}
            className={`h-full rounded-full ${unlocked ? 'bg-gold-bright' : 'bg-brand'}`}
          />
        </div>
      </div>
    </MotionConfig>
  );
}
