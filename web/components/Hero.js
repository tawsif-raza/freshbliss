// The home page banner. A switch flips it between "Everyday Fresh" and "Ramadan Special"; the words
// change with a short fade (none if the visitor asked their device for less motion). The buttons
// jump to the boxes below and pick the matching category tab.
//
//   onPickCategory  (categoryId) => void   called when a button is pressed

import { useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { DEFAULT_HERO_MODE, HERO_MODES, TRUST_BADGES } from '@/content/storefront';

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </svg>
  );
}

export default function Hero({ onPickCategory }) {
  const [modeId, setModeId] = useState(DEFAULT_HERO_MODE);
  const mode = HERO_MODES[modeId];

  return (
    <MotionConfig reducedMotion="user">
      <section aria-labelledby="hero-title" className="bg-gradient-to-br from-hero-deep to-hero-mid text-on-hero">
        <div className="fb-container py-14.5 md:py-20">
          {/* The season switch: two buttons, one pressed. */}
          <div role="group" aria-label="Choose what to show" className="inline-flex rounded-pill border border-on-hero/30 p-1">
            {Object.values(HERO_MODES).map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={modeId === m.id}
                onClick={() => setModeId(m.id)}
                className={`min-h-11 rounded-pill px-5 text-nav-link motion-safe:transition-colors ${
                  modeId === m.id ? 'bg-gold-bright text-on-gold' : 'text-on-hero hover:bg-on-hero/10'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Announced politely when the switch is pressed. */}
          <div aria-live="polite" className="mt-8 min-h-[16rem] md:min-h-[14rem]">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={mode.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }}>
                <p className="text-label text-gold-bright">{mode.eyebrow}</p>
                <h1 id="hero-title" className="mt-3 max-w-3xl text-display text-on-brand">
                  {mode.headline}
                </h1>
                <p className="mt-4 max-w-xl text-lead text-on-hero">{mode.body}</p>

                <div className="mt-6 flex flex-wrap gap-3">
                  <a
                    href="#shop"
                    onClick={() => onPickCategory?.(mode.primary.category)}
                    className="inline-grid min-h-12 place-items-center rounded-pill bg-gold-bright px-7 text-nav-link text-on-gold hover:brightness-95"
                  >
                    {mode.primary.label}
                  </a>
                  <a
                    href="#shop"
                    onClick={() => onPickCategory?.(mode.secondary.category)}
                    className="inline-grid min-h-12 place-items-center rounded-pill border border-on-hero px-7 text-nav-link text-on-hero hover:bg-on-hero/10"
                  >
                    {mode.secondary.label}
                  </a>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          <ul className="mt-6 flex flex-wrap gap-x-8 gap-y-3 border-t border-on-hero/20 pt-6" aria-label="Why FreshBliss">
            {TRUST_BADGES.map((badge) => (
              <li key={badge} className="flex items-center gap-2 text-small font-bold text-on-hero">
                <span className="text-gold-bright">
                  <CheckIcon />
                </span>
                {badge}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </MotionConfig>
  );
}
