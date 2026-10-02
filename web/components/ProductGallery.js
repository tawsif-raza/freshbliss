// A product photo gallery: one large photo and, when there is more than one, a row of thumbnails.
//
//   images  up to 4 photo URLs (a product may have none yet, and the gallery copes)
//   name    the product's name, used in the photos' descriptions
//
// Thumbnails are real buttons (keyboard and screen reader friendly); the large photo fades between
// pictures unless the visitor has asked their device for less motion.

import Image from 'next/image';
import { useState } from 'react';
import { resizeImage } from '@/lib/images';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';

export default function ProductGallery({ images, name, illustrative = false }) {
  const [chosen, setChosen] = useState(0);

  // If the photos change (for example staff edit the product), never point past the end.
  const index = chosen < images.length ? chosen : 0;

  if (images.length === 0) {
    return (
      <div className="grid aspect-[4/3] place-items-center rounded-xl border border-line bg-surface-cream text-small text-ink-muted">
        Photo coming soon
      </div>
    );
  }

  const current = images[index];

  return (
    <MotionConfig reducedMotion="user">
      <div>
        <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-line bg-surface-cream">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={current}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="absolute inset-0"
            >
              {/* Photos live at addresses we do not control, so they are shown as they are. */}
              <Image src={current} alt={`${name}, photo ${index + 1} of ${images.length}`} fill sizes="(min-width: 768px) 50vw, 100vw" unoptimized className="object-cover" priority={index === 0} />
            </motion.div>
          </AnimatePresence>
        </div>

        {illustrative && <p className="mt-2 text-small text-ink-muted">Illustrative photo. The real box may look a little different.</p>}

        {images.length > 1 && (
          <ul className="mt-3 grid grid-cols-4 gap-3" aria-label={`${name} photos`}>
            {images.map((src, i) => (
              <li key={src}>
                <button
                  type="button"
                  onClick={() => setChosen(i)}
                  aria-label={`Show photo ${i + 1} of ${images.length}`}
                  aria-current={i === index}
                  className={`relative block aspect-[4/3] w-full overflow-hidden rounded-md border-2 bg-surface-cream ${i === index ? 'border-brand' : 'border-line hover:border-green-accent'}`}
                >
                  <Image src={resizeImage(src, 240)} alt="" fill sizes="120px" unoptimized className="object-cover" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </MotionConfig>
  );
}
