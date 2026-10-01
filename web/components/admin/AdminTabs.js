// Tabs for the staff dashboard ("Active orders" / "Needs refund").
// Accessible: arrow keys, Home and End move between tabs; only the selected tab
// is in the tab order (the rest are reached with the arrows). The page renders
// the panels, each with id="panel-<id>" and aria-labelledby="tab-<id>".
//
//   tabs      [{ id, label, count, attention? }]  attention = highlight the count (work is waiting)
//   active    the selected tab id
//   onChange  (id) => void

import { useRef } from 'react';

export default function AdminTabs({ tabs, active, onChange, label }) {
  const buttons = useRef({});

  function onKeyDown(e) {
    const i = tabs.findIndex((t) => t.id === active);
    let next = null;
    if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
    else if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
    else if (e.key === 'Home') next = tabs[0];
    else if (e.key === 'End') next = tabs[tabs.length - 1];
    if (!next) return;
    e.preventDefault();
    onChange(next.id);
    buttons.current[next.id]?.focus();
  }

  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex flex-wrap gap-2">
      {tabs.map((tab) => {
        const selected = tab.id === active;
        // The count pill: white on the selected tab, gold when work is waiting, green otherwise.
        const pill = selected
          ? 'bg-on-brand text-brand'
          : tab.attention && tab.count > 0
            ? 'bg-gold-bright text-on-gold'
            : 'bg-brand text-on-brand';
        return (
          <button
            key={tab.id}
            ref={(el) => {
              buttons.current[tab.id] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={`inline-flex min-h-11 items-center gap-2 rounded-pill px-5 text-nav-link motion-safe:transition-colors ${
              selected ? 'bg-brand text-on-brand' : 'border border-green-accent text-brand-text hover:bg-surface-cream'
            }`}
          >
            {tab.label}
            <span className={`inline-grid min-w-6 place-items-center rounded-pill px-2 py-0.5 text-[12px] leading-none ${pill}`}>{tab.count}</span>
          </button>
        );
      })}
    </div>
  );
}
