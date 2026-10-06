// The filter chips on the My orders page: which of the customer's orders each one keeps. Pure functions (no
// React, no Firebase), so they are easy to test.
//
//   all        every order
//   active     not delivered or cancelled yet (still on its way)
//   recent     placed in the last 30 days
//   delivered  delivered
//   cancelled  cancelled
//
// The orders arrive newest first and keep that order whichever chip is chosen.

const DAY_MS = 24 * 60 * 60 * 1000;
export const RECENT_DAYS = 30;

export const ORDER_FILTERS = [
  { id: 'all', label: 'All Orders' },
  { id: 'active', label: 'In Progress' },
  { id: 'recent', label: 'Past 30 Days' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'cancelled', label: 'Cancelled' },
];

// When an order was placed, as a Date, or null if the order has no usable date (a Firestore Timestamp, a Date
// or a {seconds} object are all read; anything else is null).
export function placedAt(order) {
  const value = order?.createdAt;
  if (typeof value?.toDate === 'function') {
    const d = value.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (Number.isFinite(value?.seconds)) return new Date(value.seconds * 1000);
  return null;
}

const ENDED = ['DELIVERED', 'CANCELLED'];

// Does this order belong under the chip? `now` is a millisecond time (Date.now()), passed in so the answer is
// repeatable.
export function matchesFilter(order, filterId, now) {
  switch (filterId) {
    case 'active':
      return !ENDED.includes(order.status);
    case 'recent': {
      const placed = placedAt(order);
      return placed !== null && placed.getTime() >= now - RECENT_DAYS * DAY_MS;
    }
    case 'delivered':
      return order.status === 'DELIVERED';
    case 'cancelled':
      return order.status === 'CANCELLED';
    default:
      return true; // 'all', and any chip we do not know
  }
}

export const filterOrders = (orders, filterId, now) => orders.filter((order) => matchesFilter(order, filterId, now));

// How many orders each chip would show, so a chip is never a surprise: { all: 7, active: 1, ... }.
export function countByFilter(orders, now) {
  return Object.fromEntries(ORDER_FILTERS.map((f) => [f.id, filterOrders(orders, f.id, now).length]));
}
