// The home page banner: a full-width, cinematic photograph with the headline set low over a deep-green fade.
//
// A switch flips it between "Everyday Fresh" and "Ramadan Special"; the photo cross-fades (and drifts very
// slowly, like a film still), and the words change with a short fade. Both stop for visitors who asked their
// device for less motion. The buttons jump to the boxes below and pick the matching category tab.
//
// Legibility: a single gradient runs up from the bottom of the photo, 90% deep green at the foot, 40% in the
// middle, clear at the top. The headline, the buttons and the badges sit in the lower two thirds, on the
// green; the season switch at the top sits in its own frosted pill. The hero is always dark, so its cream and
// gold are fixed colours that do not change with the page theme.
//
//   onPickCategory  (categoryId) => void   called when a button is pressed

import OptimizedImage from '@/components/OptimizedImage';
import { useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { DEFAULT_HERO_MODE, HERO_MODES, TRUST_BADGES } from '@/content/storefront';
import { HERO_IMAGES } from '@/lib/images';

export default function Hero({ onPickCategory }) {
  const [modeId, setModeId] = useState(DEFAULT_HERO_MODE);
  const mode = HERO_MODES[modeId];

  return (
    <MotionConfig reducedMotion="user">
      <section aria-labelledby="hero-title" className="relative isolate flex min-h-[70vh] w-full overflow-hidden bg-[#173f2a] text-[#f5f1e9]">
        {/* The photograph for the season (placeholder stock photography: see lib/images.js). Decorative. */}
        <div aria-hidden="true" className="absolute inset-0 -z-10">
          <AnimatePresence initial={false}>
            <motion.div key={modeId} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.8 }}>
              <motion.div className="absolute inset-0" initial={{ scale: 1 }} animate={{ scale: 1.07 }} transition={{ duration: 16, ease: 'linear' }}>
                <OptimizedImage src={HERO_IMAGES[modeId]} alt="" fill priority sizes="100vw" className="object-cover" />
              </motion.div>
            </motion.div>
          </AnimatePresence>
          <div className="absolute inset-0 bg-gradient-to-t from-[#173f2a]/90 via-[#173f2a]/40 to-transparent" />
        </div>

        <div className="fb-container flex w-full flex-col justify-between gap-12 py-8 md:py-12">
          {/* The season switch: two buttons, one pressed, in a frosted pill so it reads on any photo. */}
          <div>
            <div role="group" aria-label="Choose what to show" className="inline-flex rounded-full border border-[#f5f1e9]/30 bg-[#173f2a]/45 p-1 shadow-xl backdrop-blur-md">
              {Object.values(HERO_MODES).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={modeId === m.id}
                  onClick={() => setModeId(m.id)}
                  className={`min-h-11 rounded-full px-5 text-nav-link motion-safe:transition-colors ${
                    modeId === m.id ? 'bg-gold-bright text-[#173f2a]' : 'text-[#f5f1e9] hover:bg-[#f5f1e9]/15'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            {/* Announced politely when the switch is pressed. */}
            <div aria-live="polite" className="min-h-[15rem] md:min-h-[13rem]">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={mode.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }} transition={{ duration: 0.3 }}>
                  <p className="inline-block rounded-full bg-[#173f2a]/70 px-4 py-1.5 text-label text-gold-bright backdrop-blur-md">{mode.eyebrow}</p>
                  <h1 id="hero-title" className="mt-3 max-w-3xl text-display text-[#f5f1e9] [text-shadow:0_2px_28px_rgba(16,45,31,0.55)]">
                    {mode.headline}
                  </h1>
                  <p className="mt-4 max-w-xl text-lead text-[#f5f1e9]/90 [text-shadow:0_1px_16px_rgba(16,45,31,0.6)]">{mode.body}</p>

                  <div className="mt-7 flex flex-wrap items-center gap-4">
                    <a
                      href="#shop"
                      onClick={() => onPickCategory?.(mode.primary.category)}
                      className="inline-flex items-center justify-center rounded-full bg-gold-bright px-10 py-4 text-base font-bold text-[#173f2a] shadow-2xl motion-safe:transition-transform motion-safe:duration-300 motion-safe:hover:scale-105 hover:brightness-105"
                    >
                      {mode.primary.label}
                    </a>
                    <a
                      href="#shop"
                      onClick={() => onPickCategory?.(mode.secondary.category)}
                      className="inline-flex items-center justify-center rounded-full border border-[#f5f1e9]/70 px-8 py-4 text-base font-bold text-[#f5f1e9] backdrop-blur-sm motion-safe:transition-colors hover:bg-[#f5f1e9]/15"
                    >
                      {mode.secondary.label}
                    </a>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            <ul className="mt-8 flex flex-wrap gap-x-8 gap-y-3 border-t border-[#f5f1e9]/25 pt-6" aria-label="Why FreshBliss">
              {TRUST_BADGES.map((badge) => (
                <li key={badge} className="flex items-center gap-2 text-small font-bold text-[#f5f1e9]">
                  <span className="grid size-6 place-items-center rounded-full bg-gold-bright text-[#173f2a]">
                    <Check size={14} strokeWidth={3} aria-hidden="true" />
                  </span>
                  {badge}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </MotionConfig>
  );
}
