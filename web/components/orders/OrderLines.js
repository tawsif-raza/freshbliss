// The list of boxes in an order: "2 × Classic Fresh Mix (Large)" with the line total on the right.
// Shared by the order page, the account history and the checkout confirmation.
//
//   items  the order's items ({ productId, size, qty, name, lineTotal })

const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export default function OrderLines({ items = [] }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((i) => (
        <li key={`${i.productId}:${i.size}`} className="flex justify-between gap-4 py-2 text-body text-ink first:pt-0 last:pb-0">
          <span>
            {i.qty} × {i.name} <span className="text-ink-muted">({capitalise(String(i.size))})</span>
          </span>
          <span className="font-bold">₹{i.lineTotal}</span>
        </li>
      ))}
    </ul>
  );
}
