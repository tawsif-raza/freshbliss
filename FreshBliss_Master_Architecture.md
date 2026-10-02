## Chapter 5: API & Deployment Infrastructure

### 5.1 Cloud Environment Variables & Secrets
To ensure strict security, FreshBliss isolates public configuration from private server operations.
*   **Next.js Frontend (Vercel):** Requires only the four public `NEXT_PUBLIC_FIREBASE_*` values (`API_KEY`, `AUTH_DOMAIN`, `PROJECT_ID`, `APP_ID`). There is no Razorpay variable in Vercel: the public Razorpay key id is served to the browser by the `createCheckout` Cloud Function with each checkout quote, so the storefront never reads it from its environment.
*   **Firebase Backend (Cloud Functions):** Private keys are stored in Google Cloud Secret Manager (via `firebase functions:secrets:set`): `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` and `EXCEL_AWS_SECRET_ACCESS_KEY`. Non-secret settings (`RAZORPAY_KEY_ID`, `RAZORPAY_MODE`, `EXCEL_S3_BUCKET`, `EXCEL_AWS_ACCESS_KEY_ID`, `EXCEL_AWS_REGION`, `EXCEL_S3_KEY`) live in `functions/.env.<project>`. `RAZORPAY_MODE` (`test` or `live`) must agree with the key id prefix (`rzp_test_` / `rzp_live_`) or checkout refuses to run, so real money can only be taken by a deliberate switch. See `docs/GO_LIVE.md`.

### 5.2 Hosting & Edge Deployment
*   **Frontend Distribution:** Deployed on Vercel, as a Next.js **Pages Router** app (`web/`, Root Directory `web`). Every page is pre-rendered static HTML served from Vercel's edge network and purged on each deployment, with hashed assets under `/_next/static/` cached as immutable; there is no server-side rendering and no API route. Live data (products, the cart, orders) is read from Firestore in the browser, and routes with a parameter (like `/orders/[id]`) render a shell and fill it client-side. `web/vercel.json` adds security headers, a report-only Content Security Policy and `noindex` for private routes, and deliberately sets no `Cache-Control` override.
*   **Backend Execution:** Cloud Functions are deployed strictly to the `asia-south1` (Mumbai) region to ensure ultra-low latency for the primary Bengaluru delivery market.

---

## Chapter 6: The Phased Execution Roadmap

The FreshBliss codebase was successfully engineered through a strict, five-phase progression model to ensure stability and prevent architectural overlap.

### Phase 1: Frontend Foundation & Design System
*   **Objective:** Establish the visual brand and component library.
*   **Execution:** Built the Tailwind CSS design system using the exact brand tokens (Cream `#f5f1e9`, Deep Green `#173f2a`, Gold `#c99b3b`). Developed static UI screens with mock data, including the Ramadan theme toggle system and Framer Motion animations.

### Phase 2: Database Schema & Security Architecture
*   **Objective:** Lock down the data layer before connecting the UI.
*   **Execution:** Defined the Firestore schemas (`products`, `orders`, `carts`, `deliveryZones`). Wrote the `firestore.rules` enforcing a default-deny policy and public read-only access for products. Validated by automated security-rule tests using the Firebase Local Emulator Suite.

### Phase 3: The Checkout Loop & Payment Integration
*   **Objective:** Handle money securely and prevent inventory race conditions.
*   **Execution:** Built the Razorpay integration. Engineered the `createCheckout` and `verifyPayment` Cloud Functions. Implemented the server-side webhook to act as a fallback, utilizing a strict Firestore Transaction to ensure stock is decremented exactly once.

### Phase 4: Real-Time Fulfillment & Logistics
*   **Objective:** Enable live tracking for customers and operational control for staff.
*   **Execution:** Built the customer-facing `/orders/[id]` page using `onSnapshot` for instant UI updates. Secured the `/admin/orders` operations dashboard using a Firebase Custom Claim (`staff: true`), including a dedicated "Needs Refund" queue for stock-out cancellations.

