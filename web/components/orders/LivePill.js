// "Live" while the order page is connected to the server, "Reconnecting..." while offline or cached.

export default function LivePill({ live }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-pill border border-line bg-surface-card px-3 py-1 text-small font-bold text-brand-text">
      <span aria-hidden="true" className={`size-2 rounded-full ${live ? 'bg-brand' : 'bg-gold'}`} />
      {live ? 'Live' : 'Reconnecting...'}
    </span>
  );
}
