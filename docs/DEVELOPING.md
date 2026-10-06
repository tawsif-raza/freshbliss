# Developing FreshBliss

How to run the shop on your own computer and check a change before it is committed. Nothing here touches real Firebase, Razorpay, AWS or Vercel: everything runs against the local Firebase emulators. For launching with real accounts see `docs/GO_LIVE.md`; for how the pieces fit together see `FreshBliss_Master_Architecture.md`.

## What you need
- **Node 22 or newer** (the functions are deployed on Node 22).
- **Java 21 or newer**, only for the emulator-based backend tests (the Firestore emulator is a Java program).
- Nothing else: no Firebase, Razorpay or AWS account.

## First time
From the repository root:

```
npm install                          # the one-command launcher (concurrently, wait-on)
npm --prefix web install
npm --prefix firebase run install:all   # firebase/ and firebase/functions/
```

Then create the two local settings files (both are git-ignored, so they are never committed):

1. `firebase/functions/.env.local`: copy `firebase/functions/.env.example` next to it and keep the test values (`RAZORPAY_KEY_ID=rzp_test_...`, `RAZORPAY_MODE=test`). The Excel (AWS) settings can stay empty: the sync then does nothing.
2. `firebase/functions/.secret.local`: one `KEY=value` per line. The emulator needs a fake `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` to start; any text will do. Add `ERASURE_HASH_KEY=` with any long random text if you want to try "Delete my data".

`web/` needs no settings file in development: in `next dev` it talks to the emulators on its own (project `demo-freshbliss`).

## Run the shop locally
From the repository root:

```
npm run dev
```

This starts, together: the Firebase emulators (Firestore 8080, Auth 9099, Functions 5001, emulator console at http://localhost:4000), the seed (products, delivery zones, a demo promo code), and the storefront at **http://localhost:3000**. Stop everything with Ctrl+C.

What to know while it runs:
- **Checkout does not use Razorpay locally.** The Pay button calls `createMockOrder`, an emulator-only function that writes a real order priced by the real code, with status `PREPARING` and payment `PAID_MOCK` (no stock taken). It can never run in production.
- **Becoming staff** (to open `/admin/orders`): open `/admin/orders` and press **Enable dev staff mode** (it calls `devGrantStaff`, emulator only), or run `npm run set-admin -- <uid>` in `firebase/` (see the top of `firebase/scripts/setAdmin.js`).
- **Reset the data** by stopping and starting `npm run dev` (the emulator forgets everything, and the seed runs again). `npm run seed` in `firebase/` re-seeds a running emulator, which also resets stock.
- The product pages are built on the server from Firestore, so they show the seeded boxes only once the seed has finished (a few seconds after start).

## Checks before you commit
Run every one that your change could affect; CI (`.github/workflows/ci.yml`) runs them all on every pull request and on every push to `main`.

| What | Command | Needs |
|---|---|---|
| Storefront tests | `cd web; npm test` | Node |
| Storefront lint | `cd web; npx eslint .` | Node |
| Storefront production build | `cd web; npm run build` (see the note below) | Node, and `NEXT_PUBLIC_FIREBASE_*` set to anything |
| Backend, everything | `cd firebase; npm test` | Java |
| Backend, no emulator | `cd firebase; npm run test:unit` | Node |
| Money-path rehearsal (35 checks against the emulators) | `cd firebase; npm run rehearsal` | Java, `functions/.env.local` and `.secret.local` |

`npm run build` overwrites the `.next` folder that `next dev` is using, so stop the dev server first (or build in a copy of the folder).

For any change that alters a screen, also look at it: in the running shop at desktop width and in a 390 px wide phone frame, with the browser console open for errors.

## Which settings file does what
| File | Holds | Committed? |
|---|---|---|
| `web/.env.example` | The list of public settings the storefront reads (`NEXT_PUBLIC_*`) | yes |
| `web/.env.local` | Your own values for those, only to run against a real Firebase project | no |
| `firebase/functions/.env.example` | The list of function settings | yes |
| `firebase/functions/.env.local` | Function settings for the emulator | no |
| `firebase/functions/.secret.local` | Secrets for the emulator | no |
| `firebase/functions/.env.<alias>` (for example `.env.production`) | Function settings for a real deployment | no |
| Google Secret Manager | The four real secrets (`firebase functions:secrets:set`) | never |

Never commit a `.env.local`, `.secret.local` or anything that looks like a key. Razorpay secrets live only in `firebase/functions` and must never be added to `web/`.

## Where the code lives
- `web/pages/`: the pages; `web/components/`: the pieces they are built from; `web/lib/`: pure logic (pricing, slots, zones, sorting), each with a test in `web/tests/`; `web/content/`: every word a customer reads (business details, policies, the home page copy).
- `tokens.json` (repository root) is the one source of colours and type; `web/styles/tokens.css` is generated from it (`npm run tokens`, run automatically before `dev` and `build`).
- `firebase/functions/`: one file per Cloud Function, with shared logic in `shared/`; `firebase/firestore.rules`: who can read or write what; `firebase/tests/`: their tests; `firebase/scripts/`: seed, preflight, alerts, rehearsal.
- `docs/`: `OPERATING_FRAMEWORK.md` (how work is run), `ROADMAP.md` (what is next), `FEATURE_AUDIT.md` (what is done and open), `GO_LIVE.md` (launch checklist).

## Rules that are easy to break
- **The server decides.** Prices, stock, order status and anything involving money are never taken from the browser.
- **Customer copy states only what the code does.** If behaviour changes, change the words (privacy, terms, refunds, FAQ) in the same commit.
- **Facts kept in two places have a test that fails if they drift** (delivery slots, the free-delivery amount, the Excel columns in `firebase/docs/AWS_SETUP.md`, which doc paths exist). When you must repeat a fact, add such a test.
- **Design rules:** no emoji, controls at least 44 px tall, motion stops for visitors who ask for less (the root `README.md` is the design brief).
- **Next.js here is newer than most documentation.** Read the guide in `web/node_modules/next/dist/docs/` before using an API you are not sure about (`web/AGENTS.md`).