### Phase 5: Business Operations Sync (The Excel Bridge)
*   **Objective:** Give the business a reporting spreadsheet without putting load on, or risk to, the live database. Firestore stays the source of truth; the spreadsheet is a copy, and a failed copy never affects an order.
*   **Storage (AWS S3):** The workbook is one file, `orders/orders.xlsx`, in a private S3 bucket (Block Public Access on, versioning on so a damaged file can be restored, default encryption). The functions reach it with a dedicated IAM user whose policy allows only `s3:GetObject` and `s3:PutObject` on that one object plus `s3:ListBucket` on the bucket (without it S3 reports a missing file as "access denied"). Settings: `EXCEL_S3_BUCKET`, `EXCEL_S3_KEY`, `EXCEL_AWS_REGION`, `EXCEL_AWS_ACCESS_KEY_ID`; the secret key is the Secret Manager secret `EXCEL_AWS_SECRET_ACCESS_KEY`. Setup: `firebase/docs/AWS_SETUP.md`.
*   **The `excelSync` trigger (order created):** Turns each new order into one 18-column row (columns A to O are written once; the three "live" columns P to R are Payment status, Order status and Last updated). The `exceljs` library edits the workbook in memory. S3 cannot edit part of a file, so every change is read, change, write back; the write-back is **conditional on the file's ETag** (`If-Match`; `If-None-Match: *` for the very first file). If another function saved in between, S3 answers 412, and the change is redone from the new version (up to 30 times, with a short random pause), so concurrent orders never overwrite each other. Adding a row first looks for the order's ID in column A and does nothing if it is already there, so a retry after a lost reply can never create a duplicate row.
*   **The `excelSyncUpdate` trigger (order changed):** Runs only when `status` or `paymentStatus` changed. It finds the order's row by its ID (never by a stored row number, because staff may sort the sheet), rewrites only columns P to R, and does not save at all if they already show the right values. It re-reads the order after writing and writes again if it changed meanwhile, so overlapping updates always end on the latest status. An update that arrives before its row exists waits up to 30 seconds for it. A row that staff deleted on purpose is not added back; it is recorded as `ROW_MISSING`.
*   **Resilience:** One ledger document per order (`excelSync/{orderId}`, server-only) records `PENDING`, `DONE` or `FAILED`, and what the sheet was last told. Busy or unreachable AWS is retried 4 times (1s, 2s, 4s, or the `Retry-After` header, capped at 15s); wrong credentials, missing permission, a missing bucket or a damaged file fail at once with a plain-English hint in the log. A staff **Retry Excel sync** button (`retryExcelSync`) re-sends whatever failed and is safe to press at any time.
*   **Formula sanitization:** Customer text is untrusted. Any text cell that begins with `=`, `+`, `-` or `@` (or a tab or carriage return) is stored with a leading `'`, so it can never run as a spreadsheet formula, even if the sheet is later exported to CSV or pasted elsewhere. Money is written as real numbers so the sheet can add it up. In this file the apostrophe is visible at the start of the cell; that is expected.
*   **Staff download (`getOrdersDownloadUrl`):** A staff-only callable (it checks the `staff` custom claim) used by the **Download orders sheet** button on `/admin/orders`. It asks S3 for one byte first (so a missing file is reported immediately), then signs a **read-only link that expires after 15 minutes**, for that one object only, with `Content-Disposition: attachment` and a dated file name. Signing happens on the server with `@aws-sdk/s3-request-presigner`; the link carries the access key id and a signature, never the secret. Every download is logged with the staff member's uid. Staff open a downloaded copy and never upload an edited file over the live one.
*   **Known limits:** Each change rewrites the whole file (fine for tens of thousands of rows; archive old orders beyond that). Charts and pivot tables in the live file are lost on the next save, so reporting is done in a downloaded copy. Only status changes are copied after creation, and orders created before the sync was configured are not back-filled.
