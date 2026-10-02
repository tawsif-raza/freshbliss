# FreshBliss backend (Firebase)

Firestore, Auth and Cloud Functions, developed against the **Firebase Emulator Suite**. The server decides everything that involves money or stock; the browser can only read public data, read its own orders, and write its own cart, wishlist and feedback.

## Run it locally

```
npm run install:all        # once
npm run emulators          # Firestore, Auth, Functions (needs functions/.env.local and .secret.local, see below)
npm run seed               # in another terminal: products, delivery zones, a demo promo
npm test                   # all automated tests (needs Java for the emulator)
```

Settings live in `functions/.env.local` (not secret) and `functions/.secret.local` (secret). Both are git-ignored. `functions/.env.example` lists every setting. Only the Razorpay key is needed to start; the Excel (AWS) settings can stay empty.

## Deploying to production

The full launch checklist (Firebase, Vercel, Razorpay, AWS, rehearsal, rollback) is [../docs/GO_LIVE.md](../docs/GO_LIVE.md). The short version, from this folder, after `firebase use --add` has created a `production` alias and the settings file and secrets exist:

```
npm run preflight            # refuses to continue on a wrong or half-finished setup
npm run deploy:rules         # Firestore rules and indexes
npm run deploy:functions     # Cloud Functions
```

`npm run deploy:production` runs all three in that order. Razorpay stays in **test mode** until `RAZORPAY_MODE=live` is set together with a `rzp_live_` key (a mismatch is refused).

## Functions

| Function | Kind | Who or what calls it | What it does |
|---|---|---|---|
| `createCheckout` | callable | customer | Prices the saved cart on the server, checks stock, creates the Razorpay order |
| `verifyPayment` | callable | customer's browser | Checks Razorpay's signature, then creates the order and takes the stock |
| `razorpayWebhook` | HTTP | Razorpay | Same as `verifyPayment`, for customers whose browser never called back |
| `updateOrderStatus` | callable | staff | Moves an order one step forward |
| `cancelOrder` | callable | staff | Cancels an order and starts the refund process; returns stock if not packed |
| `processRefund` | callable | staff | Records that a refund was made (does not send money yet) |
| `excelSync` | Firestore create | automatic | Adds each new order as a row in the Excel workbook |
| `excelSyncUpdate` | Firestore update | automatic | Keeps that row's status in step as the order changes |
| `retryExcelSync` | callable | staff (dashboard button) | Re-sends Excel rows and updates that failed |
| `getOrdersDownloadUrl` | callable | staff (dashboard button) | Signs a 15-minute link to download the orders workbook from S3; logs who asked |
| `devGrantStaff` | callable | emulator only | Makes your test account staff; not deployed |

## Data

Browsers may read or write only what `firestore.rules` allows: `products`, `deliveryZones` (read), `carts`, `wishlists` (own), `orders` (read own), `feedback` (create for own delivered order). Everything else is server-only: `checkouts`, `promoCodes`, `paymentEvents` (webhook ledger) and `excelSync` (Excel ledger).

## Staff

Staff are users whose sign-in token has the `staff` claim. Give it with `npm run set-admin -- <uid>` (see the top of `scripts/setAdmin.js`). The staff dashboard is `/admin/orders` in the web app.

## Excel sync (Amazon S3)

- **Set it up once:** [docs/AWS_SETUP.md](docs/AWS_SETUP.md)
- **How it works, and what to do when AWS is down:** [docs/EXCEL_SYNC.md](docs/EXCEL_SYNC.md)

The short version of the retry process: if AWS was unreachable, some rows or status changes did not reach the spreadsheet (`orders/orders.xlsx` in S3). Orders are never affected. A staff member opens `/admin/orders` and presses **Retry Excel sync** at the bottom. It adds missing rows and fixes stale ones. It is safe to press at any time and never adds an order twice, because each order's ID is checked in the sheet first.

## Tests

| Command | What it covers |
|---|---|
| `npm run test:rules` | Security rules: who can read or write what |
| `npm run test:payments` | Payment confirmation, the webhook, stock races |
| `npm run test:orders` | Moving, cancelling and refunding orders |
| `npm run test:unit` | The S3 workbook layer, the download link, the deployment preflight and the Razorpay mode guard (no emulator or Java needed) |
| `npm run test:excel` | Excel rows, updates, retries, formula protection (with the Firestore emulator) |
