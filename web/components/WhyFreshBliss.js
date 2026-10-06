// "Everything a good fruit order needs": six plain facts about how ordering works, as a card grid. The words are in
// content/storefront.js (WHY_FRESHBLISS). Unlike the "Farm to table" band (TrustStory.js), which is about the fruit, this
// is about the service: tracking, delivery windows, cancelling, payment, reordering and storage labels.

import { CalendarClock, Hourglass, Repeat, ShieldCheck, Snowflake, Undo2 } from 'lucide-react';
import Reveal from '@/components/Reveal';
import { WHY_FRESHBLISS } from '@/content/storefront';

const ICONS = { tracking: Hourglass, windows: CalendarClock, cancel: Undo2, secure: ShieldCheck, reorder: Repeat, storage: Snowflake };

export default function WhyFreshBliss() {
  return (
    <section aria-labelledby="why-title" className="fb-container py-14.5 md:py-20">
      <Reveal className="max-w-2xl">
        <p className="text-label text-gold">{WHY_FRESHBLISS.eyebrow}</p>
        <h2 id="why-title" className="mt-2 text-heading-2 text-brand-text md:text-[40px] md:leading-[1.15]">
          {WHY_FRESHBLISS.title}
        </h2>
        <p className="mt-3 text-lead text-ink-muted">{WHY_FRESHBLISS.intro}</p>
      </Reveal>

      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
        {WHY_FRESHBLISS.items.map((item, index) => {
          const Icon = ICONS[item.id] ?? ShieldCheck;
          return (
            <Reveal key={item.id} as="li" delay={(index % 3) * 0.08}>
              <div className="group h-full rounded-2xl border border-line bg-surface-card p-6 shadow-card motion-safe:transition-all motion-safe:duration-300 motion-safe:hover:-translate-y-1 motion-safe:hover:shadow-xl">
                <span className="grid size-12 place-items-center rounded-xl bg-surface-callout text-gold ring-1 ring-gold/30 motion-safe:transition-colors group-hover:bg-brand group-hover:text-gold-bright group-hover:ring-brand">
                  <Icon size={24} strokeWidth={1.75} aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-heading-3 text-brand-text">{item.title}</h3>
                <p className="mt-2 text-body text-ink-muted">{item.text}</p>
              </div>
            </Reveal>
          );
        })}
      </ul>
    </section>
  );
}
