// The "Farm-to-Table" trust story on the home page: three promises, each with an icon, laid out as a
// staircase on large screens and stacked on phones. The words are in content/storefront.js.
//
// As the visitor scrolls, each card fades and slides up into place, one after another (and only once).
// Visitors who asked their device for less motion just see the cards, with no movement.
//
// Colours: deep green ground, gold icon badges with deep-green icons, cream text (all from the design tokens).

import { motion, MotionConfig } from 'framer-motion';
import { Leaf, Snowflake, Sprout } from 'lucide-react';
import { TRUST_PILLARS, TRUST_STORY } from '@/content/storefront';

const ICONS = { handpicked: Sprout, preservatives: Leaf, chilled: Snowflake };

// How far each card sits below the first on large screens: a gentle staircase.
const STAGGER = ['', 'lg:mt-10', 'lg:mt-20'];

const rise = {
  hidden: { opacity: 0, y: 32 },
  show: (index) => ({ opacity: 1, y: 0, transition: { duration: 0.55, ease: 'easeOut', delay: index * 0.12 } }),
};

export default function TrustStory() {
  return (
    <MotionConfig reducedMotion="user">
      <section aria-labelledby="trust-title" className="bg-gradient-to-br from-hero-deep to-hero-mid text-on-hero">
        <div className="fb-container py-14.5 md:py-20">
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.4 }} custom={0} variants={rise} className="max-w-2xl">
            <p className="text-label text-gold-bright">{TRUST_STORY.eyebrow}</p>
            <h2 id="trust-title" className="mt-3 text-heading-2 text-on-brand md:text-[40px] md:leading-[1.15]">
              {TRUST_STORY.title}
            </h2>
            <p className="mt-3 text-lead text-on-hero">{TRUST_STORY.intro}</p>
          </motion.div>

          <ul className="mt-10 grid gap-5 md:grid-cols-3 lg:items-start lg:gap-6">
            {TRUST_PILLARS.map((pillar, index) => {
              const Icon = ICONS[pillar.id] ?? Leaf;
              return (
                <motion.li
                  key={pillar.id}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, amount: 0.3 }}
                  custom={index + 1}
                  variants={rise}
                  className={`relative overflow-hidden rounded-xl border border-on-hero/25 bg-on-hero/5 p-6 md:p-7 ${STAGGER[index] ?? ''}`}
                >
                  {/* a large, quiet step number behind the content */}
                  <span aria-hidden="true" className="pointer-events-none absolute -top-2 right-4 font-serif text-[88px] leading-none font-bold text-on-hero/10 select-none">
                    {String(index + 1).padStart(2, '0')}
                  </span>

                  <span className="relative grid size-14 place-items-center rounded-full bg-gold-bright text-hero-deep shadow-card">
                    <Icon size={28} strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <h3 className="relative mt-5 text-heading-3 text-on-brand">{pillar.title}</h3>
                  <p className="relative mt-2 text-body text-on-hero">{pillar.text}</p>
                </motion.li>
              );
            })}
          </ul>
        </div>
      </section>
    </MotionConfig>
  );
}
