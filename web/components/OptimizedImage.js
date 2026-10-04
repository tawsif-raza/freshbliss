// A photo, served the fast way: resized to the screen, converted to AVIF/WebP, lazy-loaded and cached by the image
// optimiser (next/image), with a soft placeholder while it loads. A drop-in for next/image: it takes the same props.
//
// Two safety nets, because the shop owner can put ANY photo address on a product:
//   - a host the optimiser is not allowed to fetch from (lib/imageHosts.mjs) is shown as it is, unoptimised, instead
//     of making next/image throw and take the page down;
//   - a photo that fails to load (deleted, link rotted) is replaced by a quiet "Photo unavailable" tile instead of a
//     broken-image icon. The tile is hidden from screen readers when the photo was decorative (alt="").
//
// `priority` is accepted for the one photo that is the first thing on the page (it is how Next 16 spells `preload`);
// every other photo loads lazily.

import Image from 'next/image';
import { useState } from 'react';
import { BLUR_DATA_URL, canOptimize } from '@/lib/imageHosts.mjs';

export default function OptimizedImage({ src, alt, priority = false, fill = false, className = '', ...rest }) {
  // Remember WHICH address failed, so a different photo in the same spot (the gallery) gets a fresh try.
  const [failedSrc, setFailedSrc] = useState(null);

  if (failedSrc === src) {
    const decorative = alt === '';
    return (
      <span
        role={decorative ? undefined : 'img'}
        aria-label={decorative ? undefined : alt}
        aria-hidden={decorative ? true : undefined}
        className={`${fill ? 'absolute inset-0' : ''} grid place-items-center bg-surface-cream px-1 text-center text-[12px] text-ink-muted ${className}`.trim()}
        style={fill ? undefined : { width: rest.width, height: rest.height }}
      >
        Photo unavailable
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill={fill}
      className={className}
      unoptimized={!canOptimize(src)}
      placeholder="blur"
      blurDataURL={BLUR_DATA_URL}
      preload={priority}
      onError={() => setFailedSrc(src)}
      {...rest}
    />
  );
}
