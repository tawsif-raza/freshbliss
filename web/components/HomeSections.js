// The questions section of the home page (the reviews are in CustomerReviews.js).
// The words come from content/storefront.js.

import Accordion from '@/components/Accordion';
import { buildFaq } from '@/content/storefront';

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
