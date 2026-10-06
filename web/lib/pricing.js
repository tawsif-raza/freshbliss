// Small money and order helpers: pure functions (no React, no Firebase), easy to test.
// Every figure here is a PREVIEW. The server prices the order when the customer pays.

export const TIP_OPTIONS = [0, 10, 20, 30]; // the only tips the server accepts

const SAFE_ID = /^[A-Za-z0-9_-]{1,100}$/;

// The price of one box in a size: base price plus the size's extra (the same sum the server does).
// Returns null if the size does not exist for that product.
export function unitPrice(product, sizeId) {
  const size = product.sizes.find((s) => s.id === sizeId);
  return size ? product.price + size.extra : null;
}

// How close a cart is to free delivery, for the progress bar in the cart. Whole rupees in, plain numbers out:
//   percent    0 to 100, how full the bar is
//   remaining  rupees still to add (0 once unlocked)
//   unlocked   true once the subtotal reaches the threshold (same ">=" rule the server uses for freeDeliveryFrom)
export function freeDeliveryProgress(subtotal, threshold) {
  const have = Number.isFinite(subtotal) && subtotal > 0 ? subtotal : 0;
  const remaining = Math.max(0, threshold - have);
  return { percent: threshold > 0 ? Math.min(100, Math.round((have / threshold) * 100)) : 100, remaining, unlocked: remaining === 0 };
}

// Cart lines from a past order, for "Reorder": [{ productId, size, qty }]. Anything unreadable is dropped.
export function linesFromOrder(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const lines = [];
  for (const i of items) {
    if (typeof i?.productId !== 'string' || !SAFE_ID.test(i.productId)) continue;
    if (typeof i?.size !== 'string' || !SAFE_ID.test(i.size)) continue;
    if (!Number.isInteger(i?.qty) || i.qty < 1) continue;
    lines.push({ productId: i.productId, size: i.size, qty: i.qty });
  }
  return lines;
}

// A payment reference shown on a receipt without giving it away: "pay_Nabcdef123456" -> "pay_••••••3456".
// Only the prefix and the last four characters are kept. Returns '' when there is no reference.
export function maskPaymentId(id) {
  if (typeof id !== 'string' || id.trim() === '') return '';
  const clean = id.trim();
  if (clean.length <= 8) return '••••';
  const prefix = clean.includes('_') ? `${clean.split('_')[0]}_` : '';
  return `${prefix}${'•'.repeat(6)}${clean.slice(-4)}`;
}

// A short number a person can read out: the last 8 characters of the order id, upper case.
export const shortOrderNumber = (orderId) => (typeof orderId === 'string' && orderId ? `FB-${orderId.slice(-8).toUpperCase()}` : '');

// The numbers a summary shows while the server's price is still on its way. `discount` is 0 until the
// server confirms a promo code, since promo codes exist only on the server.
export function previewTotals({ subtotal, deliveryFee, discount = 0, tip = 0 }) {
  const fee = deliveryFee ?? 0;
  return { subtotal, discount, deliveryFee: fee, tip, total: Math.max(0, subtotal - discount + fee + tip) };
}

// Receipt/history date: "2 Oct 2026, 4:05 pm" in Indian time, whatever the viewer's own time zone.
export function formatOrderDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}
