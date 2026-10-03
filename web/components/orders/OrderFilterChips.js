// The row of filter chips above the order list: All Orders, In Progress, Past 30 Days, Delivered, Cancelled.
// Each shows how many orders it holds. They are toggle buttons (aria-pressed), one chosen at a time, and the row
// scrolls sideways on a narrow phone instead of wrapping onto many lines.
//
//   filters  [{ id, label }]     counts  { [id]: number }
//   value    the chosen id       onChange(id)

export default function OrderFilterChips({ filters, counts, value, onChange }) {
  return (
    <div role="group" aria-label="Filter orders" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
      {filters.map((f) => {
        const chosen = f.id === value;
        return (
          <button
            key={f.id}
            type="button"
            aria-pressed={chosen}
            onClick={() => onChange(f.id)}
            className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-pill border px-4 text-nav-link whitespace-nowrap motion-safe:transition-colors motion-safe:duration-200 ${
              chosen ? 'border-brand bg-brand text-on-brand' : 'border-line bg-surface-card text-brand-text hover:bg-surface-cream'
            }`}
          >
            {f.label}
            <span className={`inline-grid min-w-6 place-items-center rounded-pill px-2 py-0.5 text-[12px] leading-none ${chosen ? 'bg-on-brand/20' : 'bg-surface-tag'}`}>{counts[f.id] ?? 0}</span>
          </button>
        );
      })}
    </div>
  );
}
