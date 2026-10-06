// "How it works": the four steps of an order, numbered, on the home page. The words are in content/storefront.js
// (HOW_IT_WORKS), and each describes what the shop really does today.
//
// On a large screen the steps sit in a row joined by a thin dotted line; on a phone they stack. The cards rise into
// place as they scroll into view (components/Reveal.js), one after another.

import { CalendarClock, PackageCheck, ShieldCheck, ShoppingBasket } from 'lucide-react';
import Reveal from '@/components/Reveal';
import { HOW_IT_WORKS } from '@/content/storefront';

const ICONS = { choose: ShoppingBasket, slot: CalendarClock, pay: ShieldCheck, track: PackageCheck };

export default function HowItWorks() {
  return (
    <section aria-labelledby="how-title" className="bg-surface-cream">
      <div className="fb-container py-14.5 md:py-20">
        <Reveal className="max-w-2xl">
          <p className="text-label text-gold">{HOW_IT_WORKS.eyebrow}</p>
          <h2 id="how-title" className="mt-2 text-heading-2 text-brand-text md:text-[40px] md:leading-[1.15]">
            {HOW_IT_WORKS.title}
          </h2>
          <p className="mt-3 text-lead text-ink-muted">{HOW_IT_WORKS.intro}</p>
        </Reveal>

        <ol className="relative mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {/* the dotted line behind the icons (large screens only; decorative) */}
          <li aria-hidden="true" className="pointer-events-none absolute top-[3.25rem] right-[12%] left-[12%] hidden border-t-2 border-dotted border-gold/50 lg:block" />
          {HOW_IT_WORKS.steps.map((step, index) => {
            const Icon = ICONS[step.id] ?? ShoppingBasket;
            return (
              <Reveal key={step.id} as="li" delay={index * 0.1} className="relative">
                <div className="h-full rounded-2xl border border-line bg-surface-card p-6 shadow-card">
                  <div className="flex items-center justify-between">
                    <span className="relative grid size-14 place-items-center rounded-full bg-brand text-on-brand ring-8 ring-surface-card">
                      <Icon size={26} strokeWidth={1.75} aria-hidden="true" />
                    </span>
                    <span aria-hidden="true" className="font-serif text-[44px] leading-none font-bold text-gold/35 select-none">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                  </div>
                  <h3 className="mt-5 text-heading-3 text-brand-text">
                    <span className="sr-only">Step {index + 1}: </span>
                    {step.title}
                  </h3>
                  <p className="mt-2 text-body text-ink-muted">{step.text}</p>
                </div>
              </Reveal>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
