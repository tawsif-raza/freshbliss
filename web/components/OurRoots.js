// "Our Roots": the brand story, a 50/50 split of photograph and words, just above the footer. The words and the
// photo link are in content/storefront.js.
//
// On a phone the photo sits first and the words follow; from the medium breakpoint up the words are on the left
// and the photo on the right. A gold outline sits offset behind the photo for depth, and the photo rises gently
// into place as it scrolls into view (not for visitors who asked their device for less motion).

import OptimizedImage from '@/components/OptimizedImage';
import { MotionConfig, motion } from 'framer-motion';
import { OUR_ROOTS } from '@/content/storefront';

export default function OurRoots() {
  return (
    <MotionConfig reducedMotion="user">
      <section aria-labelledby="roots-title" className="overflow-hidden">
        <div className="fb-container grid items-center gap-10 py-14.5 md:grid-cols-2 md:gap-14 md:py-20">
          <div className="order-2 md:order-1">
            <p className="text-label text-gold">{OUR_ROOTS.eyebrow}</p>
            <h2 id="roots-title" className="mt-2 text-heading-2 text-brand-text md:text-[40px] md:leading-[1.15]">
              {OUR_ROOTS.title}
            </h2>
            <p className="mt-4 max-w-xl text-lead text-ink">{OUR_ROOTS.text}</p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="relative order-1 mr-3 mb-3 md:order-2"
          >
            {/* the gold outline, offset behind the photo */}
            <div aria-hidden="true" className="absolute inset-0 translate-x-3 translate-y-3 rounded-2xl border-2 border-gold-bright" />
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl shadow-2xl">
              <OptimizedImage src={OUR_ROOTS.image} alt={OUR_ROOTS.imageAlt} fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
            </div>
          </motion.div>
        </div>
      </section>
    </MotionConfig>
  );
}
