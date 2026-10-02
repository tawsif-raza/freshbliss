// A small toast system: a short message that slides in from the top of the screen, then goes away.
//
//   const toast = useToast();
//   toast.success('Classic Fresh Mix added to your cart.', { action: { label: 'View cart', onClick } });
//   toast.error('That box is out of stock.');
//
// Built with Tailwind and Framer Motion, no extra library. For people who use a screen reader the
// messages sit in a polite live region (an error is announced at once); a toast waits while the mouse
// is over it, and can always be dismissed. Nothing happens for visitors who asked their device for
// less motion except that the toast appears without sliding.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { CircleAlert, CircleCheck, X } from 'lucide-react';

const ToastContext = createContext(null);

const SHOW_MS = 4000;
const MAX_VISIBLE = 3;

function Toast({ toast, onDismiss }) {
  const [paused, setPaused] = useState(false);

  // Go away after a few seconds, unless the visitor is pointing at it.
  useEffect(() => {
    if (paused) return undefined;
    const timer = setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => clearTimeout(timer);
  }, [paused, toast.id, toast.duration, onDismiss]);

  const error = toast.tone === 'error';
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -16, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      role={error ? 'alert' : undefined}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={`pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl border bg-surface-card py-3 pr-2 pl-4 shadow-card ${error ? 'border-danger' : 'border-green-accent'}`}
    >
      <span className={`shrink-0 ${error ? 'text-danger' : 'text-brand-text'}`} aria-hidden="true">
        {error ? <CircleAlert size={22} /> : <CircleCheck size={22} />}
      </span>
      <p className="min-w-0 flex-1 text-small font-bold text-ink">{toast.message}</p>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action.onClick();
            onDismiss(toast.id);
          }}
          className="min-h-11 shrink-0 rounded-pill px-3 text-nav-link text-brand-text underline hover:bg-surface-cream"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss message"
        className="grid size-11 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-surface-cream hover:text-ink"
      >
        <X size={18} aria-hidden="true" />
      </button>
    </motion.li>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id) => setToasts((all) => all.filter((t) => t.id !== id)), []);

  const show = useCallback(({ message, tone = 'success', action = null, duration = SHOW_MS }) => {
    if (!message) return;
    nextId.current += 1;
    const toast = { id: nextId.current, message, tone, action, duration };
    // The newest few only: a burst of adds must not bury the page in messages.
    setToasts((all) => [...all.slice(-(MAX_VISIBLE - 1)), toast]);
  }, []);

  const api = useMemo(
    () => ({
      show,
      success: (message, options) => show({ ...options, message, tone: 'success' }),
      error: (message, options) => show({ ...options, message, tone: 'error' }),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <MotionConfig reducedMotion="user">
        {/* The live region is always on the page, so screen readers pick up what appears in it. */}
        <div className="fb-no-print pointer-events-none fixed inset-x-0 top-3 z-50 px-4">
          <ul aria-live="polite" className="mx-auto flex max-w-md flex-col items-center gap-2">
            <AnimatePresence initial={false}>
              {toasts.map((toast) => (
                <Toast key={toast.id} toast={toast} onDismiss={dismiss} />
              ))}
            </AnimatePresence>
          </ul>
        </div>
      </MotionConfig>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>.');
  return ctx;
}
