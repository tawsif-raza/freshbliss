// The strip above the shop's grid: how many boxes are showing, an "In stock only" switch and a sort menu.
// Plain, labelled form controls (a checkbox and a native select), so they work with a keyboard, a screen reader and a phone's
// own picker. The ordering rules are in lib/sort.js; this only draws the controls and reports what was chosen.
//
//   count        how many boxes are showing now
//   sort         the chosen sort id            onSort(id)
//   inStockOnly  true/false                    onInStockOnly(boolean)

import { useId } from 'react';
import { SORT_OPTIONS } from '@/lib/sort';

export default function ShopToolbar({ count, sort, onSort, inStockOnly, onInStockOnly }) {
  const sortId = useId();
  const stockId = useId();

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-xl border border-line bg-surface-card px-4 py-3 shadow-card">
      <p role="status" className="text-small text-ink-muted">
        {count} {count === 1 ? 'box' : 'boxes'}
      </p>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <label htmlFor={stockId} className="flex min-h-11 cursor-pointer items-center gap-2 text-nav-link text-ink">
          <input id={stockId} type="checkbox" checked={inStockOnly} onChange={(e) => onInStockOnly(e.target.checked)} className="size-5 accent-[var(--fb-brand)]" />
          In stock only
        </label>

        <div className="flex items-center gap-2">
          <label htmlFor={sortId} className="text-nav-link text-ink">
            Sort by
          </label>
          <select
            id={sortId}
            value={sort}
            onChange={(e) => onSort(e.target.value)}
            className="min-h-11 rounded-pill border border-green-accent bg-surface-card px-4 text-nav-link text-brand-text"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
