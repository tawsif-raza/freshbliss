// One question and its answer: the question is a button; pressing it slides the answer open or shut.
//
//   question  the heading text
//   children  the answer (anything React can render)
//   defaultOpen  start open (optional)
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

export default function AccordionItem({ question, children, defaultOpen = false }) {
  const base = useId();
  const [open, setOpen] = useState(defaultOpen);
  const buttonId = `${base}-button`;
  const panelId = `${base}-panel`;

  return (
    <div className={`rounded-xl border bg-surface-card shadow-card motion-safe:transition-colors motion-safe:duration-200 hover:bg-surface-cream ${open ? 'border-gold-bright/60' : 'border-line'}`}>
      <h3>
        <button
          type="button"
          id={buttonId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((wasOpen) => !wasOpen)}
          className="flex min-h-14 w-full items-center justify-between gap-4 rounded-xl px-5 py-4 text-left text-heading-3 text-ink"
        >
          {question}
          <ChevronDown aria-hidden="true" size={22} strokeWidth={2.25} className={`shrink-0 text-gold motion-safe:transition-transform motion-safe:duration-300 ${open ? 'rotate-180' : ''}`} />
        </button>
      </h3>
      <div id={panelId} role="region" aria-labelledby={buttonId} inert={!open} className={`grid motion-safe:transition-[grid-template-rows] motion-safe:duration-300 motion-safe:ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className="px-5 pb-5 text-body text-ink-muted">{children}</div>
        </div>
      </div>
    </div>
  );
}
