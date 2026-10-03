// A titled white card used for the blocks on the order page (status, summary).

export default function InfoCard({ title, children, className = '' }) {
  return (
    <section className={`rounded-xl border border-line bg-surface-card p-6 shadow-card ${className}`}>
      <h2 className="text-heading-3 text-ink">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
