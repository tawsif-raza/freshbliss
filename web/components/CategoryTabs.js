// Quick filter tabs (All, Fresh Boxes, ...). A proper ARIA tab list: one tab is in the tab order at
// a time, and the arrow keys, Home and End move between them, as keyboard users expect.
//
//   tabs      [{ id, label }]
//   value     the selected tab's id
//   onChange  (id) => void
//   counts    optional { [id]: number } shown after each label
//   panelId   the id of the element the tabs control (the product grid's wrapper)

import { useRef } from 'react';

export default function CategoryTabs({ tabs, value, onChange, counts = {}, panelId, label = 'Categories' }) {
  const refs = useRef({});

  function onKeyDown(event, index) {
    const last = tabs.length - 1;
    const next = { ArrowRight: index === last ? 0 : index + 1, ArrowLeft: index === 0 ? last : index - 1, Home: 0, End: last }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const id = tabs[next].id;
    onChange(id);
    refs.current[id]?.focus();
  }

  return (
    <div role="tablist" aria-label={label} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
      {tabs.map((tab, i) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[tab.id] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`min-h-11 shrink-0 rounded-pill border px-5 text-nav-link whitespace-nowrap motion-safe:transition-colors ${
              selected ? 'border-brand bg-brand text-on-brand' : 'border-green-accent bg-surface-card text-brand-text hover:bg-surface-cream'
            }`}
          >
            {tab.label}
            {counts[tab.id] !== undefined && <span className="ml-2 opacity-75">{counts[tab.id]}</span>}
          </button>
        );
      })}
    </div>
  );
}
