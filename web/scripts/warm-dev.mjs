// Opens the main pages of the local shop once, right after `npm run dev` starts, so Next compiles them in the background.
//
// In development Next builds each page the first time it is asked for, which takes from a few seconds to half a minute
// per page on Windows. Without this, that wait lands on the first click on every page; with it, it happens while the
// emulators are still starting and you are opening the browser. Run by the root `npm run dev` once Firestore is up
// (the shop pages read it while they are built). Production is not affected: there every page is built ahead of time.
//
//   node web/scripts/warm-dev.mjs [base-url]      (default http://localhost:3000)
//
// It only reads pages. A page that fails is reported and skipped: this must never stop the dev stack.

const BASE = (process.argv[2] ?? 'http://localhost:3000').replace(/\/+$/, '');
// In the order people usually open them. One product page is added after the home page (its address comes from the
// home page's links, so it is always a box that exists in the seed).
const PAGES = ['/', '/products', '/cart', '/checkout', '/login', '/account', '/faq', '/orders/warm-up'];
const WAIT_FOR_SERVER_MS = 180_000;
const PAGE_TIMEOUT_MS = 180_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`;

async function waitForServer() {
  const until = Date.now() + WAIT_FOR_SERVER_MS;
  while (Date.now() < until) {
    try {
      await fetch(`${BASE}/`, { signal: AbortSignal.timeout(PAGE_TIMEOUT_MS) }); // compiles the home page as it waits
      return true;
    } catch {
      await sleep(1000);
    }
  }
  return false;
}

async function open(path) {
  const started = Date.now();
  try {
    const res = await fetch(BASE + path, { signal: AbortSignal.timeout(PAGE_TIMEOUT_MS) });
    const html = await res.text();
    console.log(`warm-up: ${path} ready in ${seconds(Date.now() - started)}`);
    return html;
  } catch (err) {
    console.log(`warm-up: ${path} skipped (${err.name === 'TimeoutError' ? 'timed out' : err.message})`);
    return '';
  }
}

if (!(await waitForServer())) {
  console.log(`warm-up: ${BASE} did not answer, nothing compiled ahead.`);
  process.exit(0);
}

const started = Date.now();
for (const path of PAGES) {
  const html = await open(path);
  if (path === '/') {
    const product = html.match(/href="(\/products\/[A-Za-z0-9_-]+)"/)?.[1];
    if (product) await open(product);
  }
}
console.log(`warm-up: done in ${seconds(Date.now() - started)}. Pages open instantly from here on.`);
