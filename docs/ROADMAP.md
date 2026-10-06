# FreshBliss roadmap (October 2026)

One place that says where the project stands and what happens next. Read it after `docs/OPERATING_FRAMEWORK.md` (how
work is run) and before `docs/FEATURE_AUDIT.md` (the detailed done/open list). `docs/GO_LIVE.md` stays the launch checklist.

Contents: [1. The website today](#1-the-website-today) · [2. How we got here](#2-how-we-got-here) ·
[3. How work runs from here](#3-how-work-runs-from-here) · [4. The phases](#4-the-phases) · [5. Owner decisions](#5-decisions-only-the-owner-can-make)

---

## 1. The website today

### What is strong
- **Money is decided by the server.** `createCheckout` re-prices every cart; `verifyPayment` and `razorpayWebhook` both end
  in one idempotent Firestore transaction (`firebase/functions/shared/payments.js`). Refunds are idempotent too
  (`shared/refunds.js`), and promo limits are counted inside the same transaction (`shared/promoLimits.js`).
- **Locked-down data.** `firebase/firestore.rules` is default-deny, covered by emulator tests (`firebase/tests/rules.test.js`).
- **Abuse protection.** App Check behind `ENFORCE_APP_CHECK` (`shared/hardening.js`) and per-account/per-address rate limits
  (`shared/rateLimit.js`).
- **Privacy.** DPDP consent on `/login` and "Delete my data" (`shared/erasure.js`) that keeps the books but cuts the link to the person.
- **Operations.** Excel copy in S3 with safe concurrent writes (`shared/s3Workbook.js`), error and low-stock email alerts
  (`firebase/monitoring/alertPolicy.js`, `functions/lowStock.js`), a staff dashboard (`web/pages/admin/orders.js`).
- **Storefront.** Server-built home/shop/product pages refreshed every 10–60 s (`web/lib/serverCatalog.js`), live stock,
  delivery slots, pincode check, sort and filter, installable on a phone (`web/public/manifest.webmanifest`), enforced CSP
  and security headers (`web/vercel.json`).
- **Tests at the last full run:** web 238; backend 472 (rules 65, payments 49, orders 87, unit 215, Excel 56); money-path
  rehearsal 35/35; lint clean; production build passes. **Nothing has run against real Firebase, Razorpay, AWS or Vercel.**

### Gaps found in this audit
| # | Gap | Why it matters | Where |
|---|---|---|---|
| A1 | `FreshBliss_Master_Architecture.md` is out of date (says CSP is report-only and there is no server rendering; lists 3 secrets, not 4; Excel is 18 columns with live P–R, now 19 with live Q–S; nothing on App Check, rate limits, alerts, low stock, PWA, sign-in, erasure) | It is the system description a new contributor reads first | chapters 5–6 |
| A2 | No CI. Tests, lint and build run only by hand | A red commit can reach `main`, which Vercel deploys to production | no `.github/` |
| A3 | Branches are out of step: local `main` is `2f5dd8b "WIP before audit changes"`, 9 commits ahead of `origin/main`; all later work is on `feature/slots-cancel-compliance` (pushed). Two commits share one title (`f3f8de3`, `44339af`) | The live site is far behind the code; history is harder to read | `git log` |
| A4 | Customers cannot leave feedback. The rules already accept `feedback/{orderId}` for a delivered order, but no page writes it | The cheapest source of real reviews and quality signals is unused | `firestore.rules`, `web/pages/orders/[id].js` |
| A5 | Dark and high-contrast themes exist in `web/styles/tokens.css` but cannot be chosen: `web/pages/_document.js` fixes `data-theme="light"` | The design rules (`README.md`, Accessibility) ask for a theme and accessibility panel | `_document.js` |
| A6 | No developer guide. The root `README.md` is the design brief; setup steps are spread over GO_LIVE and `firebase/README.md` | Slows down anyone new; local-dev bugs go unnoticed (one did: section 2) | `README.md` |
| A7 | Cart, checkout, order tracking, account and admin were never audited in a browser; `web/pages/checkout/index.js` is the largest page (518 lines) | These screens carry the money | `web/pages/checkout/` |
| A8 | Content is placeholder: Unsplash photos, the "F" icon, empty business details (`web/content/business.js`), sample reviews, FAQ promises that disagree ("60 to 90 minutes" vs "within the hour", "certified organic", 12-hour refund) | Customers will hold the shop to every word | `web/content/*`, `web/lib/images.js`, `web/pages/faq.js` |
| A9 | No messages to customers: the newsletter box saves nothing, and there is no email/SMS for "order confirmed" or "refund processed" | Customers expect a confirmation; support load grows without one | `web/components/Footer.js`, FEATURE_AUDIT 2(c) |
| A10 | The web tests cover pure logic only; nothing clicks through the money path in a browser automatically | A layout bug (like the Add to Cart overlap fixed in the frontend pass) can ship unseen | `web/tests/` |

---

## 2. How we got here

### Timeline (from `git log`)
| Dates | Work |
|---|---|
| 1–2 Oct | Design system; backend and storefront; Excel sync to S3; Mumbai region enforced |
| 2–4 Oct | Storefront phases: UI overhaul, catalogue expansion, specifications, checkout UX, FAQ, command palette |
| 4 Oct | Real sign-in; automatic refunds and capture hardening; promo usage limits |
| 5 Oct | UX overhaul (mobile nav, cart upsells); free-delivery copy; pre-launch rehearsal; DPDP consent and erasure |
| 6 Oct | Re-audit sprints 1–4 (GO_LIVE gaps, Zone B free-delivery bug, Excel slot column, PWA, low-stock alert); frontend pass |

### What worked
- The **Plan → Propose → Execute → Review** loop (`docs/OPERATING_FRAMEWORK.md`), with tests in the same commit as the change.
- **Parity tests for duplicated facts:** delivery slots (`web/tests/slots.test.mjs`), the free-delivery threshold
  (`web/tests/freeDelivery.test.mjs`), the Excel columns in `firebase/docs/AWS_SETUP.md`.
- **"Copy states only what the code does"**, now enforced for the home page by `web/tests/homeContent.test.mjs`.

### What slipped, and the fix
| What slipped | Fix (section 3) |
|---|---|
| Docs drifted from code (GO_LIVE lacked the App Check and alerts sections the code pointed to; the architecture doc is still stale) | Docs change in the same commit; Phase 0 rewrites the architecture chapters |
| Early commits mixed many concerns with vague titles ("Auto-Phase 1", "UI Overhaul") | One concern per commit; the title says what changed |
| Nothing ran the tests automatically | CI on every push |
| A dev-only bug (`web/lib/serverCatalog.js` asked the emulator for the real project id) hid for days because local dev was not smoke-tested after `web/.env.local` was added | Browser smoke pass in every UI sprint; developer guide |

---

## 3. How work runs from here

- **Branches.** Work happens on `feature/<topic>`, reaches `main` only through a pull request, and only when CI is green.
  `main` is production (Vercel). Nobody commits to `main` directly.
- **CI (GitHub Actions, `.github/workflows/ci.yml`), required for merging:**
  - `web` job: `npm ci`, `npm test`, `npx eslint .`, `npx next build` with dummy public Firebase values.
  - `firebase` job: `npm ci` (in `firebase/` and `firebase/functions/`), Java via `actions/setup-java`, then `npm test`
    (rules, payments, orders, unit, Excel against the emulator).
- **Sprint loop:** as in `docs/OPERATING_FRAMEWORK.md`, plus, for any sprint that changes a screen, a browser pass at desktop
  width and in a 390 px frame (as done in the frontend pass).
- **Docs:** `docs/FEATURE_AUDIT.md` and this file are updated in the sprint that changes them.
- **The owner decides:** money, policy and legal wording; merging to `main`; anything that touches real Firebase,
  Razorpay, AWS or Vercel accounts (section 5).

---

## 4. The phases

Each item says what it touches. Items in a phase can be done in any order; phases are in priority order.

### Phase 0 – Housekeeping (no owner input needed)
| Item | Touches |
|---|---|
| CI workflow (A2) | new `.github/workflows/ci.yml` |
| Bring the architecture doc up to date (A1), reusing GO_LIVE sections 4–5 and FEATURE_AUDIT | `FreshBliss_Master_Architecture.md` |
| Developer guide (A6): `npm run dev`, emulators and seed, tests, which env file does what | new `docs/DEVELOPING.md`, link from `README.md` |
| Open the pull request `feature/slots-cancel-compliance → main`; the owner reviews and merges (A3) | GitHub |

### Phase 1 – Launch readiness (needs the owner's content and accounts)
| Item | Touches |
|---|---|
| Owner supplies logo, product photos, business details, FSSAI number, hours/contact, FAQ answers, tax decision (A8) | — |
| Swap in the real photos and icon | product `images` in Firestore, `web/lib/images.js`, `web/scripts/build-icons.mjs` → `web/public/icons/` |
| Fill in the business details and fix the FAQ promises | `web/content/business.js`, `web/content/storefront.js`, `web/pages/faq.js` |
| Rehearsal in test mode, together: GO_LIVE sections 2–9 (CSP walk-through, App Check, alerts, refunds) | real Firebase/Razorpay test mode |
| Go live (GO_LIVE section 10) — owner only | real accounts |

### Phase 2 – The money screens (A7, A10)
| Item | Touches |
|---|---|
| Browser audit of cart, checkout, order tracking, account and admin; fix what it finds | `web/pages/{cart,checkout,orders,account,admin}/` |
| Split the checkout page into smaller pieces where that lowers risk; the rules stay in tested `web/lib/` functions | `web/pages/checkout/index.js`, `web/components/checkout/` |
| Browser smoke tests (Playwright) against the emulator stack: browse → add to cart → checkout (local mock order) → track; run in CI | new `web/e2e/`, CI |

### Phase 3 – The customer loop
| Item | Touches |
|---|---|
| Feedback after delivery on the order page (A4); the rules already check its shape | `web/pages/orders/[id].js`, new `web/components/orders/FeedbackCard.js` |
| Theme and accessibility choice: light, dark, high contrast, remembered in the browser (A5) | `web/pages/_document.js`, `web/components/SiteHeader.js` |
| Order and refund messages by email or SMS (A9; FEATURE_AUDIT 2(c)) — provider chosen by the owner | new Cloud Function triggers in `firebase/functions/` |
| Newsletter: connect a provider or remove the box (A9) | `web/components/Footer.js` |
| Daily re-check of refunds still pending (FEATURE_AUDIT 2(a)); partial-refund screen for staff (2(b)) | `firebase/functions/`, `web/components/admin/` |

### Phase 4 – Growth (once real orders exist)
Real reviews (from feedback, with permission), subscriptions or loyalty (FEATURE_AUDIT 11), analytics (with a privacy-page
update), tax invoices (after the accountant's decision), and real sign-in for staff instead of browser-bound accounts.

---

## 5. Decisions only the owner can make
| Decision | Blocks |
|---|---|
| GST: registered? prices tax-inclusive? which rate? | Tax line on receipts, tax invoices |
| Refund timeline and the quality-complaint window (the FAQ promises 12 hours) | FAQ, `/refunds` |
| The delivery promise ("within the hour" vs "60 to 90 minutes") | Hero, FAQ, product pages |
| Keep or remove Microsoft sign-in (needs an Azure app registration) | `/login`, GO_LIVE section 2 |
| Email/SMS provider for order messages; keep or remove the newsletter box | Phase 3 |
| Cash on delivery (not offered today) | Checkout, staff flow |
| When to merge to `main` (that publishes to production) | Phase 0 pull request |
