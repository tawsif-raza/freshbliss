# FreshBliss go-live checklist

Deploying the Firebase backend (`firebase/`) and the Vercel storefront (`web/`) to production, with real money. Work top to bottom. **Do not skip a box.** A box is done only when you have seen the result, not when you have typed the command.

Commands are for the project root unless a `cd` says otherwise. PowerShell and bash differ only where marked.

> **What has been tested, and what has not.** Everything below was checked against this repository: the automated tests (`cd firebase; npm test` runs the rules, payments, orders, refunds, erasure and Excel suites against the Firebase emulator, and `cd web; npm test` runs the storefront suite), the preflight script, the Razorpay mode guard, a production build of the storefront, and `web/vercel.json` against Vercel's published schema. **Nothing has been run against a real Firebase, Razorpay, AWS or Vercel account.** The first real deployment is the first real test, which is why section 9 is a rehearsal in *test* mode before any real money moves.

## Contents

1. [Before you start](#1-before-you-start)
2. [Firebase project](#2-firebase-project-one-time-console-work)
3. [Firebase: settings, secrets, deploy](#3-firebase-settings-secrets-and-deploy)
4. [Environment variables, in one place](#4-environment-variables-in-one-place)
5. [Vercel](#5-vercel)
6. [Razorpay](#6-razorpay)
7. [Excel sync (AWS S3)](#7-excel-sync-aws-s3)
8. [Catalogue and staff](#8-catalogue-and-staff)
9. [Rehearsal in test mode](#9-rehearsal-in-test-mode)
10. [Switching to live](#10-switching-to-live)
11. [Launch day, and the first hour](#11-launch-day-and-the-first-hour) (with [11.1 error alerts](#111-error-alerts-do-this-before-launch-day))
12. [Rolling back](#12-rolling-back)
13. [Known gaps](#13-known-gaps-read-before-launch)

---

## 1. Before you start

- [ ] **Firebase project on the Blaze (pay-as-you-go) plan.** Cloud Functions, Secret Manager and outbound calls to Razorpay and AWS all need it. Set a **budget alert** (Google Cloud Console → Billing → Budgets) so a surprise shows up in your inbox.
- [ ] **Razorpay account with live mode activated** (KYC approved). Test mode and live mode have *separate* keys and *separate* webhooks. You can rehearse everything in test mode first, but you cannot take real money until Razorpay activates the account.
- [ ] **AWS account** (for the orders spreadsheet) with the bucket and user from [firebase/docs/AWS_SETUP.md](../firebase/docs/AWS_SETUP.md). There is no Azure or Microsoft 365 in this project any more.
- [ ] **Vercel account** with the repository connected.
- [ ] **Your domain**, and access to its DNS. Lower the DNS TTL to 300 seconds a day before launch so a mistake can be undone quickly.
- [ ] **Tools on your computer:** Node 22 or newer, the Firebase CLI (`npm install -g firebase-tools`), and `gcloud` (only for section 8).
- [ ] **A clean tree on the right branch:** `git status` shows nothing to commit, you are on `main`, and the tests pass: `cd firebase; npm run test:unit` (and `npm test` with Java installed).

---

## 2. Firebase project (one-time console work)

In the [Firebase console](https://console.firebase.google.com):

- [ ] **Create a project** for production. Write its **project ID** here: `____________________`. (Below it is written as `<project-id>`.) Use a *different* project for any staging, never the same one.
- [ ] **Firestore Database → Create database** in **Native mode**, location **`asia-south1` (Mumbai)**, start in **production mode**. The functions run in Mumbai and Firestore triggers must be in the same region as the database. **The location cannot be changed later.**
- [ ] **Authentication → Get started → Sign-in method → enable `Anonymous`.** Shoppers are signed in anonymously; without this nobody can use the cart or check out.
- [ ] **Also enable `Google`, `Microsoft` and `Phone`** (the three ways to sign in on `/login`; a button for a provider that is switched off simply fails). Google needs only a support email. **Microsoft needs an app registration** in Microsoft Entra (Azure) to get a client ID and secret; if you do not want to set that up, ask for the Microsoft button to be removed from `web/pages/login.js` instead of leaving a button that fails. **Phone sends real SMS**, which needs the Blaze plan; under Authentication → Settings → **SMS region policy**, allow India (`IN`). Phone sign-in also uses an invisible reCAPTCHA, so your production domain must be in **Authorized domains** (next box).
- [ ] **Authentication → Settings → Authorized domains:** add your production domain (and `www.` if you use it).
- [ ] **Project settings → Your apps → Add app → Web.** Register it and copy the four values the storefront needs (section 4): `apiKey`, `authDomain`, `projectId`, `appId`.
- [ ] *Recommended:* **restrict the browser API key** (Google Cloud Console → APIs & Services → Credentials → "Browser key (auto created by Firebase)" → Application restrictions → **Websites**): `https://your-domain.com/*`, `https://<project-id>.firebaseapp.com/*`. The key is public by design, but restricting it stops other sites borrowing your quota.
- [ ] *Recommended:* **turn on point-in-time recovery** so an accidental delete can be undone for 7 days (needs Blaze):
  `gcloud firestore databases update --database="(default)" --enable-pitr --project <project-id>`

---

## 3. Firebase: settings, secrets and deploy

All commands here run in `firebase/`:

```
cd firebase
```

### 3.1 Log in and point an alias at the real project

`.firebaserc` only knows the local demo project. The deploy scripts use an alias called **`production`**.

```
firebase login
firebase use --add
```

- [ ] Choose your real project, and when asked for an alias, type **`production`**. Check: `.firebaserc` now has `"production": "<project-id>"`. **Do not remove the `default` demo entry**; the emulator and local scripts use it.

### 3.2 The non-secret settings file

- [ ] Create **`firebase/functions/.env.production`** (Firebase reads `.env.<alias>` or `.env.<project-id>` when you deploy). Start from `functions/.env.example`:

  ```
  # Razorpay. For the rehearsal in section 9 use your TEST key and RAZORPAY_MODE=test.
  RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxxx
  RAZORPAY_MODE=test

  # App Check (section 5.5). Leave "false" until the reCAPTCHA key is in place, then "true".
  # Preflight REFUSES to deploy with RAZORPAY_MODE=live while this is false.
  ENFORCE_APP_CHECK=false

  # Excel sync (AWS S3). See firebase/docs/AWS_SETUP.md. Leave the bucket empty to switch the sync off.
  EXCEL_S3_BUCKET=your-bucket-name
  EXCEL_AWS_REGION=ap-south-1
  EXCEL_AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXXXXX
  ```

  - [ ] It contains **no secrets**. (`RAZORPAY_KEY_ID` is public: the browser receives it at checkout.) It is *not* git-ignored, so you may commit it. Never put a secret in it; the preflight refuses if you do.
  - [ ] **Do not** set `EXCEL_S3_ENDPOINT` here. It is only for a local S3 look-alike.
  - [ ] `functions/.env.local` is for the emulator and is **ignored** by `firebase deploy`. Do not rely on it.

### 3.3 The secrets

Secrets live in Google Secret Manager, never in a file and never in git. Each command asks you to paste the value (it is not echoed and not stored in your shell history):

```
firebase functions:secrets:set RAZORPAY_KEY_SECRET --project production
firebase functions:secrets:set RAZORPAY_WEBHOOK_SECRET --project production
firebase functions:secrets:set EXCEL_AWS_SECRET_ACCESS_KEY --project production
firebase functions:secrets:set ERASURE_HASH_KEY --project production
```

| Secret | Where the value comes from |
|---|---|
| `RAZORPAY_KEY_SECRET` | Razorpay dashboard → Account & Settings → API keys → Key Secret (test key for now) |
| `RAZORPAY_WEBHOOK_SECRET` | **You invent it**: a long random string (for example `openssl rand -hex 32`, or a password manager). You paste the *same* value into the Razorpay webhook form in section 6 |
| `EXCEL_AWS_SECRET_ACCESS_KEY` | AWS: the IAM user's secret access key, step 2.4 of [AWS_SETUP.md](../firebase/docs/AWS_SETUP.md). Skip it only if `EXCEL_S3_BUCKET` is empty |
| `ERASURE_HASH_KEY` | **You invent it**: a long random string (`openssl rand -hex 32`). The "Delete my data" button uses it to replace a customer's account id with a code nobody can work backwards from (`firebase/functions/shared/erasure.js`). **The button refuses to run without it.** Keep it somewhere safe and do not change it casually: erasures done before and after a change cannot be matched to each other (nothing breaks, but you lose that audit link) |

- [ ] All of them exist (the Excel one only if you use Excel). Check (this prints the secret's *name and versions*, never its value): `firebase functions:secrets:get RAZORPAY_KEY_SECRET --project production`, and the same for the others. `npm run preflight` asks for `ERASURE_HASH_KEY` too.
- [ ] If a secret ever leaks: set a new value with the same command (that creates a new version), redeploy the functions (3.5), then disable the old version in the console.

> The old Azure secret (`GRAPH_CLIENT_SECRET`) is gone. If a previous deploy created it, you can delete it: `firebase functions:secrets:destroy GRAPH_CLIENT_SECRET --project production`.

### 3.4 Preflight

- [ ] Run **`npm run preflight`**. It reads `.firebaserc`, the settings file and (by name only) the secrets, and refuses to continue (`FAIL`, exit code 1) on:
  - the alias missing, or a `demo-` project;
  - a Razorpay key that does not match `RAZORPAY_MODE` (a live key with mode `test`, or the reverse);
  - `RAZORPAY_MODE=live` while `ENFORCE_APP_CHECK` is off (it only warns in test mode);
  - `EXCEL_S3_ENDPOINT` set, a secret in the settings file, or half-filled AWS settings.

  It prints `WARN` for things that are allowed but worth knowing (still in test mode, Excel sync off, a secret it could not confirm). **Read every WARN.** Fix every FAIL before going on.

### 3.5 Deploy, in this order

The order matters for a launch with no downtime: **database rules and indexes first, then functions, then the website** (section 5). Each step is complete and verified before the next begins.

```
npm run deploy:rules        # firestore:rules + firestore:indexes only
npm run deploy:functions    # Cloud Functions only
```

(`npm run deploy:production` runs preflight and both in order.) These use `--only`, so **no emulator, no hosting, no extensions** are touched, and `firebase.json`'s emulator settings are ignored by deploy.

- [ ] **Rules deployed.** Console → Firestore → Rules shows today's date. Check that a signed-out visitor cannot read anything private: in the console's Rules playground, a read of `orders/anything` unauthenticated is **denied**.
- [ ] **Indexes deployed.** There is **one** composite index, for the customer's "My orders" page (`orders`: `uid` ascending, `createdAt` descending; see `firebase/firestore.indexes.json`). It is deployed by `npm run deploy:rules`, and it takes a few minutes to build: Console → Firestore → Indexes must show it as **Enabled** before you open `/account`, or the page will say it could not load orders. Every other query in the app is single-field or equality-only and needs none. If you ever add a query that filters on one field and sorts on another, add its index to that file *before* the code that needs it, because the emulator does not enforce indexes and production does.
- [ ] **Functions deployed.** The terminal ends with `Deploy complete!`. Run `firebase functions:list --project production`: every row must show location **`asia-south1`** (Mumbai), none `us-central1`. (The code guarantees this twice: each function names the region, and `functions/index.js` sets it as the default for any function added later. `tests/regions.test.js` fails if one ever drifts.) Console → Functions lists: `createCheckout`, `previewCheckout`, `verifyPayment`, `razorpayWebhook`, `updateOrderStatus`, `cancelOrder`, `cancelMyOrder`, `processRefund`, `autoRefund`, `lowStock`, `claimGuestOrders`, `requestDataErasure`, `excelSync`, `excelSyncUpdate`, `retryExcelSync`, `getOrdersDownloadUrl`. **`devGrantStaff` and `createMockOrder` must NOT be there** (they are emulator-only).
- [ ] **The TTL policy on rate-limit counters is in place.** `npm run deploy:rules` also deploys it (`rateLimits.expiresAt` in `firestore.indexes.json`); Console → Firestore → Indexes → **TTL** (or "Time-to-live") should list `rateLimits`. Without it old counters are simply never deleted: harmless, but they accumulate.
- [ ] **Copy the webhook URL** printed as `Function URL (razorpayWebhook(asia-south1))`, or from Console → Functions → `razorpayWebhook` → Trigger. You need it in section 6.
- [ ] If the CLI asks about **cleanup policy for container images**, answer yes (for example keep 1 day) so old builds do not accrue storage cost.

**If the first functions deploy fails** with a permission message about Eventarc, Pub/Sub or a "service agent": that is a known first-deploy delay while Google creates internal permissions. Wait 3 to 5 minutes and run `npm run deploy:functions` again. It is safe to repeat.

---

## 4. Environment variables, in one place

There are **three** places settings live. Putting one in the wrong place is the commonest launch mistake.

### 4.1 Vercel dashboard (the storefront). Project → Settings → Environment Variables

The first four are **required** (the build fails without them). The last two are optional, and all six are **public by design** (the browser needs them), so none is a secret.

| ☐ | Variable | Value | Environments |
|---|---|---|---|
| ☐ | `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase console → Project settings → Your apps → Web app → `apiKey` | Production, Preview |
| ☐ | `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `<project-id>.firebaseapp.com` | Production, Preview |
| ☐ | `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `<project-id>` | Production, Preview |
| ☐ | `NEXT_PUBLIC_FIREBASE_APP_ID` | `1:…:web:…` from the same screen | Production, Preview |
| ☐ | `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | The reCAPTCHA v3 **site** key from section 5.5. Optional until `ENFORCE_APP_CHECK=true`; **required before it** | Production, Preview |
| ☐ | `NEXT_PUBLIC_SITE_URL` | `https://your-domain.com`, no trailing slash. Used for canonical links, share cards, `sitemap.xml` and `robots.txt`. Optional: on Vercel it falls back to the project's production domain, so set it only for a custom domain Vercel does not know about | Production |

- [ ] **The four required variables are set for Production *and* Preview.** The build **fails** without them (the app refuses to start with an incomplete Firebase config), so a missing one shows up as a red build, not a broken live site.
- [ ] Leave the **Development** environment empty. Local development uses the emulators and needs no variables.
- [ ] **These are baked into the build.** If you change one, you must **redeploy** (Deployments → ⋯ → Redeploy); the running site does not pick it up.
- [ ] **Previews and your data.** A Preview deployment built with the production values reads and writes **production** data. Either (a) create a separate staging Firebase project (alias `staging`) and give Preview *its* four values, or (b) turn on **Deployment Protection → Vercel Authentication** for Preview so only your team can open them. Do at least (b).

**The Razorpay public key is not a Vercel variable.** The browser never reads it from the environment: the `createCheckout` function sends it with every checkout (`quote.keyId`), straight from `RAZORPAY_KEY_ID` in section 4.2. Adding a `NEXT_PUBLIC_RAZORPAY_…` variable would do nothing.

**Not needed by anything the storefront does today** (they are accepted but optional, and nothing breaks without them): `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `…MESSAGING_SENDER_ID`. `…MEASUREMENT_ID` is not read at all.

**Must NEVER be set in Vercel** (they would be exposed or are wrong there):

| ✗ | Variable | Why |
|---|---|---|
| ☐ | `NEXT_PUBLIC_USE_FIREBASE_EMULATORS`, `NEXT_PUBLIC_EMULATOR_HOST` | Emulator switches. Ignored in a production build, but their presence means someone copied a local file. |
| ☐ | `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Server secrets. They belong in Secret Manager only. |
| ☐ | `AWS_…`, `EXCEL_…` | The storefront never talks to AWS. |
| ☐ | `GOOGLE_APPLICATION_CREDENTIALS`, any service-account JSON | Gives full admin access to your Firebase project. |

### 4.2 Firebase non-secret settings. `firebase/functions/.env.production`

| ☐ | Variable | Value | Notes |
|---|---|---|---|
| ☐ | `RAZORPAY_KEY_ID` | `rzp_test_…` now, `rzp_live_…` at go-live | Public. Must match `RAZORPAY_MODE`. **Required: there is no default.** |
| ☐ | `RAZORPAY_MODE` | `test` now, `live` at go-live | Default `test`. A key that does not match is refused at checkout and by preflight. |
| ☐ | `ENFORCE_APP_CHECK` | `false` until section 5.5 is done, then `true` | Default `false`. Turning it on before the reCAPTCHA key is live locks every customer out. **Must be `true` for `RAZORPAY_MODE=live`** (preflight refuses otherwise) |
| ☐ | `LOW_STOCK_THRESHOLD` | leave unset (5) | A box that falls to this many left (or fewer) raises one low-stock warning, and another when it hits zero (section 11.1). A value that is not a whole number of 1 or more is ignored and 5 is used |
| ☐ | `AUTO_REFUNDS` | leave unset (on) | Default `true`: a cancelled order's refund is sent to Razorpay by itself. Set `false` to stop all automatic refunds (staff then press **Refund via Razorpay** on each card). |
| ☐ | `EXCEL_S3_BUCKET` | your bucket name | Empty = Excel sync and the download button switched off |
| ☐ | `EXCEL_AWS_ACCESS_KEY_ID` | the IAM user's access key ID | Required if the bucket is set |
| ☐ | `EXCEL_AWS_REGION` | `ap-south-1` | Default; set only if the bucket is elsewhere |
| ☐ | `EXCEL_S3_KEY` | `orders/orders.xlsx` | Default; change only with the IAM policy |
| ✗ | `EXCEL_S3_ENDPOINT` | **leave unset** | Local testing only |

### 4.3 Firebase secrets. Secret Manager (`firebase functions:secrets:set`)

| ☐ | Secret | Used by |
|---|---|---|
| ☐ | `RAZORPAY_KEY_SECRET` | `createCheckout`, `verifyPayment`, `processRefund`, `autoRefund` (refunds need the secret) |
| ☐ | `RAZORPAY_WEBHOOK_SECRET` | `razorpayWebhook` |
| ☐ | `EXCEL_AWS_SECRET_ACCESS_KEY` | `excelSync`, `excelSyncUpdate`, `retryExcelSync`, `getOrdersDownloadUrl`, `requestDataErasure` (it scrubs the customer's row) |
| ☐ | `ERASURE_HASH_KEY` | `requestDataErasure` (the "Delete my data" button) |

---

## 5. Vercel

### 5.1 Create the project

- [ ] Vercel → **Add New → Project** → import the repository.
- [ ] **Root Directory: `web`.** (The repository root holds both apps; the storefront is the `web` folder. `web/vercel.json` is only read when this is set.)
- [ ] **Framework Preset: Next.js** (it is also set in `vercel.json`).
- [ ] **Node.js Version: 22.x** (Project → Settings → General). `web/package.json` also says `>=22`.
- [ ] **Production Branch: `main`.**
- [ ] Add the four variables from 4.1, **then** deploy. (Deploying first fails the build.)
- [ ] The first build is green. Open the `*.vercel.app` URL: `/` goes to `/products` and shows the catalogue.

### 5.2 What `web/vercel.json` does

| Setting | Effect |
|---|---|
| `installCommand: npm ci` | Installs exactly what `package-lock.json` says, so production builds match your tests |
| `ignoreCommand` | Skips the build when a commit changed nothing under `web/`, so a backend-only commit does not redeploy the storefront. If a deployment you expected is shown as *skipped* (for example the very first one, which has no earlier commit to compare), run **Redeploy** by hand, or delete this line |
| Security headers | `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` (no camera, microphone or location), HSTS |
| `Content-Security-Policy` | **Enforced.** Lists what the site may load (itself, Razorpay checkout, Google/Firebase APIs and reCAPTCHA, Cloud Functions, OpenStreetMap for "Use Current Location") and **blocks** anything else. It was written from the code and has not been tried against live Razorpay and Firebase traffic, so section 5.4 is a required check, not an option |
| `X-Robots-Tag: noindex` | Keeps `/admin`, `/orders/…`, `/cart`, `/checkout`, `/account` and `/login` out of search results |

**Caching is deliberately left to Vercel's defaults, which are already the fast setup for this app.** The home page, `/products` and each product page are built on the server from the public product list (read over Firestore's open REST endpoint, no credentials) and **refreshed in the background every 10 to 60 seconds** (Next.js incremental regeneration), so a price or stock change in Firestore reaches search engines and share cards within about a minute; in the browser the live listener then takes over. Every other page is static HTML, and only `/robots.txt` and `/sitemap.xml` are rendered per request. Vercel serves the hashed files under `/_next/static/` with a one-year `immutable` cache. A custom `Cache-Control` could only make that worse (stale pages after a deploy), so there is none. Fonts are self-hosted by `next/font`, so there is no third-party font request.

### 5.3 Domain

- [ ] Project → Settings → Domains → add your domain, then add the DNS records Vercel shows. Wait until it says **Valid Configuration** and a certificate is issued.
- [ ] Add the domain to **Firebase → Authentication → Authorized domains** (section 2) if you have not.
- [ ] `https://your-domain.com/products` loads, and `http://` redirects to `https://`.

### 5.4 Check the Content Security Policy (during the rehearsal)

The policy is **enforced** (`Content-Security-Policy` in `web/vercel.json`). It was written from the code but never tried against live Razorpay, Google sign-in, phone sign-in or reCAPTCHA traffic, and a policy that is slightly wrong breaks exactly those flows. So the rehearsal in section 9 must walk through every one of them with the browser's developer tools **Console** open:

- [ ] Go through: browse, add to cart, **sign in with Google, Microsoft and phone**, **pay**, track an order, open `/admin/orders`. Look for lines beginning *"Refused to load…"* or *"Refused to connect…"* that name a host.
- [ ] If there are none, you are done.
- [ ] If there are some, add each blocked host to the matching directive in `web/vercel.json` (`script-src`, `connect-src`, `frame-src`…), deploy, and repeat the failed step. **If you would rather learn what is blocked without breaking anything first**, rename the header key to `Content-Security-Policy-Report-Only` for the rehearsal (the browser then only *reports* in the console), and rename it back before launch.

### 5.5 App Check (stops scripts calling your checkout)

Anyone can create a free anonymous account, so without this a script could call `createCheckout` (which makes real Razorpay orders) or guess promo codes as fast as the rate limits allow. App Check makes the storefront prove to Firebase, with an invisible reCAPTCHA v3 check, that a request comes from your website. The functions refuse requests without that proof once `ENFORCE_APP_CHECK=true`. The code is in place (`firebase/functions/shared/hardening.js`, `web/lib/firebaseClient.js`); what remains is console work, **in this order** (turning enforcement on first locks every customer out):

- [ ] **Create the key.** [Google reCAPTCHA admin console](https://www.google.com/recaptcha/admin) → **Create** → type **Score based (v3)** → add your production domain (and the `*.vercel.app` domain if you use Preview). Copy the **Site key** (public) and the **Secret key**.
- [ ] **Register it with Firebase.** Firebase console → **App Check → Apps** → your web app → **reCAPTCHA v3** → paste the **Secret key** → Save. (Do **not** press *Enforce* for Firestore or Authentication in this screen: the storefront's server-side product read has no App Check token. Only the Cloud Functions enforce it, through the setting below.)
- [ ] **Give the storefront the site key.** In Vercel set `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` (4.1) for Production and Preview, then **redeploy** (it is baked into the build).
- [ ] **Check before enforcing.** Open the deployed site, do an order in test mode. Firebase console → App Check → **APIs / Metrics** shows requests as *Verified*. The browser console shows no `App Check` errors.
- [ ] **Enforce.** Set `ENFORCE_APP_CHECK=true` in `firebase/functions/.env.production` and `npm run deploy:functions`. Place a test order again. If checkout now fails with an "unauthenticated" style error, the key or the domain is wrong: set it back to `false`, redeploy, and fix the console steps above.
- [ ] **Try to cheat it.** From a terminal, call a function directly without a token (for example `curl -X POST https://asia-south1-<project-id>.cloudfunctions.net/previewCheckout -H "Content-Type: application/json" -d "{\"data\":{}}"`). It must be refused.
- [ ] **Local development and the emulator are unaffected** (the emulator never checks App Check). To test App Check from `next dev` against a real project, set `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=false`; the browser console prints a debug token to register under App Check → Apps → Manage debug tokens.

---

## 6. Razorpay

- [ ] **Webhook (test mode first).** Razorpay dashboard → make sure the switch at the top says **Test Mode** → Account & Settings → **Webhooks → Add New Webhook**:
  - **Webhook URL:** the `razorpayWebhook` URL you copied in 3.5.
  - **Secret:** the exact value you stored as `RAZORPAY_WEBHOOK_SECRET`.
  - **Active events:** tick **`order.paid`**, **`refund.created`**, **`refund.processed`** and **`refund.failed`**. These are the only ones the function handles; others are ignored. (`payment.authorized` is deliberately NOT used: it can fire for a payment that is never captured, so only `order.paid`, which means the money was taken, creates an order.)
- [ ] **Payment capture must be Automatic.** Razorpay dashboard → Account & Settings → **Payment Capture** → *Automatic*. The code cannot read this setting, so **check it by eye in both Test and Live mode**. With manual capture, the customer's browser reports success when the bank only *authorizes* the payment, the order is created, and Razorpay refunds the uncaptured payment a few days later. (If that ever happens the refund webhook sets `refundAlert` on the still-active order, so it is not silent, but it is a refund you did not choose.)
- [ ] The webhook exists so a customer who pays and then closes the browser still gets their order, and so refunds move from *Refund pending* to *Refunded* by themselves. Test both in section 9.
- [ ] **Live mode needs its own webhook** (section 10). Test-mode webhooks do not fire for live payments.

---

## 7. Excel sync (AWS S3)

- [ ] Follow [firebase/docs/AWS_SETUP.md](../firebase/docs/AWS_SETUP.md) for the **production** bucket: private (Block all public access **on**), **versioning on**, and an IAM user whose policy covers only that one file (and `s3:ListBucket`).
- [ ] The three values are in sections 3.2 and 3.3.
- [ ] **Add a lifecycle rule that expires old versions of the file** (S3 → the bucket → Management → Lifecycle rules → *Permanently delete noncurrent versions of objects* after **30 days**). Versioning keeps every saved copy of the sheet, and when a customer erases their data the *current* file is scrubbed but older versions still hold their name, phone and address until they expire. The privacy page promises this ("Your rights and erasing your data").
- [ ] After the first order: the file `orders/orders.xlsx` appears in the bucket, and on the staff dashboard **Download orders sheet** opens it.
- [ ] Staff know to work in a **downloaded copy** and never upload an edited file over the live one ([EXCEL_SYNC.md](../firebase/docs/EXCEL_SYNC.md)).

---

## 8. Catalogue and staff

### 8.1 Products, delivery zones and promo

`npm run seed -- --remote` adds the demo catalogue to the real database. It only **adds missing documents** and never overwrites, but **read what it adds first** ([firebase/scripts/seed.js](../firebase/scripts/seed.js)):

- [ ] It adds **5 products with demo prices and stock** (for example stock 25, 18, 4, 12 and **0**). The last, "Mango Season Box", is stock 0 on purpose, to show "Out of stock". **Edit the stock and prices in the Firestore console afterwards**, or edit `seed.js` first.
- [ ] It adds **2 delivery zones** for Bengaluru pincodes (`5600xx` free, other `560xxx` ₹30 but free from ₹499). Check they are your real zones.
- [ ] It adds a **demo promo code `WELCOME10` (10% off orders of ₹199 or more, one use per account; see section 8.1b)**. **That is live for any customer who guesses or is told it.** Delete `promoCodes/WELCOME10` in the console right after, unless you want it.

It needs Google credentials on your computer. Do this once, with your own Google account (no key file to keep or leak):

```
gcloud auth application-default login
```

Then, from `firebase/`, with your real project ID:

```
# PowerShell
$env:GCLOUD_PROJECT = "<project-id>"; $env:SEED_CONFIRM_PROJECT = "<project-id>"; npm run seed -- --remote

# bash
GCLOUD_PROJECT=<project-id> SEED_CONFIRM_PROJECT=<project-id> npm run seed -- --remote
```

- [ ] The first line says `Seeding REAL project "<project-id>" (add-only, nothing is overwritten)` (not "the emulator"), and it lists what it wrote.
- [ ] In the Firestore console, `products` has your products with correct price and stock, and `promoCodes/WELCOME10` is deleted or intentional.
- [ ] Open the live site: the products show.

(The script refuses to run against a real project without `--remote`, a non-`demo-` ID and the `SEED_CONFIRM_PROJECT` variable. That is deliberate. Close the PowerShell window afterwards, or `Remove-Item Env:SEED_CONFIRM_PROJECT`.)

### 8.1b Promo codes: fields and limits

A promo code is a document in the Firestore collection `promoCodes`, whose **document id is the code** (uppercase letters, digits, `-` and `_`, up to 32). Customers cannot read or write it. Create and edit codes in the console.

| Field | Meaning |
|---|---|
| `type` | `percent` (value 1 to 100) or `flat` (rupees) |
| `value` | the amount |
| `min` | smallest cart subtotal in rupees; `0` = none |
| `active` | `false` switches the code off |
| `expiresAt` | a Timestamp, or `null` |
| `globalMaxUses` | **most orders that may ever use the code, across all customers.** Leave out (or `null`) for no limit. `0` means used up |
| `maxUsesPerUser` | **most orders one account may place with the code.** `1` = a welcome code. Leave out for no limit |
| `requiresSignIn` | `true` = guests (anonymous accounts) are asked to sign in first. **Set this on every code that has `maxUsesPerUser`**: a guest account is lost when browser data is cleared, so without it a determined guest can reuse a "once only" code |
| `usedCount` | kept by the server. **Never edit it** (set it to `0` when you create a code). Raising `globalMaxUses` is how you extend a code; do not reset `usedCount` |

- [ ] A limit must be a whole number, `0` or more. **A typo such as `"10"` (text) or `-1` makes the code REFUSED**, never unlimited. If a code suddenly says "not valid", check its fields first.
- [ ] How it behaves: a customer who has used up a code is told straight away ("You have already used the code WELCOME10." / "This promo code has reached its usage limit."). A use is counted when the order is **confirmed**, in the same transaction that takes the stock, so two people racing for the last use cannot both get it. The loser is cancelled automatically and **refunded in full** (it shows in **Needs refund** with the reason `Promo code limit: …`, and `autoRefund` sends the money back), and keeps their cart. Orders that fail or are abandoned before payment use nothing.
- [ ] Per-customer counts are in `promoCodes/<CODE>/uses/<uid>` (`count`, `orderIds`, `lastUsedAt`): that is where to look to see who used a code.
- [ ] A cancelled order does **not** give the use back (the customer can order again, but the code stays used). If you want to give a use back, lower that customer's `count` by hand.

### 8.2 Staff access

- [ ] Open the live site `/admin/orders` while signed in (it signs you in anonymously). It says **Staff only** and shows an **Account ID**. That is your user ID.
- [ ] From `firebase/`:
  ```
  # PowerShell
  $env:GCLOUD_PROJECT = "<project-id>"; $env:ADMIN_CONFIRM_PROJECT = "<project-id>"; npm run set-admin -- <account-id> --remote
  ```
  (bash: put the two variables before `npm run` as in 8.1.)
- [ ] Back on `/admin/orders`, press **Check again**. The dashboard opens.
- [ ] **Staff accounts are anonymous browser sessions.** If a staff member clears their browser data or uses another browser, they get a *new* ID and must be granted again. Plan for who the staff are before launch. Until real sign-in exists, give the role only to browsers you control.

### 8.3 Storefront content (words, photos, business details)

The home page, product pages and receipts show wording and figures the business is held to. Nothing here is code; each is a small edit. **A customer reading it will believe it, so check each is true.**

- [ ] **The claims in [web/content/storefront.js](../web/content/storefront.js):** "1-Hour Delivery in Bengaluru", "Fresh & Hygienic", "Zero Preservatives", the hero text, **the three Farm-to-Table pillars ("Handpicked Daily", "Zero Preservatives", "Chilled Delivery") and the sentence under each**, and every FAQ answer. Change anything that is not true of how you actually work. (The delivery-zone answer fills itself in from your live zones.)
- [ ] **The ticker under the banner and the "Our Roots" story** (`MARQUEE_ITEMS` and `OUR_ROOTS` in the same file). Every line is a public promise: "100% Organic & Pesticide-Free", "Free Bengaluru Delivery over ₹499" (the seed data now gives Zone B `freeDeliveryFrom: 499`, and a test keeps it equal to `FREE_DELIVERY_THRESHOLD`; **but the seed only adds missing documents, so if your zones were created by an older seed, set `freeDeliveryFrom: 499` on Zone B in the Firestore console**, otherwise the cart bar says "free delivery" and checkout still charges ₹30), "Farm to Doorstep in 12 Hours", "4.9/5 Average Rating" (needs real reviews behind it), and the Karnataka and Maharashtra farmer partnerships. Edit or remove any that are not true.
- [ ] **The FAQ page** ([web/pages/faq.js](../web/pages/faq.js), at `/faq`). Its answers are promises, and some differ from the rest of the site: delivery "60 to 90 minutes" (the home page, hero and product pages say "within the hour"; the zones say 30 to 60 minutes), "orders of ₹499 or more qualify for free delivery, otherwise a flat ₹30" (now true for Zone B in the seed data; Zone A is free at any amount), "certified organic farms" (do you hold the certificates?), "report it via the My Orders page within 12 hours" (the orders page has no report button yet), and "instantly refund the missing item" (refunds are staff-triggered today). Make the page, the home-page FAQ in `content/storefront.js` and the real behaviour agree, and make sure `support@freshbliss.in` (`supportEmail` in `content/business.js`) exists.
- [ ] **FSSAI number, Terms and Cancellation & Refunds pages.** Fill `fssai` in [web/content/business.js](../web/content/business.js) (shown on the receipt and footer only when filled; a food business must display it). Read `/terms` and `/refunds` ([web/content/policies.js](../web/content/policies.js)) with an advisor: they describe what the system does today (customer can cancel until packed; refund goes to the original payment method after staff issue it) and deliberately promise **no refund timeline**. Add one only when the business commits to it, and make the FAQ say the same.
- [ ] **Delivery slots.** Windows are defined in two files that must match: `firebase/functions/shared/slots.js` and `web/lib/slots.js` (a test fails if they drift). Check the 9 am to 9 pm windows and the 90-minute lead time suit your kitchen.
- [ ] **Reviews.** The "What customers say" section is **hidden in production until you add real reviews** to `TESTIMONIALS` in the same file (with the customer's permission). The three entries in it are placeholders, shown only while developing and labelled as samples. **Never add invented reviews.**
- [ ] **"Use Current Location" on the checkout page** (`web/lib/geocode.js`). It sends the visitor's coordinates, only when they press the button, to the free OpenStreetMap Nominatim service, which allows light use only (about one request per press, and no bulk or automated use; see its usage policy). If order volume grows, switch to a paid geocoder or host Nominatim yourself. `web/vercel.json` was changed to allow it (`Permissions-Policy: geolocation=(self)`, which was `()` and would have blocked location completely, and `nominatim.openstreetmap.org` in the Content Security Policy). The privacy page has a new "Your location" section: have it reviewed with the rest.
- [ ] **The Chilled & Dairy range** (ice cream, A2 milk, cold-pressed juice, chilled watermelon bowl: `buildProducts()` in `firebase/scripts/seed.js`). The storage badges ("Keep Frozen at -18°C", "Keep Refrigerated below 4°C") are promises about how the product is kept AND delivered, so only sell them if you really have a cold chain (insulated, chilled or frozen delivery bags and cold storage); a 1-hour delivery of frozen ice cream without one will arrive melted. Also check the suppliers, origins, calorie figures and benefit claims ("A2", "cold-pressed, never from concentrate"), and the licences that apply to dairy, ice cream and packaged juice (FSSAI). The ice cream photo (a placeholder, with sprinkles) and the orange juice photo should be replaced with photos of the real products.
- [ ] **Product Specifications** (the accordion on every product page: `SPECS` in `firebase/scripts/seed.js`, fields `ingredientsText`, `allergens`, `nutrition`, `brandStory`, `shelfLife`). All of it is placeholder content written for the demo. The nutrition tables are TYPICAL REFERENCE VALUES averaged across the fruits in a box (the heading says "estimate"), not lab results: replace them with your supplier's or a lab's figures. Nutrition and allergen information on food is regulated (FSSAI labelling), and a wrong allergen note is a safety problem, not just a copy error: check the allergens (milk, nuts) and the ingredient lines against the real products and packaging. Check every sourcing story (the Gir cow free-grazing claim, the regions, "cold-pressed in small batches") and every shelf life (3 days for fruit boxes, 4 days for milk, 3 months frozen for ice cream) against what is true. The product page's default packaging text ("Freshly cut and packed hygienically...") is shown under the chilled products too; set a real `packaging` text on each of them.
- [ ] **Business details:** fill in [web/content/business.js](../web/content/business.js) (legal name, address, GSTIN, contact, **opening hours**). They appear on the receipt, in the footer and on the privacy page. Anything left empty is not shown: the footer has **no opening hours until you fill in `hours`**, because they are not guessed.
- [ ] **Privacy page ([web/content/privacy.js](../web/content/privacy.js), shown at `/privacy` and linked from the footer).** It describes what the shop's systems actually collect and where they keep it (anonymous account ID, address, order details, payment reference, Firebase in Mumbai, the private AWS spreadsheet, no analytics scripts). It is **not legal advice**: have it reviewed, and add what the code cannot show (how long records are kept, who the delivery partners are, a grievance contact). If you ever add an analytics tool or change a provider, change it at the same time.
- [ ] **Newsletter box in the footer is UI only.** It checks the address looks valid and says plainly that nothing is saved yet. Connect it to a real mailing service before launch, or remove the box from `components/Footer.js`.
- [ ] **Tax.** The receipt shows what the customer was charged (items, delivery, tip, discount) and **no tax line**, because an order does not store a tax breakdown. If the business is GST-registered and must issue tax invoices, that needs a decision with your accountant (tax-inclusive prices or not, which rate) and a change to what an order stores. Do not launch with the receipt called a tax invoice.
- [ ] **Product photos: replace the placeholders.** Until a product has its own photos, the site shows **stock fruit photos from Unsplash** (the home banner, the product cards, the cart and checkout thumbnails; chosen in [web/lib/images.js](../web/lib/images.js)). The product page says "Illustrative photo" under them, but customers will still expect the box to look like the picture. **Add up to 4 photos of the real boxes** to each product's `images` field in Firestore (they replace the placeholders for that product at once), and replace the two home-banner photos in `HERO_IMAGES`. The Ramadan box has no dates or pomegranate photo yet, so a mixed-fruit basket stands in for it. Unsplash photos are free to use and need no credit, but they are loaded from Unsplash's servers: fine for placeholders, not something to launch on.
- [ ] **Harvest & Health and packaging (optional).** A product's page shows a "Harvest & Health" row from three optional fields: `origin` (text, where it was grown), `calories` (text, for example "About 45 kcal per 100 g"; an older whole number is read as kcal per box) and `keyBenefits` (up to 6 short phrases). `nutritionNote` (for example "Per Regular box") shows under the calories, and `packaging` (short text) shows in the Packaging section. A product without any of them simply has no such section; the site never makes a figure up. **The four premium boxes in `firebase/scripts/seed.js` (Exotic Berry Medley, Citrus Immunity Shield, Midnight Mango Indulgence, The Keto Green Pack) carry placeholder origins, per-100 g calorie figures (standard reference values for the fruit, not measurements of your box) and benefits. Check each against your real suppliers and recipes, and fix them in Firestore, before launch.**
- [ ] **Categories.** The home page tabs are All, Fresh Boxes, Fitness Packs, Ramadan Specials and Combos. They match a product's `category` field (`Fresh`, `Fitness`, `Ramadan`, `Combos`). A tab with no products says so. Products in any other category (like `Seasonal`) appear under All only.

---

## 9. Rehearsal in test mode

Do this with `RAZORPAY_MODE=test` and your `rzp_test_` key, against the real production project, **before anyone but you has the link.** Razorpay's test cards and UPI ids are in their documentation.

- [ ] **Place an order** on the live site and pay with a test card. You land on the tracking page, and the order shows as paid.
- [ ] **Firestore:** `orders/<id>` exists with `paymentStatus: PAID` and the stock of the product has gone down by the quantity ordered.
- [ ] **Webhook:** Razorpay → Webhooks → your webhook → **Logs** shows `order.paid` delivered with a `200`. Then test the safety net: place another order, pay, and **close the tab at the Razorpay success screen before the page returns**. The order should still appear (the webhook created it).
- [ ] **Staff:** on `/admin/orders` the order is listed. Move it Preparing → Packed → Out for delivery → Delivered. The customer's tracking page changes **by itself**, without a reload.
- [ ] **Cancel and refund:** cancel a second order (as the customer, from the order page, and once as staff). Within a few seconds the order shows a Razorpay refund id (`rfnd_…`) in **Needs refund**, then, once Razorpay confirms (the `refund.processed` webhook, Webhooks → Logs shows it delivered with a `200`), the card leaves the list and the order is **Refunded**. In Razorpay → Payments the payment shows **one** refund for the full amount. If the card instead says **Refund failed**, read the reason, fix it, and press **Retry refund**. Also try **Check status** while it is waiting, and refund one by hand in the Razorpay dashboard instead: the next time you press Retry/Check, the order notices it and does not refund twice.
- [ ] **Sold-out race:** set a product's stock to 1 and try to buy it from two browsers at the same moment. At most one order is confirmed. If both reach the payment step, the later one is **cancelled automatically** and appears under **Needs refund** (the customer paid, so refund it). Stock never goes below zero. Put the stock back afterwards.
- [ ] **Excel:** `orders/orders.xlsx` has one row per order, and columns Q to S follow each status change (column P shows the delivery slot). **Download orders sheet** saves a file that opens in Excel.
- [ ] **Logs are quiet:** Firebase console → Functions → Logs. Filter by severity `ERROR`. There are none you do not understand. (A failed Excel copy logs an error with a hint and never affects the order.)
- [ ] **Browser console** (section 5.4): no unexpected CSP reports. Enforce the policy if you chose to.
- [ ] **Storefront, end to end** (the new screens were built and checked by tests and a production build, **but nobody has clicked through them in a browser yet**, so do it now): home page (flip Everyday Fresh / Ramadan Special, switch category tabs, add a box from a card with the size chips) → a product page (photos, size and price, quantity stops at stock, pincode estimate) → cart → **checkout**: type a pincode in each zone (the fee shows at once: free or ₹30), type one outside the area (a red "Outside delivery area" box, Pay stays off), apply a good promo code (the discount appears) and a bad one (a clear message), pick a tip, and check the total shown on the **Pay** button is the amount Razorpay asks for.
- [ ] **New interface touches:** the cart button in the header opens the **slide-out cart** (quantity, remove, subtotal, **Proceed to Checkout**; Esc and a click outside close it; the page behind does not scroll). Adding a box (from a card, a product page or the "Add something with it" row) and **Reorder** each show a **toast** that slides in at the top, with a **View cart** button. The header gets a shadow when you scroll. The footer's category links open the home page on that tab. Try each on a phone-width window too.
- [ ] **Account page:** after an order, `/account` lists it, newest first; **Reorder** puts the same boxes in the cart; and the **Firestore index is Enabled** (section 3.5).
- [ ] **Receipt:** on `/orders/<id>` press **View receipt**, then **Print / Save as PDF**. The preview shows only the receipt (no header, no buttons), with a masked payment reference. Check the printed total.
- [ ] **Phone check:** the whole flow works on a real phone on mobile data, not just your laptop. On Android Chrome, menu → **Install app** (or **Add to Home screen**) shows the green "F" icon and opens the shop full screen; on an iPhone use Share → **Add to Home Screen**. The icon is a placeholder letter (`web/public/icons/`, made by `web/scripts/build-icons.mjs`): swap in the real logo before launch.
- [ ] **Consent and erasure (DPDP).** On `/login` every sign-in button is off until you tick the consent box (it starts unticked). As a test customer with a paid, **delivered or cancelled** order, open `/account` → **Delete my data…**, type `DELETE`: you land on "Your data has been erased", the account is gone from Authentication, and in Firestore the order shows `uid: erased_…` and `address: [REDACTED - DPDP ERASURE]` with the **same total, items, status and Razorpay payment id**; the matching row in `orders.xlsx` shows the marker in the Customer, Phone, Address and Note cells. The refund (`refunds/…`) is untouched, and `erasureLog/erased_…` says `COMPLETED`. Try it **while an order is still on the way**: it is refused with a clear message and nothing changes. Press it with the wrong word: the red button stays off.
- [ ] **Delete the test orders** from Firestore so the real orders and the Excel sheet start clean (delete the `orders/…`, matching `excelSync/…`, `checkouts/…` and `paymentEvents/…` documents, and delete `orders/orders.xlsx` from the bucket: the next real order creates a fresh one).

---

## 10. Switching to live

Do this while **no customer has the link**: for a moment the key, the mode and the webhook disagree, and checkout refuses to run during that moment.

- [ ] **Razorpay → switch to Live Mode.** Settings → API keys → generate the **live** key. Copy the Key Id (`rzp_live_…`) and Key Secret.
- [ ] Update `firebase/functions/.env.production`: `RAZORPAY_KEY_ID=rzp_live_…` and `RAZORPAY_MODE=live`.
- [ ] Store the live secret (this creates a new version, which the next deploy picks up):
  `firebase functions:secrets:set RAZORPAY_KEY_SECRET --project production`
- [ ] **Live webhook.** In Razorpay **Live Mode** → Webhooks → Add the same URL, a secret, and the same four events (`order.paid`, `refund.created`, `refund.processed`, `refund.failed`), and check **Payment Capture** is Automatic in Live mode too. If you choose a *new* webhook secret, store it: `firebase functions:secrets:set RAZORPAY_WEBHOOK_SECRET --project production`.
- [ ] `cd firebase; npm run preflight`. It must say **Razorpay mode: live** and have no FAIL and no "NOT be charged" warning.
- [ ] `npm run deploy:functions`.
- [ ] **Take one real payment** of the smallest amount you can (a ₹1 or cheapest box, to your own card or UPI). Follow it through every step of section 9, then **cancel it in the shop** (the refund is sent by itself) and confirm the money returns to your card or UPI.
- [ ] Delete that test order (and its Excel row's record) as in the last box of section 9.

---

## 11. Launch day, and the first hour

- [ ] **Order of events:** rules and functions are already deployed and rehearsed (sections 3, 9, 10). The storefront is the *last* thing that becomes public. Until the domain points at it, nobody can order.
- [ ] Point the domain at Vercel (5.3), or share the link.
- [ ] **Watch live:** Firebase Functions logs (severity `ERROR`), Razorpay → Transactions, and the staff dashboard. Keep all three open for the first hour.
- [ ] **Place the first real order yourself**, as a customer, on a phone.
- [ ] Someone is **physically responsible for refunds** and knows they are done by hand in Razorpay (section 13).
- [ ] You know where the rollback steps are (section 12).

### 11.1 Error and low-stock alerts (do this before launch day)

Errors are otherwise only in the logs, which nobody reads until something is already wrong. One command creates an email channel and **two** Google Cloud Monitoring alerts: **FreshBliss: Cloud Function errors** emails you when any Cloud Function logs at severity `ERROR`, and **FreshBliss: Low stock** emails you when a box is running out (below). The functions log at `ERROR` only for things that matter (a failed Razorpay order, a webhook that does not match its checkout, a refused Razorpay key, a failed refund, a failed Excel copy, a rate limiter that stopped counting), never for a customer's typo. It sends at most **one email per hour** while errors continue and closes itself after a quiet day.

- [ ] Install `gcloud` and sign in with an account allowed to edit alerting policies: `gcloud auth login`.
- [ ] From `firebase/`, preview first, then create: `npm run setup-alerts -- --email you@example.com --dry-run`, then `npm run setup-alerts -- --email you@example.com`. It is safe to run again (it reuses the channel and updates the policy in place). Use an address you read on your phone.
- [ ] **Confirm the email address** if Google sends a verification message to it.
- [ ] **Send a test.** Console → Monitoring → Alerting → **Edit notification channels** → *FreshBliss alerts (email)* → **Send test notification**, and check the email arrives (and is not in spam). Also open the policy **FreshBliss: Cloud Function errors** and check it is *enabled*. There is no harmless way to make a real function log an `ERROR` (a wrong webhook signature, for example, is only a warning and does not alert), so the policy itself first fires on the first real error: keep the logs open during the rehearsal in section 9.
- [ ] The email's text says what to do next (check the Razorpay dashboard first; an Excel error is not urgent).
- [ ] **Low stock.** The `lowStock` function watches every product change and writes one warning when a box first falls to 5 left (`LOW_STOCK_THRESHOLD`) and one when it reaches 0. It is a *warning*, kept apart from the error alert, so a restock reminder never looks like a failure. Like the error alert it sends at most **one email per hour**, so several boxes emptying in one evening arrive as one email, and the logs list each box (the email gives the query). **Restock by editing the product's `stock` in the Firestore console**; neither the storefront nor the staff dashboard can change stock. In the rehearsal (section 9), buy a box down to the threshold and check the email; an alert is raised again only after stock has gone back above the threshold. It tells you about a product only while it is `active`, and says nothing for a brand-new product or a restock.

---

## 12. Rolling back

| What went wrong | What to do | How long |
|---|---|---|
| **A bad storefront deploy** | Vercel → Deployments → the last good deployment → **⋯ → Promote to Production** (or "Instant Rollback"). Nothing is rebuilt | seconds |
| **A bad functions deploy** | `git checkout <last-good-commit> -- firebase/functions` then `cd firebase; npm run deploy:functions`, then `git checkout HEAD -- firebase/functions` to restore your tree | a few minutes |
| **Bad security rules** | Firebase console → Firestore → Rules → **history** → pick the previous version → publish. Or revert `firestore.rules` and `npm run deploy:rules` | a minute |
| **A wrong secret** | `firebase functions:secrets:set NAME --project production` with the right value, then `npm run deploy:functions`. (Old versions stay in Secret Manager until destroyed) | a few minutes |
| **Payments misbehaving, need to stop selling at once** | Fastest: in Firestore set every product's `active` to `false` (the storefront lists only active products), or in `.env.production` set `RAZORPAY_MODE=test` and deploy functions (checkout then refuses live keys). Pause the live webhook in Razorpay only if it is delivering something wrong | a minute |
| **Deleted data** | Firestore point-in-time recovery (section 2), within 7 days | |

**Never** roll back by deleting Firestore data or by deploying with `--force`.

---

## 13. Known gaps (read before launch)

These are true of the code today. None blocks launch, but each is a decision you should make knowingly.

- **Refunds are automatic, but only as good as the webhook.** Cancelling an order sends a full refund to Razorpay at once (`autoRefund`), and the refund is stored with its Razorpay id. The order only changes from *Refund pending* to *Refunded* when Razorpay's `refund.processed` webhook arrives; if the webhook is not set up (section 6) the card stays in **Needs refund** and staff press **Check status** to catch up. There is no scheduled job that polls Razorpay. **The refund code has been tested against a fake Razorpay, never the real one**: the rehearsal in section 9 is its first real test.
- **Partial refunds exist in the server but not on the admin page.** `processRefund` accepts an `amount` (rupees) and a delivered order then ends *Partly refunded*, but there is no screen for it yet; there is also no customer-facing "return an item" flow. Until then, a partial refund is made in the Razorpay dashboard and the webhook records it.
- **Promo limits count accounts, not people.** `maxUsesPerUser` is per account (uid). A guest who clears their browser data becomes a new account and can use a "once only" code again, which is why `requiresSignIn` exists (section 8.1b); even then someone can make a second Google account. For a code that costs real money, also set `globalMaxUses`. A customer who pays twice at the same moment with a one-use code gets one order and one automatic refund.
- **Erasing data: what it cannot reach.** "Delete my data" overwrites the personal fields of a customer's orders and deletes their account, cart and wishlist, but keeps paid orders, refunds and payment records for the accounts (with the address and notes replaced and the link to the person cut). It does **not** reach Razorpay's own record of the payment, Google's backups and logs, or **old versions of the Excel file in S3** unless you added the lifecycle rule in section 7. It waits while an order is still on the way, or a payment may be in progress. It does not ask the customer to sign in again first (they type DELETE), and a deleted account's sign-in token can keep working for up to an hour, so a scripted caller could still create a cart or an order under the deleted account's id in that window; it would belong to an account that no longer exists, and the customer could not erase it (they can contact you). A customer who erases their account and signs up again gets a fresh account, so a "once only" promo code can be used again (the same gap as "Promo limits count accounts", below). Consent is a tick-box on the sign-in screen; it is **not stored** per customer, so you cannot yet show *when* a given customer agreed. Add that if your adviser says you must prove it.
- **Customers can sign in; staff are still granted by hand.** Guests keep their orders in the browser, and signing in on `/login` keeps them across devices. A staff member who clears their browser data must be granted staff again (section 8.2). "Customer" in Excel shows `Guest` for an anonymous session and the phone column is blank.
- **App Check is built but off until you switch it on.** Anyone can create anonymous accounts and carts against your project. The server re-prices and re-checks everything and the rules block direct writes, so the exposure is nuisance and cost, not data or money, and preflight refuses a live deploy with it off. It still needs the console work in section 5.5, and it has not been run against real Firebase.
- **Rate limits are per account and per network address.** `previewCheckout`, `createCheckout`, `cancelMyOrder`, `claimGuestOrders` and `requestDataErasure` are limited, and wrong promo codes have a tighter limit of their own (`firebase/functions/shared/rateLimit.js`). Many people behind one shared address (an office, a mobile carrier's gateway) share the address limit, so the limits are deliberately generous. If the counter itself fails, the request is allowed and an `ERROR` is logged rather than blocking a customer from paying. Promo codes give the same answer for a wrong, switched-off or expired code, so the limits and App Check, not secrecy, are what stops guessing.
- **No tax invoice.** Receipts show amounts charged, with no tax breakdown (section 8.3).
- **Alerting is one email address.** Section 11.1 emails you on any function `ERROR`, at most once an hour. There is no pager, no on-call rotation and no alert for "the site is down" or "no orders for hours"; add an uptime check in Google Cloud Monitoring if you want one.
- **The Excel copy is a copy.** If AWS is down, orders still work and the staff **Retry Excel sync** button catches up afterwards ([EXCEL_SYNC.md](../firebase/docs/EXCEL_SYNC.md)). Charts and pivot tables in the live file are lost on the next save; work in a downloaded copy.
- **One region.** Functions and Firestore are in Mumbai. A regional Google outage stops ordering; there is no failover.
- **The Content Security Policy is enforced but untested against live traffic** (5.4). A wrong entry would block Razorpay or a sign-in popup, so walk through every flow in the rehearsal.
- **The seed data is demo data** (8.1).
- **Nothing here has run against real accounts yet** (the note at the top). The rehearsal in section 9 is where that is proven.
