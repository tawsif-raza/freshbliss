// Fades and slides its content up into place the first time it scrolls into view (and never again). A small wrapper so
// the home page sections share one animation instead of each repeating it. Visitors who asked their device for less
// motion see the content with no movement (MotionConfig reducedMotion="user").
//
//   as     'div' (default) or 'li', so a list item can be revealed without breaking the list's markup
//   delay  seconds to wait, to stagger a row of cards

import { MotionConfig, motion } from 'framer-motion';

export default function Reveal({ as = 'div', delay = 0, className = '', children }) {
  const Tag = motion[as] ?? motion.div;
  return (
    <MotionConfig reducedMotion="user">
      <Tag
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.55, ease: 'easeOut', delay }}
        className={className}
      >
        {children}
      </Tag>
    </MotionConfig>
  );
}
