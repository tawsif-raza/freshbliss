// The order tracker: a horizontal stepper, Order Received -> Preparing -> Out for Delivery -> Delivered, with the
// current step highlighted. The steps come from the order's `status` (lib/orderStatus.js: TRACKER_STEPS).
// When the status changes, the line fills across to the new step and the dots update with a short animation.
//
//   status      the order's current status
//   timestamps  the order's timestamps map ({ PREPARING: Timestamp, ... }), shown under each reached step
//
// Motion is optional: MotionConfig reducedMotion="user" switches the movement off for visitors who ask their
// device for reduced motion. The meaning never relies on animation or colour alone: each step says "Done",
// "In progress" or "Pending" in words, and the current one is marked aria-current="step".
// It fits a 360px phone: four equal columns with the labels wrapping onto two lines.

import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { TRACKER_STEPS, formatTime, trackerStates } from '@/lib/orderStatus';

// The round marker for one step.
function Dot({ state }) {
  return (
    <motion.span
      initial={false}
      animate={{
        scale: state === 'active' ? 1.12 : 1,
        backgroundColor: state === 'done' ? 'var(--fb-brand)' : 'var(--fb-surface-card)',
        borderColor: state === 'done' ? 'var(--fb-brand)' : state === 'active' ? 'var(--fb-gold)' : 'var(--fb-line)',
      }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      className="relative z-10 grid size-8 shrink-0 place-items-center rounded-full border-2"
    >
      {/* Both icons sit in the same spot (absolute), so one can fade out while the other fades in. */}
      <AnimatePresence initial={false}>
        {state === 'done' && (
          <motion.span
            key="done"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0, transition: { duration: 0.15 } }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 grid place-items-center text-on-brand"
          >
            <Check size={16} strokeWidth={2.5} aria-hidden="true" />
          </motion.span>
        )}
        {state === 'active' && (
          <motion.span
            key="active"
            initial={{ scale: 0 }}
            animate={{ scale: [1, 1.25, 1] }}
            // The pulse repeats forever, so the exit needs its OWN short transition.
            // Without it the exit would repeat too and never finish.
            exit={{ scale: 0, transition: { duration: 0.15 } }}
            transition={{ scale: { repeat: Infinity, duration: 1.8, ease: 'easeInOut' } }}
            className="absolute inset-0 m-auto size-3 rounded-full bg-gold-bright"
          />
        )}
      </AnimatePresence>
    </motion.span>
  );
}

export default function OrderStepper({ status, timestamps = {} }) {
  const states = trackerStates(status);

  return (
    <MotionConfig reducedMotion="user">
      <ol aria-label="Order progress" className="flex">
        {TRACKER_STEPS.map((step, i) => {
          const state = states[i];
          const isLast = i === TRACKER_STEPS.length - 1;
          const time = formatTime(timestamps[step.stamp]);
          // "Packed" is part of Preparing: say so while the order sits at that point.
          const detail = state === 'active' ? (status === 'PACKED' ? 'Packed, ready for the rider' : 'In progress') : state === 'done' ? 'Done' : 'Pending';

          return (
            <li key={step.id} aria-current={state === 'active' ? 'step' : undefined} className="relative flex min-w-0 flex-1 flex-col items-center px-1 text-center">
              {/* the line from this step's dot to the next one's, filled once this step is behind us */}
              {!isLast && (
                <span aria-hidden="true" className="absolute top-[15px] left-1/2 h-0.5 w-full bg-line">
                  <motion.span
                    initial={false}
                    animate={{ scaleX: state === 'done' ? 1 : 0 }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    style={{ transformOrigin: 'left' }}
                    className="absolute inset-0 bg-brand"
                  />
                </span>
              )}
              <Dot state={state} />
              <p className={`mt-2 text-small leading-tight font-bold sm:text-body ${state === 'active' ? 'text-brand-text' : state === 'done' ? 'text-ink' : 'text-ink-muted'}`}>{step.label}</p>
              <p className="mt-0.5 text-[12px] leading-tight text-ink-muted sm:text-small">
                {detail}
                {state !== 'todo' && time ? <span className="block">{time}</span> : null}
              </p>
            </li>
          );
        })}
      </ol>
    </MotionConfig>
  );
}
