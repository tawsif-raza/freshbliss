// "What customers say": review cards on the home page. Horizontal swipe on phones, three across on desktop.
// The words come from content/storefront.js.
//
// Only REAL reviews are ever shown on a live shop: placeholder entries (`sample: true`) appear while
// developing, labelled as samples, and never in production. With no real reviews the section is hidden, so a
// launch is never held up by (or tempted to fake) a review. See docs/GO_LIVE.md.

import OptimizedImage from '@/components/OptimizedImage';
import { Star } from 'lucide-react';
import { TESTIMONIALS } from '@/content/storefront';

function Stars() {
  return (
    <span role="img" aria-label="5 out of 5 stars" className="flex gap-0.5">
      {[0, 1, 2, 3, 4].map((i) => (
        <Star key={i} size={18} className="fill-gold-bright stroke-gold-bright" aria-hidden="true" />
      ))}
    </span>
  );
}

export default function CustomerReviews() {
  const showSamples = process.env.NODE_ENV !== 'production';
  const reviews = TESTIMONIALS.filter((t) => !t.sample || showSamples);
  if (reviews.length === 0) return null;

  return (
    <section aria-labelledby="reviews-title" className="overflow-hidden bg-surface-cream">
      <div className="fb-container py-14.5">
        <p className="text-label text-gold">Kind words</p>
        <h2 id="reviews-title" className="mt-2 text-heading-2 text-brand-text">
          What customers say
        </h2>

        <ul className="-mx-4 mt-8.5 flex snap-x snap-mandatory gap-4.5 overflow-x-auto px-4 pb-4 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 md:pb-0">
          {reviews.map((t, i) => (
            <li key={`${t.name}-${i}`} className="w-[85%] shrink-0 snap-center sm:w-[60%] md:w-auto">
              <figure className="flex h-full flex-col rounded-2xl border border-white/60 bg-white/70 p-6 shadow-xl backdrop-blur-md">
                <Stars />
                <blockquote className="mt-4 flex-1 text-body text-ink">“{t.quote}”</blockquote>
                <figcaption className="mt-5 flex items-center gap-3">
                  {t.avatar ? (
                    <OptimizedImage src={t.avatar} alt="" width={48} height={48} className="size-12 rounded-full object-cover ring-2 ring-gold-bright" />
                  ) : (
                    <span aria-hidden="true" className="grid size-12 place-items-center rounded-full bg-gold-bright font-serif text-lg font-bold text-on-gold">
                      {t.name.charAt(0)}
                    </span>
                  )}
                  <span className="text-small text-ink-muted">
                    <span className="block font-bold text-ink">{t.name}</span>
                    {t.area}
                    {t.sample && <span className="ml-2 rounded-pill border border-danger px-2 py-0.5 text-danger">Sample, development only</span>}
                  </span>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
