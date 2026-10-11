// "Why fruit every day": the health benefits of the fruit and drinks in the shop, on the home page just under the FAQ.
// The words are in content/benefits.js, which also explains what this section deliberately does not say (no cures, no
// weight-loss or visible-result promises, no before-and-after photo).
//
// From the top: the heading and a fruit photo side by side (the photo first on a phone), what a daily fruit habit can
// help with, one card per nutrient, "What's in each one" (every product's own keyBenefits, grouped by lib/benefits.js,
// in an accordion so two dozen products do not swamp the page), and a note on sugar and medical advice with the source.

import Link from 'next/link';
import { Banana, Check, Citrus, Droplets, Info, Milk, Palette, Wheat, Zap } from 'lucide-react';
import Accordion from '@/components/Accordion';
import OptimizedImage from '@/components/OptimizedImage';
import Reveal from '@/components/Reveal';
import { BENEFITS, BENEFIT_POINTS, HABIT_POINTS } from '@/content/benefits';
import { benefitGroups } from '@/lib/benefits';
import { BENEFITS_IMAGE } from '@/lib/images';

const ICONS = { fibre: Wheat, vitaminC: Citrus, hydration: Droplets, potassium: Banana, energy: Zap, colour: Palette, calcium: Milk };

function ProductBenefits({ products }) {
  return (
    <ul className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {products.map((p) => (
        <li key={p.id}>
          <Link href={`/products/${p.id}`} className="font-bold text-brand-text underline-offset-4 hover:underline">
            {p.name}
          </Link>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {p.benefits.map((b) => (
              <li key={b} className="rounded-pill bg-surface-callout px-2.5 py-0.5 text-small text-ink">
                {b}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

export default function HealthBenefits({ products = [] }) {
  const groups = benefitGroups(products);

  return (
    <section id="benefits" aria-labelledby="benefits-title" className="scroll-mt-24 bg-surface-cream">
      <div className="fb-container py-14.5 md:py-20">
        <div className="grid items-center gap-10 md:grid-cols-2 md:gap-14">
          <Reveal className="order-2 md:order-1">
            <p className="text-label text-gold">{BENEFITS.eyebrow}</p>
            <h2 id="benefits-title" className="mt-2 text-heading-2 text-brand-text md:text-[40px] md:leading-[1.15]">
              {BENEFITS.title}
            </h2>
            <p className="mt-3 text-lead text-ink-muted">{BENEFITS.intro}</p>

            <h3 className="mt-8 text-heading-3 text-brand-text">{BENEFITS.habitTitle}</h3>
            <ul className="mt-3 space-y-2">
              {HABIT_POINTS.map((point) => (
                <li key={point} className="flex items-start gap-2.5 text-body text-ink">
                  <Check size={20} strokeWidth={2} aria-hidden="true" className="mt-0.5 shrink-0 text-brand" />
                  {point}
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal className="relative order-1 mr-3 mb-3 md:order-2">
            <div aria-hidden="true" className="absolute inset-0 translate-x-3 translate-y-3 rounded-2xl border-2 border-gold-bright" />
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl shadow-2xl">
              <OptimizedImage src={BENEFITS_IMAGE} alt={BENEFITS.imageAlt} fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
            </div>
          </Reveal>
        </div>

        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
          {BENEFIT_POINTS.map((point, index) => {
            const Icon = ICONS[point.id] ?? Check;
            return (
              <Reveal key={point.id} as="li" delay={(index % 4) * 0.08}>
                <div className="h-full rounded-2xl border border-line bg-surface-card p-6 shadow-card">
                  <span className="grid size-12 place-items-center rounded-xl bg-surface-callout text-gold ring-1 ring-gold/30">
                    <Icon size={24} strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 text-heading-3 text-brand-text">{point.title}</h3>
                  <p className="mt-2 text-body text-ink-muted">{point.text}</p>
                </div>
              </Reveal>
            );
          })}
        </ul>

        {groups.length > 0 && (
          <div className="mt-12 max-w-4xl">
            <h3 className="text-heading-3 text-brand-text">{BENEFITS.productsTitle}</h3>
            <p className="mt-1 text-body text-ink-muted">{BENEFITS.productsIntro}</p>
            <div className="mt-5">
              <Accordion
                items={groups.map((g) => ({ id: g.id, title: `${g.title} (${g.products.length})`, content: <ProductBenefits products={g.products} /> }))}
                defaultOpenId={groups[0].id}
              />
            </div>
          </div>
        )}

        <aside aria-labelledby="benefits-note-title" className="mt-10 max-w-4xl rounded-2xl border border-line bg-surface-card p-6">
          <h3 id="benefits-note-title" className="flex items-center gap-2 text-heading-3 text-brand-text">
            <Info size={22} aria-hidden="true" className="shrink-0 text-gold" />
            {BENEFITS.noteTitle}
          </h3>
          {BENEFITS.note.map((line) => (
            <p key={line} className="mt-2 text-body text-ink">
              {line}
            </p>
          ))}
          <p className="mt-3 text-small text-ink-muted">
            Source:{' '}
            <a href={BENEFITS.source.href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
              {BENEFITS.source.label}
            </a>
          </p>
        </aside>
      </div>
    </section>
  );
}
