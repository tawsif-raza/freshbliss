// Order statuses as the browser sees them: the delivery line, the words
// customers read, and the buttons staff press. The rules for what is allowed
// live on the server (firebase/functions/shared/orderStatus.js); this file only
// decides what to SHOW.

// The delivery line, in order. `label` is what the customer reads; `line` is a
// short sentence for the headline while the order is in that step.
export const ORDER_FLOW = [
  { status: 'PAYMENT_CONFIRMED', label: 'Order Confirmed', line: 'Your order is confirmed.' },
  { status: 'PREPARING', label: 'Preparing', line: 'We are slicing your fruit fresh.' },
  { status: 'PACKED', label: 'Packed', line: 'Packed and ready for the rider.' },
  { status: 'OUT_FOR_DELIVERY', label: 'Out for Delivery', line: 'Your box is on its way.' },
  { status: 'DELIVERED', label: 'Delivered', line: 'Delivered. Enjoy your freshness.' },
];

// Orders staff still have to work on: everything on the line except DELIVERED.
export const ACTIVE_STATUSES = ORDER_FLOW.slice(0, -1).map((s) => s.status);

export const statusLabel = (status) =>
  ORDER_FLOW.find((s) => s.status === status)?.label ?? (status === 'CANCELLED' ? 'Cancelled' : status);

// What staff press to move an order on, keyed by its CURRENT status.
export const NEXT_ACTION = {
  PAYMENT_CONFIRMED: { to: 'PREPARING', label: 'Mark as Preparing' },
  PREPARING: { to: 'PACKED', label: 'Mark as Packed' },
  PACKED: { to: 'OUT_FOR_DELIVERY', label: 'Mark as Out for Delivery' },
  OUT_FOR_DELIVERY: { to: 'DELIVERED', label: 'Mark as Delivered' },
};

// Firestore Timestamp -> "12:31 PM" (12-hour with AM/PM, as the design asks).
// Returns '' for a missing or not-yet-set timestamp.
export function formatTime(timestamp) {
  const date = typeof timestamp?.toDate === 'function' ? timestamp.toDate() : null;
  return date ? date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '';
}

// When the order is expected: confirmed time plus the zone's estimate. '' if unknown.
export function expectedBy(order) {
  const start = order.timestamps?.PAYMENT_CONFIRMED?.toDate?.();
  if (!start || !Number.isFinite(order.etaMinutes)) return '';
  const when = new Date(start.getTime() + order.etaMinutes * 60000);
  return when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// Reasons staff can pick when cancelling an order. "Other" needs a written detail.
export const CANCEL_REASONS = [
  'Customer called to cancel',
  'Cannot deliver to this address',
  'Item not available',
  'Other',
];

// Cancelling BEFORE packing puts the boxes back in stock by default; after
// packing the fruit already exists, so it does not. Staff can change either way.
export const restockByDefault = (status) => status === 'PAYMENT_CONFIRMED' || status === 'PREPARING';
