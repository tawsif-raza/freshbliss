// One question and its answer: the question is a button; pressing it slides the answer open or shut.
//
//   question  the heading text
//   children  the answer (anything React can render)
//   defaultOpen  start open (optional)
//   icon      a lucide-react icon shown before the question (optional)
//   variant   'card' (default: a boxed card, as on the FAQ page) or 'row' (no box, just a fine bottom border and a
//             deep-green heading, as in the product specifications)
//
// Each item opens and closes on its own, so a visitor can compare several answers. The slide is plain CSS: the
// answer sits in a grid row that goes from 0fr to 1fr (no measuring, no animation library). The gold chevron
// turns upside down as it opens. While shut the answer is `inert`, so keyboard and screen-reader users cannot
// land on hidden links. The button tells screen readers whether it is open (aria-expanded) and which panel it
// controls. Visitors who asked their device for less motion get no slide (styles/globals.css switches
// transitions off).
//
// The whole row is the tap target (at least 56px tall), so it is easy to hit on a phone. Colours are design tokens.

import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export default function AccordionItem({ question, children, defaultOpen = false, icon: Icon = null, variant = 'card' }) {
  const base = useId();
  const [open, setOpen] = useState(defaultOpen);
  const buttonId = `${base}-button`;
  const panelId = `${base}-panel`;
  const row = variant === 'row';

  return (
    <div
      className={
        row
          ? 'border-b border-line'
          : `rounded-xl border bg-surface-card shadow-card motion-safe:transition-colors motion-safe:duration-200 hover:bg-surface-cream ${open ? 'border-gold-bright/60' : 'border-line'}`
      }
    >
      <h3>
        <button
          type="button"
          id={buttonId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((wasOpen) => !wasOpen)}
          className={`flex min-h-14 w-full items-center justify-between gap-4 text-left text-heading-3 ${row ? 'px-1 py-4 text-brand-text' : 'rounded-xl px-5 py-4 text-ink'}`}
        >
          <span className="flex min-w-0 items-center gap-3">
            {Icon && <Icon size={22} strokeWidth={1.75} className="shrink-0 text-gold" aria-hidden="true" />}
            {question}
          </span>
          <ChevronDown aria-hidden="true" size={22} strokeWidth={2.25} className={`shrink-0 text-gold motion-safe:transition-transform motion-safe:duration-300 ${open ? 'rotate-180' : ''}`} />
        </button>
      </h3>
      <div id={panelId} role="region" aria-labelledby={buttonId} inert={!open} className={`grid motion-safe:transition-[grid-template-rows] motion-safe:duration-300 motion-safe:ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className={`pb-5 text-body text-ink-muted ${row ? 'px-1' : 'px-5'}`}>{children}</div>
        </div>
      </div>
    </div>
  );
}
