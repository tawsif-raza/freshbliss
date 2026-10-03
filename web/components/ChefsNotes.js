// "Chef's Notes & Pairings": a small recipe card on the product page, with a serving idea for the box.
// The idea comes from lib/pairings.js (chosen by the box's slug, else its category).
//
// Colours: cream card, deep-green headings and step numbers, gold accents (all from the design tokens).

import { ChefHat, Clock } from 'lucide-react';
import { getPairingSuggestion } from '@/lib/pairings';

export default function ChefsNotes({ slug, category }) {
  const recipe = getPairingSuggestion(slug, category);

  return (
    <section aria-labelledby="chefs-notes-title" className="mt-10">
      <h2 id="chefs-notes-title" className="text-heading-3 text-ink">
        Chef&apos;s Notes &amp; Pairings
      </h2>

      <article className="mt-4 overflow-hidden rounded-2xl border border-gold-bright/50 bg-surface-cream shadow-card">
        <div className="h-1.5 bg-gradient-to-r from-hero-deep via-gold-bright to-hero-deep" aria-hidden="true" />
        <div className="grid gap-6 p-6 md:grid-cols-[1fr_1.2fr] md:gap-10 md:p-8">
          <div>
            <span className="grid size-12 place-items-center rounded-full bg-gold-bright text-on-gold">
              <ChefHat size={24} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <p className="mt-4 text-label text-gold">Serving idea</p>
            <h3 className="mt-1 text-heading-3 text-brand-text">{recipe.title}</h3>
            <p className="mt-2 text-body text-ink-muted">{recipe.blurb}</p>
            <p className="mt-3 inline-flex items-center gap-2 rounded-pill border border-line bg-surface-card px-3 py-1 text-small text-brand-text">
              <Clock size={14} aria-hidden="true" />
              {recipe.time}
            </p>
          </div>

          <div>
            <h4 className="text-label text-gold">You will need</h4>
            <ul className="mt-2 flex flex-col gap-1.5">
              {recipe.ingredients.map((item) => (
                <li key={item} className="flex gap-2 text-body text-ink">
                  <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-gold-bright" />
                  {item}
                </li>
              ))}
            </ul>

            <h4 className="mt-5 text-label text-gold">Method</h4>
            <ol className="mt-2 flex flex-col gap-3">
              {recipe.steps.map((step, i) => (
                <li key={step} className="flex gap-3 text-body text-ink">
                  <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-brand text-small font-bold text-on-brand">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </article>
    </section>
  );
}
