// A small live stock label: "Out of stock", "Only 3 left" or "In stock".
// Stock comes from the shared live catalogue (lib/catalog.js), so this changes by itself when
// someone buys the last box. The server still re-checks stock when the customer pays.

export const LOW_STOCK_AT = 5; // "Only N left" at 5 or fewer, per the design system

export default function StockBadge({ stock, className = '' }) {
  if (stock <= 0) {
    return (
      <span className={`inline-flex items-center rounded-pill border border-danger bg-surface-danger px-3 py-1 text-small font-bold text-danger ${className}`}>
        Out of stock
      </span>
    );
  }
  if (stock <= LOW_STOCK_AT) {
    return (
      <span className={`inline-flex items-center rounded-pill border border-danger bg-surface-danger px-3 py-1 text-small font-bold text-danger ${className}`}>
        Only {stock} left
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center rounded-pill border border-line bg-surface-tag px-3 py-1 text-small font-bold text-brand-text ${className}`}>
      In stock
    </span>
  );
}
