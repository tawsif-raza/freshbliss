# FreshBliss go-live checklist

Deploying the Firebase backend (`firebase/`) and the Vercel storefront (`web/`) to production, with real money. Work top to bottom. **Do not skip a box.** A box is done only when you have seen the result, not when you have typed the command.

Commands are for the project root unless a `cd` says otherwise. PowerShell and bash differ only where marked.

> **What has been tested, and what has not.** Everything below was checked against this repository: the unit tests (101 in `firebase/`, 21 in `web/`), the preflight script, the Razorpay mode guard, and `web/vercel.json` against Vercel's published schema. **Nothing has been run against a real Firebase, Razorpay, AWS or Vercel account.** The first real deployment is the first real test, which is why section 9 is a rehearsal in *test* mode before any real money moves.

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
11. [Launch day, and the first hour](#11-launch-day-and-the-first-hour)
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
```

| Secret | Where the value comes from |
|---|---|
| `RAZORPAY_KEY_SECRET` | Razorpay dashboard → Account & Settings → API keys → Key Secret (test key for now) |
| `RAZORPAY_WEBHOOK_SECRET` | **You invent it**: a long random string (for example `openssl rand -hex 32`, or a password manager). You paste the *same* value into the Razorpay webhook form in section 6 |
| `EXCEL_AWS_SECRET_ACCESS_KEY` | AWS: the IAM user's secret access key, step 2.4 of [AWS_SETUP.md](../firebase/docs/AWS_SETUP.md). Skip it only if `EXCEL_S3_BUCKET` is empty |

- [ ] All three exist. Check (this prints the secret's *name and versions*, never its value): `firebase functions:secrets:get RAZORPAY_KEY_SECRET --project production`, and the same for the other two.
- [ ] If a secret ever leaks: set a new value with the same command (that creates a new version), redeploy the functions (3.5), then disable the old version in the console.

> The old Azure secret (`GRAPH_CLIENT_SECRET`) is gone. If a previous deploy created it, you can delete it: `firebase functions:secrets:destroy GRAPH_CLIENT_SECRET --project production`.

### 3.4 Preflight

- [ ] Run **`npm run preflight`**. It reads `.firebaserc`, the settings file and (by name only) the secrets, and refuses to continue (`FAIL`, exit code 1) on:
  - the alias missing, or a `demo-` project;
  - a Razorpay key that does not match `RAZORPAY_MODE` (a live key with mode `test`, or the reverse);
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
- [ ] **Functions deployed.** The terminal ends with `Deploy complete!`. Run `firebase functions:list --project production`: every row must show location **`asia-south1`** (Mumbai), none `us-central1`. (The code guarantees this twice: each function names the region, and `functions/index.js` sets it as the default for any function added later. `tests/regions.test.js` fails if one ever drifts.) Console → Functions lists: `createCheckout`, `previewCheckout`, `verifyPayment`, `razorpayWebhook`, `updateOrderStatus`, `cancelOrder`, `processRefund`, `excelSync`, `excelSyncUpdate`, `retryExcelSync`, `getOrdersDownloadUrl`. **`devGrantStaff` must NOT be there** (it is emulator-only).
- [ ] **Copy the webhook URL** printed as `Function URL (razorpayWebhook(asia-south1))`, or from Console → Functions → `razorpayWebhook` → Trigger. You need it in section 6.
- [ ] If the CLI asks about **cleanup policy for container images**, answer yes (for example keep 1 day) so old builds do not accrue storage cost.

**If the first functions deploy fails** with a permission message about Eventarc, Pub/Sub or a "service agent": that is a known first-deploy delay while Google creates internal permissions. Wait 3 to 5 minutes and run `npm run deploy:functions` again. It is safe to repeat.

---

## 4. Environment variables, in one place

There are **three** places settings live. Putting one in the wrong place is the commonest launch mistake.

### 4.1 Vercel dashboard (the storefront). Project → Settings → Environment Variables

These four, and **only** these four, are read by the web app. They are **public by design** (the browser needs them), so none is a secret.

| ☐ | Variable | Value | Environments |
|---|---|---|---|
| ☐ | `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase console → Project settings → Your apps → Web app → `apiKey` | Production, Preview |
| ☐ | `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `<project-id>.firebaseapp.com` | Production, Preview |
| ☐ | `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `<project-id>` | Production, Preview |
| ☐ | `NEXT_PUBLIC_FIREBASE_APP_ID` | `1:…:web:…` from the same screen | Production, Preview |

- [ ] **All four are set for Production *and* Preview.** The build **fails** without them (the app refuses to start with an incomplete Firebase config), so a missing one shows up as a red build, not a broken live site.
- [ ] Leave the **Development** environment empty. Local development uses the emulators and needs no variables.
- [ ] **These are baked into the build.** If you change one, you must **redeploy** (Deployments → ⋯ → Redeploy); the running site does not pick it up.
- [ ] **Previews and your data.** A Preview deployment built with the production values reads and writes **production** data. Either (a) create a separate staging Firebase project (alias `staging`) and give Preview *its* four values, or (b) turn on **Deployment Protection → Vercel Authentication** for Preview so only your team can open them. Do at least (b).

**The Razorpay public key is not a Vercel variable.** The browser never reads it from the environment: the `createCheckout` function sends it with every checkout (`quote.keyId`), straight from `RAZORPAY_KEY_ID` in section 4.2. Adding a `NEXT_PUBLIC_RAZORPAY_…` variable would do nothing.

**Not read by the code, so do not bother adding them:** `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `…MESSAGING_SENDER_ID`, `…MEASUREMENT_ID`.

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
| ☐ | `EXCEL_S3_BUCKET` | your bucket name | Empty = Excel sync and the download button switched off |
| ☐ | `EXCEL_AWS_ACCESS_KEY_ID` | the IAM user's access key ID | Required if the bucket is set |
| ☐ | `EXCEL_AWS_REGION` | `ap-south-1` | Default; set only if the bucket is elsewhere |
| ☐ | `EXCEL_S3_KEY` | `orders/orders.xlsx` | Default; change only with the IAM policy |
| ✗ | `EXCEL_S3_ENDPOINT` | **leave unset** | Local testing only |

### 4.3 Firebase secrets. Secret Manager (`firebase functions:secrets:set`)

| ☐ | Secret | Used by |
|---|---|---|
| ☐ | `RAZORPAY_KEY_SECRET` | `createCheckout`, `verifyPayment` |
| ☐ | `RAZORPAY_WEBHOOK_SECRET` | `razorpayWebhook` |
| ☐ | `EXCEL_AWS_SECRET_ACCESS_KEY` | `excelSync`, `excelSyncUpdate`, `retryExcelSync`, `getOrdersDownloadUrl` |

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
| `Content-Security-Policy-Report-Only` | Lists what the site may load (itself, Razorpay checkout, Google/Firebase APIs, Cloud Functions) and **reports** anything else in the browser console without blocking it. See 5.4 |
| `X-Robots-Tag: noindex` | Keeps `/admin`, `/orders/…` and `/cart` out of search results |

**Caching is deliberately left to Vercel's defaults, which are already the fast setup for this app.** Every page is static HTML (there is no server-side rendering or API route; the shop data comes from Firestore in the browser). Vercel serves those pages from its edge network, purges them on each deployment, and serves the hashed files under `/_next/static/` with a one-year `immutable` cache. A custom `Cache-Control` could only make that worse (stale pages after a deploy), so there is none. Fonts are self-hosted by `next/font`, so there is no third-party font request.

### 5.3 Domain

- [ ] Project → Settings → Domains → add your domain, then add the DNS records Vercel shows. Wait until it says **Valid Configuration** and a certificate is issued.
- [ ] Add the domain to **Firebase → Authentication → Authorized domains** (section 2) if you have not.
- [ ] `https://your-domain.com/products` loads, and `http://` redirects to `https://`.

### 5.4 Turn the Content Security Policy on (after the rehearsal)

The policy is shipped in **report-only** mode on purpose. It was written from the code but not tested against live Razorpay and Firebase traffic, and an enforced policy that is slightly wrong would break checkout on launch day.

- [ ] During section 9, open the browser developer tools **Console** on the deployed site and go through: browse, add to cart, sign in, **pay**, track an order, open `/admin/orders`. Look for lines beginning *"[Report Only] Refused to…"*.
- [ ] If there are none, change the header name in `web/vercel.json` from `Content-Security-Policy-Report-Only` to `Content-Security-Policy`, deploy, and **run the payment test again**.
- [ ] If there are some, add each blocked host to the matching directive (`script-src`, `connect-src`, `frame-src`…), deploy, and repeat.

---

## 6. Razorpay

- [ ] **Webhook (test mode first).** Razorpay dashboard → make sure the switch at the top says **Test Mode** → Account & Settings → **Webhooks → Add New Webhook**:
  - **Webhook URL:** the `razorpayWebhook` URL you copied in 3.5.
  - **Secret:** the exact value you stored as `RAZORPAY_WEBHOOK_SECRET`.
  - **Active events:** tick **`order.paid`** and **`payment.authorized`**. These are the only two the function handles; others are ignored.
- [ ] The webhook exists so a customer who pays and then closes the browser still gets their order. Test it in section 9.
- [ ] **Live mode needs its own webhook** (section 10). Test-mode webhooks do not fire for live payments.

---

## 7. Excel sync (AWS S3)

- [ ] Follow [firebase/docs/AWS_SETUP.md](../firebase/docs/AWS_SETUP.md) for the **production** bucket: private (Block all public access **on**), **versioning on**, and an IAM user whose policy covers only that one file (and `s3:ListBucket`).
- [ ] The three values are in sections 3.2 and 3.3.
- [ ] After the first order: the file `orders/orders.xlsx` appears in the bucket, and on the staff dashboard **Download orders sheet** opens it.
- [ ] Staff know to work in a **downloaded copy** and never upload an edited file over the live one ([EXCEL_SYNC.md](../firebase/docs/EXCEL_SYNC.md)).

---

## 8. Catalogue and staff

### 8.1 Products, delivery zones and promo

`npm run seed -- --remote` adds the demo catalogue to the real database. It only **adds missing documents** and never overwrites, but **read what it adds first** ([firebase/scripts/seed.js](../firebase/scripts/seed.js)):

- [ ] It adds **5 products with demo prices and stock** (for example stock 25, 18, 4, 12 and **0**). The last, "Mango Season Box", is stock 0 on purpose, to show "Out of stock". **Edit the stock and prices in the Firestore console afterwards**, or edit `seed.js` first.
- [ ] It adds **2 delivery zones** for Bengaluru pincodes (`5600xx` free, other `560xxx` ₹30). Check they are your real zones.
- [ ] It adds a **demo promo code `WELCOME10` (10% off orders of ₹199 or more)**. **That is live for any customer who guesses or is told it.** Delete `promoCodes/WELCOME10` in the console right after, unless you want it.

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
- [ ] **The ticker under the banner and the "Our Roots" story** (`MARQUEE_ITEMS` and `OUR_ROOTS` in the same file). Every line is a public promise: "100% Organic & Pesticide-Free", "Free Bengaluru Delivery over ₹500" (in the seed data Zone B charges ₹30 and `freeDeliveryFrom` is empty, so set `freeDeliveryFrom: 500` on the zones in Firestore to make this true), "Farm to Doorstep in 12 Hours", "4.9/5 Average Rating" (needs real reviews behind it), and the Karnataka and Maharashtra farmer partnerships. Edit or remove any that are not true.
- [ ] **Reviews.** The "What customers say" section is **hidden in production until you add real reviews** to `TESTIMONIALS` in the same file (with the customer's permission). The three entries in it are placeholders, shown only while developing and labelled as samples. **Never add invented reviews.**
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
- [ ] **Cancel and refund:** cancel a second order. It moves to **Needs refund**. Press Process Refund. Remember: **this records the refund, it does not send money.** Refund it in the Razorpay dashboard first.
- [ ] **Sold-out race:** set a product's stock to 1 and try to buy it from two browsers at the same moment. At most one order is confirmed. If both reach the payment step, the later one is **cancelled automatically** and appears under **Needs refund** (the customer paid, so refund it). Stock never goes below zero. Put the stock back afterwards.
- [ ] **Excel:** `orders/orders.xlsx` has one row per order, and columns P to R follow each status change. **Download orders sheet** saves a file that opens in Excel.
- [ ] **Logs are quiet:** Firebase console → Functions → Logs. Filter by severity `ERROR`. There are none you do not understand. (A failed Excel copy logs an error with a hint and never affects the order.)
- [ ] **Browser console** (section 5.4): no unexpected CSP reports. Enforce the policy if you chose to.
- [ ] **Storefront, end to end** (the new screens were built and checked by tests and a production build, **but nobody has clicked through them in a browser yet**, so do it now): home page (flip Everyday Fresh / Ramadan Special, switch category tabs, add a box from a card with the size chips) → a product page (photos, size and price, quantity stops at stock, pincode estimate) → cart → **checkout**: type a pincode in each zone (the fee shows at once: free or ₹30), type one outside the area (a red "Outside delivery area" box, Pay stays off), apply a good promo code (the discount appears) and a bad one (a clear message), pick a tip, and check the total shown on the **Pay** button is the amount Razorpay asks for.
- [ ] **New interface touches:** the cart button in the header opens the **slide-out cart** (quantity, remove, subtotal, **Proceed to Checkout**; Esc and a click outside close it; the page behind does not scroll). Adding a box (from a card, a product page or the "Add something with it" row) and **Reorder** each show a **toast** that slides in at the top, with a **View cart** button. The header gets a shadow when you scroll. The footer's category links open the home page on that tab. Try each on a phone-width window too.
- [ ] **Account page:** after an order, `/account` lists it, newest first; **Reorder** puts the same boxes in the cart; and the **Firestore index is Enabled** (section 3.5).
- [ ] **Receipt:** on `/orders/<id>` press **View receipt**, then **Print / Save as PDF**. The preview shows only the receipt (no header, no buttons), with a masked payment reference. Check the printed total.
- [ ] **Phone check:** the whole flow works on a real phone on mobile data, not just your laptop.
- [ ] **Delete the test orders** from Firestore so the real orders and the Excel sheet start clean (delete the `orders/…`, matching `excelSync/…`, `checkouts/…` and `paymentEvents/…` documents, and delete `orders/orders.xlsx` from the bucket: the next real order creates a fresh one).

---

## 10. Switching to live

Do this while **no customer has the link**: for a moment the key, the mode and the webhook disagree, and checkout refuses to run during that moment.

- [ ] **Razorpay → switch to Live Mode.** Settings → API keys → generate the **live** key. Copy the Key Id (`rzp_live_…`) and Key Secret.
- [ ] Update `firebase/functions/.env.production`: `RAZORPAY_KEY_ID=rzp_live_…` and `RAZORPAY_MODE=live`.
- [ ] Store the live secret (this creates a new version, which the next deploy picks up):
  `firebase functions:secrets:set RAZORPAY_KEY_SECRET --project production`
- [ ] **Live webhook.** In Razorpay **Live Mode** → Webhooks → Add the same URL, a secret, and the same two events (`order.paid`, `payment.authorized`). If you choose a *new* webhook secret, store it: `firebase functions:secrets:set RAZORPAY_WEBHOOK_SECRET --project production`.
- [ ] `cd firebase; npm run preflight`. It must say **Razorpay mode: live** and have no FAIL and no "NOT be charged" warning.
- [ ] `npm run deploy:functions`.
- [ ] **Take one real payment** of the smallest amount you can (a ₹1 or cheapest box, to your own card or UPI). Follow it through every step of section 9, then **refund it** in the Razorpay dashboard, and confirm the money returns.
- [ ] Delete that test order (and its Excel row's record) as in the last box of section 9.

---

## 11. Launch day, and the first hour

- [ ] **Order of events:** rules and functions are already deployed and rehearsed (sections 3, 9, 10). The storefront is the *last* thing that becomes public. Until the domain points at it, nobody can order.
- [ ] Point the domain at Vercel (5.3), or share the link.
- [ ] **Watch live:** Firebase Functions logs (severity `ERROR`), Razorpay → Transactions, and the staff dashboard. Keep all three open for the first hour.
- [ ] **Place the first real order yourself**, as a customer, on a phone.
- [ ] Someone is **physically responsible for refunds** and knows they are done by hand in Razorpay (section 13).
- [ ] You know where the rollback steps are (section 12).

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

- **Refunds are manual.** `processRefund` only *records* that a refund was made. Money is returned by a person, in the Razorpay dashboard. There is no automatic refund and no check that one happened.
- **Staff and customers are anonymous sessions.** There is no phone or email login. A customer who clears their browser data loses access to their orders, including the tracking link, because both are tied to that browser's session. A staff member who does so must be granted staff again (section 8.2). "Customer" in Excel shows `Guest` and the phone column is blank for the same reason.
- **No App Check.** Anyone can create anonymous accounts and carts against your project. The server re-prices and re-checks everything and the rules block direct writes, so the exposure is nuisance and cost, not data or money. Add [App Check](https://firebase.google.com/docs/app-check) when you have steady traffic.
- **The price preview has no rate limit.** `previewCheckout` (the checkout page's live total and promo check) answers any signed-in visitor, and anonymous accounts are free to create, so someone could try many promo codes. It gives the same answer for a wrong, switched-off or expired code, so it does not reveal which codes exist, and `createCheckout` has had the same exposure. If promo codes are ever worth more than a few percent, add App Check and a per-user limit.
- **No tax invoice.** Receipts show amounts charged, with no tax breakdown (section 8.3).
- **No alerting.** Errors are only in the logs. Create a log-based alert (Google Cloud → Logging → Alerts) for severity `ERROR` on the Functions, so a failure reaches your phone instead of waiting for you to look.
- **The Excel copy is a copy.** If AWS is down, orders still work and the staff **Retry Excel sync** button catches up afterwards ([EXCEL_SYNC.md](../firebase/docs/EXCEL_SYNC.md)). Charts and pivot tables in the live file are lost on the next save; work in a downloaded copy.
- **One region.** Functions and Firestore are in Mumbai. A regional Google outage stops ordering; there is no failover.
- **The Content Security Policy is report-only until you enforce it** (5.4).
- **The seed data is demo data** (8.1).
- **Nothing here has run against real accounts yet** (the note at the top). The rehearsal in section 9 is where that is proven.
