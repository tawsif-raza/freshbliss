// A "label ........ value" row for order and cart summaries. Use inside a <dl>.

export default function SummaryRow({ label, value, muted = false, strong = false }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={`text-body ${muted ? 'text-ink-muted' : 'text-ink'}`}>{label}</dt>
      <dd className={strong ? 'text-kpi text-brand-text' : `text-body ${muted ? 'text-ink-muted' : 'font-bold text-ink'}`}>{value}</dd>
    </div>
  );
}
