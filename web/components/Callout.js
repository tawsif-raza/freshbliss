// A message box with a coloured left rule, as in the design system.
//   tone="note"    gold rule on the callout surface (a tip, a status)
//   tone="danger"  danger rule on the danger surface (a warning, an error)
// Danger callouts are announced immediately (role="alert"); notes politely.

export default function Callout({ tone = 'note', title, children, className = '' }) {
  const danger = tone === 'danger';
  return (
    <div
      role={danger ? 'alert' : 'status'}
      className={`rounded-sm border-l-[5px] p-5 ${
        danger ? 'border-danger bg-surface-danger' : 'border-gold bg-surface-callout'
      } ${className}`}
    >
      {title && <h2 className="text-heading-3 text-ink">{title}</h2>}
      <div className={`text-body text-ink ${title ? 'mt-1' : ''}`}>{children}</div>
    </div>
  );
}
