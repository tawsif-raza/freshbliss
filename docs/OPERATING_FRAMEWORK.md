# Operating framework

How work on this repository is run. This file is the persistent record of that process: a fresh session (or a new
contributor) should read it first, then `docs/ROADMAP.md` for where the project stands and what is next, then
`docs/FEATURE_AUDIT.md` for the detailed done/open list. To run the project on your own computer, see `docs/DEVELOPING.md`.

## The loop: Plan, Propose, Execute, Review

Work moves in small sprints. Each sprint is one pass through four steps, and each pass ends with a commit.

### 1. Plan (Audit)
Find out what is true before deciding anything.
- Read `docs/ROADMAP.md` (the current phase) and `docs/FEATURE_AUDIT.md` (open items, in priority order), and
  `git status` / `git log` for what is already in flight. Uncommitted work in the tree counts: check whether a feature
  already exists before building it.
- Read the code the sprint will touch, plus its tests. Do not rely on memory or on what a doc claims.
- Run the test suites for the area to learn the starting state (see "Commands").

### 2. Propose (Mini-Sprint)
Pick the top open item and cut it down to a sprint that fits one commit.
- State the goal, the files it touches, what is out of scope, and what could go wrong.
- Prefer the highest-priority open item unless something it depends on is missing.
- If the choice is the owner's (money, policy, legal wording, third-party accounts), ask. Otherwise decide and move on.

### 3. Execute
- Work on a `feature/<topic>` branch, never on `main`.
- Make the change in the smallest set of files that does the job. Match the surrounding code: comments explain
  why, in plain English, at the top of each file.
- Anything the customer reads must state only what the code does. When behaviour changes, change the copy
  (privacy, terms, refunds, FAQ) in the same sprint.
- Server decides, client displays: prices, stock, order status and anything involving money are never trusted from the
  browser.
- Add or update tests with the change. A bug fix starts with a test that fails.
- One concern per commit, and a title that says what changed ("Add the Excel delivery-slot column"), not a phase name.

### 4. Review
- Run every suite below plus lint. A sprint is not done while any of them fails or is skipped. CI
  (`.github/workflows/ci.yml`) repeats them on every pull request, but a failure found there is a failure you shipped.
- For a change to a screen, also look at it in a browser at desktop width and in a 390 px phone frame, and read the console.
- Re-read the diff as a reviewer: untrusted input (for example `?next=`), error paths, empty and loading states,
  copy that has drifted from behaviour.
- Update the docs in the same commit: tick off what shipped in `docs/FEATURE_AUDIT.md`, add anything newly discovered, keep
  the order honest; move `docs/ROADMAP.md` along when a phase item is done; update `FreshBliss_Master_Architecture.md` if the
  system description changed. `web/tests/docPaths.test.mjs` fails when a doc names a file that no longer exists.
- Commit with a message that says what changed and why. Do not commit scratch files, secrets or `.env*`.
- Close with a short report: what shipped, test results, what was not verified, and the proposed next sprint.

## Commands

| Area | Command | Needs |
|---|---|---|
| Run the whole shop locally | `npm run dev` (repository root) | Node, Java |
| Web unit tests | `cd web; npm test` | Node |
| Web lint | `cd web; npx eslint .` | Node |
| Web production build | `cd web; npm run build` (stop `next dev` first) | Node |
| Firebase unit tests | `cd firebase; npm run test:unit` | Node |
| Firestore rules | `cd firebase; npm run test:rules` | Java, Firebase emulator |
| Orders, payments | `cd firebase; npm run test:orders` and `npm run test:payments` | Java, Firebase emulator |
| Excel sync | `cd firebase; npm run test:excel` | Java, Firebase emulator |
| All backend suites | `cd firebase; npm test` | Java, Firebase emulator |
| Money-path rehearsal | `cd firebase; npm run rehearsal` | Java, local function settings |

## Standing rules
- **Autonomy has limits.** Commit on a feature branch and push that branch (the owner approved this on 6 October 2026), then
  open a pull request. Merging to `main` (which publishes the live shop), deploying, changing real Firebase / Razorpay / AWS /
  Vercel settings, spending money, and anything that touches production data need the owner's explicit say-so.
- **Nothing has run against real accounts** until `docs/GO_LIVE.md` section 9 (the rehearsal) has been done. Say so
  in reports instead of implying otherwise.
- **Duplicated logic is guarded by a test.** Delivery slots live in `firebase/functions/shared/slots.js` and
  `web/lib/slots.js` (`web/tests/slots.test.mjs`); the free-delivery amount is in the seed and in the web (`web/tests/freeDelivery.test.mjs`);
  the Excel columns are in code and in `firebase/docs/AWS_SETUP.md`; the home page words are held to the rules in
  `web/tests/homeContent.test.mjs`. Keep it that way for any future duplication.
- **Never commit** `functions/.env.local`, `.secret.local`, or stray capture files.
- **Open questions that are not code** (tax, refund window, cash on delivery) live in the "Things to decide" section of
  `docs/FEATURE_AUDIT.md` and in `docs/ROADMAP.md` section 5. Do not guess them in code.
- **Commit attribution:** commits and pull requests made by the assistant carry the attribution line the session was given.

## Where things are
- `docs/ROADMAP.md`: where the project stands, how work runs from here, and the phases ahead. Read it first.
- `docs/DEVELOPING.md`: setting up and running the project locally, the checks, which settings file does what.
- `docs/FEATURE_AUDIT.md`: what is strong, what shipped, the prioritised open list.
- `docs/GO_LIVE.md`: deploying with real money, and the known gaps.
- `FreshBliss_Master_Architecture.md`: how the system is built (hosting, secrets, protections, the Excel bridge, the storefront).
- `README.md`: the design brief (colours, type, copy and accessibility rules). `firebase/README.md`: the backend's functions, data and tests.
- `web/CLAUDE.md` / `web/AGENTS.md`: conventions for the Next.js storefront.
- `web/content/*.js`: the customer-facing words (business details, policies, privacy).
- `firebase/functions/`: Cloud Functions; `firebase/firestore.rules`: access rules; `firebase/tests/`: their tests.
