// An expandable list: each heading is a button that shows or hides its panel.
//
//   items          [{ id, title, content }]  (content is anything React can render)
//   defaultOpenId  the id of the item that starts open (optional)
//
// One panel can be open at a time. The button tells screen readers whether it is open
// (aria-expanded) and which panel it controls; the panel slides open unless the visitor has asked
// their device for less motion.

import { useId, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';

export default function Accordion({ items, defaultOpenId = null }) {
  const base = useId();
  const [openId, setOpenId] = useState(defaultOpenId);

  return (
    <MotionConfig reducedMotion="user">
      <div className="divide-y divide-line rounded-xl border border-line bg-surface-card shadow-card">
        {items.map((item) => {
          const open = openId === item.id;
          const buttonId = `${base}-${item.id}-button`;
          const panelId = `${base}-${item.id}-panel`;
          return (
            <div key={item.id}>
              <h3>
                <button
                  type="button"
                  id={buttonId}
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() => setOpenId(open ? null : item.id)}
                  className="flex min-h-13 w-full items-center justify-between gap-4 px-5 py-3 text-left text-heading-3 text-ink"
                >
                  {item.title}
                  <span aria-hidden="true" className={`text-brand-text motion-safe:transition-transform ${open ? 'rotate-45' : ''}`}>
                    +
                  </span>
                </button>
              </h3>
              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    key="panel"
                    id={panelId}
                    role="region"
                    aria-labelledby={buttonId}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-5 pb-5 text-body text-ink">{item.content}</div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </MotionConfig>
  );
}
