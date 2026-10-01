// The vertical progress tracker: one step per status, with the current step
// highlighted. When the status changes, the line fills down to the new step and
// the dots update with a short animation (Framer Motion).
//
//   status      the order's current status
//   timestamps  the order's timestamps map ({ PREPARING: Timestamp, ... })
//
// Motion is optional: MotionConfig reducedMotion="user" switches the movement off
// for visitors who ask their device for reduced motion. The meaning never relies
// on animation or colour alone: each step says "Done", "In progress" or nothing.

import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { ORDER_FLOW, formatTime } from '@/lib/orderStatus';

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

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
            <CheckIcon />
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

export default function OrderTimeline({ status, timestamps = {} }) {
  const currentIndex = ORDER_FLOW.findIndex((s) => s.status === status);
  const finished = status === 'DELIVERED';

  return (
    <MotionConfig reducedMotion="user">
      <ol aria-label="Order progress" className="flex flex-col">
        {ORDER_FLOW.map((step, i) => {
          const state = finished || i < currentIndex ? 'done' : i === currentIndex ? 'active' : 'todo';
          const isLast = i === ORDER_FLOW.length - 1;
          const time = formatTime(timestamps[step.status]);
          const connectorFilled = finished || i < currentIndex;

          return (
            <li key={step.status} aria-current={state === 'active' ? 'step' : undefined} className="flex gap-4">
              {/* marker column: dot, then the line down to the next step */}
              <div className="flex flex-col items-center">
                <Dot state={state} />
                {!isLast && (
                  <span className="relative my-1 w-0.5 flex-1 bg-line" aria-hidden="true">
                    <motion.span
                      initial={false}
                      animate={{ scaleY: connectorFilled ? 1 : 0 }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                      style={{ transformOrigin: 'top' }}
                      className="absolute inset-0 bg-brand"
                    />
                  </span>
                )}
              </div>

              <div className={`min-w-0 ${isLast ? '' : 'pb-7'}`}>
                <p className={state === 'active' ? 'text-heading-3 text-brand-text' : state === 'done' ? 'text-heading-3 text-ink' : 'text-heading-3 text-ink-muted'}>
                  {step.label}
                </p>
                <p className="text-small text-ink-muted">
                  {state === 'active' ? 'In progress' : state === 'done' ? 'Done' : 'Pending'}
                  {state !== 'todo' && time ? ` · ${time}` : ''}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </MotionConfig>
  );
}
