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

// The four steps the customer's tracker shows (the horizontal stepper on the order page). The server has five
// statuses; PACKED is folded into "Preparing" because to the customer it is still "we are getting it ready".
//   statuses  the order statuses that belong to the step     stamp  which status's time to show under it
export const TRACKER_STEPS = [
  { id: 'received', label: 'Order Received', statuses: ['PAYMENT_CONFIRMED'], stamp: 'PAYMENT_CONFIRMED' },
  { id: 'preparing', label: 'Preparing', statuses: ['PREPARING', 'PACKED'], stamp: 'PREPARING' },
  { id: 'delivery', label: 'Out for Delivery', statuses: ['OUT_FOR_DELIVERY'], stamp: 'OUT_FOR_DELIVERY' },
  { id: 'delivered', label: 'Delivered', statuses: ['DELIVERED'], stamp: 'DELIVERED' },
];

// Where an order is on the tracker: one state per step, 'done' | 'active' | 'todo'. The last step, once reached,
// is 'done' (there is nothing left to wait for). A status the tracker does not know (a cancelled order, or one
// from the future) leaves every step 'todo' rather than guessing.
export function trackerStates(status) {
  const at = TRACKER_STEPS.findIndex((step) => step.statuses.includes(status));
  const finished = at === TRACKER_STEPS.length - 1;
  return TRACKER_STEPS.map((_, i) => (at === -1 ? 'todo' : finished || i < at ? 'done' : i === at ? 'active' : 'todo'));
}

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

// ---------- customer cancel ----------
// A customer can cancel their own order only while the boxes are not packed yet. The server enforces the
// same rule (firebase/functions/cancelOrder.js, cancelMyOrder); this only decides what to SHOW.
export const CUSTOMER_CANCEL_REASONS = ['Changed my mind', 'Ordered by mistake', 'Delivery is taking too long', 'Other'];

const CUSTOMER_CANCELLABLE = ['PAYMENT_CONFIRMED', 'PREPARING'];

// 'yes'    show the Cancel button
// 'locked' the order is paid but already packed (or on its way): explain, and point to support
// 'no'     nothing to show (delivered, cancelled, or not a paid order)
export function customerCancelState(order) {
  if (!order || order.paymentStatus !== 'PAID') return 'no';
  if (CUSTOMER_CANCELLABLE.includes(order.status)) return 'yes';
  if (order.status === 'PACKED' || order.status === 'OUT_FOR_DELIVERY') return 'locked';
  return 'no';
}

// Where a cancelled order's refund has got to, for the staff "Needs refund" card.
//   'failed'    Razorpay refused it or could not be reached; refundError says why
//   'waiting'   the refund is with Razorpay and not confirmed yet
//   'not-sent'  nothing has been sent (automatic refunds off, or the function has not run yet)
export function refundState(order) {
  if (order?.refundError) return 'failed';
  if ((order?.refundPendingPaise ?? 0) > 0) return 'waiting';
  return 'not-sent';
}
