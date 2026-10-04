# Feature audit and roadmap (October 2026)

What was checked, what was added in this pass, and what is still open, in priority order. Each open item says
**why** it matters and **what the change would touch**, so it can be scoped before it is built.

## Audit: what is already strong
- **Server-authoritative money path.** Clients never write prices, stock or order status. `createCheckout`
  re-prices from products/zones/promos and creates the Razorpay order; `verifyPayment` (HMAC) and
  `razorpayWebhook` both end in `finalizeCheckout`, a single idempotent Firestore transaction. This matches
  Razorpay's own guidance (create the order on the server, verify the signature, use webhooks as the
  source of truth). Amount-mismatch checks, event de-duplication and rate limits are in place.
- **Rules + tests.** Firestore rules are covered by emulator tests; payments, orders and Excel sync have
  their own suites.
- **Free-tier friendly.** Next.js + Firebase + Excel/S3 sync keeps fixed cost near zero.

## Added in this pass
| Feature | Why | Where |
|---|---|---|
| **Delivery slots** (ASAP, or a window today/tomorrow, 90-min lead, IST) | Baymard's checkout research: showing delivery dates/times is a top checkout-clarity item; grocery apps all offer slots | `firebase/functions/shared/slots.js` and `web/lib/slots.js` (identical logic, parity test), `createCheckout`, `previewCheckout`, rules `validSlot`, `components/checkout/SlotPicker.js`, receipt / order page / admin card |
| **Customer self-cancel** (until packed, always restocks, sets REFUND_PENDING) | Removes support load; customers expect it; keeps the staff refund step | `cancelMyOrder` callable reusing `cancelOrderTx`, `components/orders/CancelOrderCard.js` |
| **Terms and Cancellation & Refunds pages**, checkout consent line, footer + sitemap links | Needed before taking real payments; copy only states what the code does | `content/policies.js`, `pages/terms.js`, `pages/refunds.js` |
| **FSSAI licence field** (receipt + footer, shown only when filled) | FSSAI requires the licence number on invoices and food-business listings | `content/business.js` -> `fssai` |
| FAQ fix | The FAQ said orders cannot be cancelled once "Preparing"; the system now allows it until packed | `pages/faq.js` |

## Open items, in priority order
1. ~~**Real sign-in**~~ **Done (October 2026).** Google, Microsoft and phone sign-in on `/login`; a guest is linked to the
   account (same uid), or, if that identity already has an account, their orders are moved by the `claimGuestOrders`
   callable. Header Sign in / Sign out, checkout gate (`/login?next=/checkout`, with "Continue as guest"), account
   card, terms line on the login page, privacy copy updated. Not yet run against a real Firebase project: switch on
   Anonymous, Google, Microsoft and Phone under Authentication > Sign-in method first (`docs/GO_LIVE.md`).
2. **Automatic Razorpay refunds.** `processRefund` only records a refund; a person must press the button in
   the Razorpay dashboard and nothing checks that it happened. Calling Razorpay's Refund API from the callable
   (with an idempotency key on the refund record) closes the loop. Needs `refunds` fields: `razorpayRefundId`,
   `status`.
3. **Payment capture mode.** `razorpayWebhook.js` finalizes an order on `order.paid` **and** `payment.authorized`.
   That is fine while the Razorpay account auto-captures (the default). If anyone switches the account to manual
   capture, an order could be finalized for a payment that is later auto-refunded. Keep auto-capture on, or
   drop `payment.authorized` from `HANDLED_EVENTS` (the file's own comment says how). One-line change, but check
   the dashboard setting first.
4. **Promo usage limits** (per-user and global cap, expiry): prevents a single code being used unlimited times.
   Needs a transactional counter in `finalizeCheckout`.
5. **DPDP Act consent / erasure.** The 2025 Rules need a clear consent notice and a way to withdraw or erase.
   Add an "erase my data" callable (delete orders' personal fields, keep amounts for accounting) and consent text.
6. **Tax decision.** Receipts print no tax line. Ask the accountant: GST registered? prices tax-inclusive? Then
   store the breakdown on the order at `finalizeCheckout` time (cannot be reconstructed later).
7. **Reorder button** on past orders (re-add the same boxes to the cart; server re-prices anyway).
8. **PWA manifest + install prompt** (cheap; phones are the main device).
9. **Low-stock alert to staff** (a function trigger when stock crosses a threshold).
10. **Excel sheet slot column** (orders now carry `slot`; the sheet does not export it yet).
11. **Subscriptions / loyalty** only after 1-3, they depend on stable identity and refunds.

## Things to decide (not code)
- How many days a refund takes, and any quality-complaint window. The FAQ currently promises a 12-hour
  "no-questions-asked refund or replacement"; make sure the business can honour it, and keep the FAQ,
  `content/policies.js` and the home-page FAQ saying the same thing.
- Cash on delivery: not offered. It needs a staff "cash collected" step and a no-show policy.

## Operational notes
- Slot windows are defined in **two files** (`firebase/functions/shared/slots.js`, `web/lib/slots.js`);
  change both. `web/tests/slots.test.mjs` fails if they drift.
- Never commit `functions/.env.local` / `.secret.local`.
