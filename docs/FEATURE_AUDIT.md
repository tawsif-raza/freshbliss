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
2. ~~**Automatic Razorpay refunds.**~~ **Done (October 2026).** Cancelling an order (customer, staff, or the system when a
   box sells out mid-payment) triggers `autoRefund`, which asks Razorpay for a full normal-speed refund. The amount is
   reserved in Firestore first and the call carries an `X-Refund-Idempotency` key, so a retry or a double trigger cannot
   refund twice. Each refund is a document in `refunds/` (Razorpay refund id, amount, status, who asked, why); the order
   keeps `refundIds`, `refundedPaise`, `refundPendingPaise`, `refundError`. `refund.created/processed/failed` webhooks move
   the order to `REFUNDED` (or `PARTIALLY_REFUNDED` for a delivered order refunded in part) and also record refunds made by
   hand in the dashboard. Staff get **Retry refund / Check status** on the Needs-refund card. Code: `functions/shared/refunds.js`,
   `autoRefund.js`, `processRefund.js`. **Only tested against a fake Razorpay**; first real test is the rehearsal (`docs/GO_LIVE.md` s.9).
   Follow-ups, small: (a) a scheduled job that re-checks refunds still pending after a day, for when a webhook is lost
   (today staff press Check status); (b) an admin screen for partial refunds and a customer "return an item" request
   (the server already accepts `processRefund({orderId, amount, requestId})`); (c) tell the customer by email/SMS when the
   refund is processed.
3. ~~**Payment capture mode.**~~ **Done in code; one dashboard check remains for you.** `razorpayWebhook` now creates an order
   only on `order.paid` (money captured), no longer on `payment.authorized`, and refuses an `order.paid` whose payment says
   `captured:false`. The browser callback (`verifyPayment`) still fires at authorization, so **Payment Capture must stay on
   Automatic** in the Razorpay dashboard in both Test and Live mode (`docs/GO_LIVE.md` s.6). The code cannot read that setting.
   If an uncaptured payment is ever auto-refunded, the refund webhook flags the still-active order with `refundAlert`.
4. ~~**Promo usage limits**~~ **Done (October 2026).** `promoCodes/{CODE}` gains `globalMaxUses`, `maxUsesPerUser`,
   `requiresSignIn` (optional) and a server-kept `usedCount`; per-customer use lives in `promoCodes/{CODE}/uses/{uid}`
   (`count`, `orderIds`, `lastUsedAt`). `previewCheckout` and `createCheckout` read the counters and refuse an exhausted code
   with a polite message ("You have already used the code X." / "This promo code has reached its usage limit." / "Sign in to
   use this promo code."). The use is counted inside `confirmPayment`'s transaction, so a double click, a retried request, the
   webhook arriving with the browser, or 8 buyers racing for 3 uses cannot exceed a limit; the loser is cancelled and
   auto-refunded (`outcome: PROMO_LIMIT`). A mistyped limit refuses the code instead of making it unlimited. The checkout
   page drops a code that became exhausted between Apply and Pay and explains why; it also no longer disables Pay after a
   refused code. Local test orders count uses too. Code: `functions/shared/promoLimits.js`, `shared/payments.js`,
   `createCheckout.js`, `previewCheckout.js`, `createMockOrder.js`; rules deny the new subcollection.
   Limits: per ACCOUNT not per person (use `requiresSignIn`), a cancelled order does not give the use back, and **no admin
   screen** (codes are edited in the Firestore console; see `docs/GO_LIVE.md` s.8.1b). Not run against real Firebase.
5. ~~**DPDP Act consent / erasure**~~ **Done (October 2026).** A consent tick-box on `/login` (starts unticked; every sign-in method waits for it),
   a privacy notice line at checkout, new "Your consent" and "Your rights and erasing your data" sections on `/privacy`, and a **Delete my data**
   section on `/account` (type `DELETE` in a confirmation dialog) backed by the `requestDataErasure` callable. It never hard-deletes a
   paid order, refund or payment record: it overwrites `address`, delivery `note`, staff-typed cancellation text and feedback comments with
   `[REDACTED - DPDP ERASURE]`, replaces the customer's `uid` (and `claimedFrom`, `updatedBy`) with a keyed hash (HMAC-SHA256 with the
   `ERASURE_HASH_KEY` secret), and keeps `items`, `pricing`, `status`, `paymentStatus`, the zone, the pincode and every Razorpay id. It also scrubs
   the name, phone, address and note cells of the order's row in the Excel sheet (first, so a failure stops cleanly), re-keys the per-customer promo
   use records, deletes the cart, wishlist and rate-limit counters, writes `erasureLog/{hash}` as proof (no personal data in it) and finally deletes
   the Firebase Auth user. It **waits** while an order is still on the way or a payment may be in flight, refuses staff accounts, is rate limited, and is
   safe to run again after a failure. The data model has no separate "user profile" document, so the cart and wishlist are the per-user documents. Code:
   `functions/shared/erasure.js`, `shared/excelErasure.js`, `requestDataErasure.js`; web `components/auth/DeleteAccountCard.js`, `lib/erasure*.js`,
   `pages/account/erased.js`. Tested by `tests/erasure.test.js` (21 emulator tests), `web/tests/erasure.test.mjs`, and rehearsal section 10 (real Auth emulator).
   Limits (also in `docs/GO_LIVE.md` s.13): Razorpay's and Google's own copies are out of reach; old S3 versions need the lifecycle rule (s.7); consent is
   not recorded per customer; no re-sign-in before erasing; erasing and re-registering gives a new account. **Needs the `ERASURE_HASH_KEY` secret before it will run.**
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
