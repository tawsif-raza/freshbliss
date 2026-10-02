// The lower sections of the home page: reviews and questions.
// The words come from content/storefront.js.

import Accordion from '@/components/Accordion';
import { TESTIMONIALS, buildFaq } from '@/content/storefront';

// Reviews. Only REAL reviews are ever shown on a live shop: placeholder entries (`sample: true`) appear
// while developing, labelled as samples, and never in production. With no real reviews the section is
// hidden, so a launch is never held up by (or tempted to fake) a review.
export function Testimonials() {
  const showSamples = process.env.NODE_ENV !== 'production';
  const reviews = TESTIMONIALS.filter((t) => !t.sample || showSamples);
  if (reviews.length === 0) return null;

  return (
    <section aria-labelledby="reviews-title" className="bg-surface-cream">
      <div className="fb-container py-14.5">
        <p className="text-label text-gold">Kind words</p>
        <h2 id="reviews-title" className="mt-2 text-heading-2 text-brand-text">
          What customers say
        </h2>
        <ul className="mt-8.5 grid gap-4.5 md:grid-cols-3">
          {reviews.map((t, i) => (
            <li key={`${t.name}-${i}`}>
              <figure className="flex h-full flex-col rounded-xl border border-line bg-surface-card p-6 shadow-card">
                <blockquote className="text-body text-ink">“{t.quote}”</blockquote>
                <figcaption className="mt-4 text-small text-ink-muted">
                  <span className="font-bold text-ink">{t.name}</span>
                  {t.area && <>, {t.area}</>}
                  {t.sample && <span className="ml-2 rounded-pill border border-danger px-2 py-0.5 text-danger">Sample, development only</span>}
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Faq({ zones }) {
  return (
    <section id="faq" aria-labelledby="faq-title" className="fb-container scroll-mt-24 py-14.5">
      <p className="text-label text-gold">Good to know</p>
      <h2 id="faq-title" className="mt-2 text-heading-2 text-brand-text">
        Questions, answered
      </h2>
      <div className="mt-8.5 max-w-3xl">
        <Accordion items={buildFaq(zones).map((f) => ({ id: f.id, title: f.question, content: <p>{f.answer}</p> }))} defaultOpenId="hygiene" />
      </div>
    </section>
  );
}
