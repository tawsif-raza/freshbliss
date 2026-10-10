// The chat assistant's answers (components/ChatAssistant.js). There is no backend yet, so this answers in the browser:
// first from the topics in content/assistant.js (orders, refunds, delivery, payment, a person), then by finding fruit
// boxes that match the words typed, and otherwise with a friendly "I can't answer that yet".
//
// THE BACKEND GOES HERE. When one is chosen, replace the body of askAssistant with a call to it and keep the shape of
// the reply, so the chat window needs no change:
//   { text: string, links: [{ label, href }], products: [product], suggest: boolean }
// `suggest` asks the window to show the suggested questions again.
//
// Pure (no React, no Firebase) apart from the async signature a real call will need, so it is easy to test.

import { FALLBACK, PRODUCT_INTRO, SYNONYMS, TOPICS } from '../content/assistant.js'; // relative on purpose: the tests load this file in plain Node, which does not know the @/ alias
import { searchProducts } from './search.js';

export const MAX_PRODUCTS = 3;

// Words that say nothing about which box is wanted.
const STOPWORDS = new Set(
  'a an and any are box boxes can do does for from have i in is it me my of on or pack packs please right now show some something the to what whats with you your'.split(' '),
);

const clean = (text) => String(text ?? '').toLowerCase().replace(/[’']/g, '').trim();

// The words worth searching for, with synonyms turned into the shop's own category names.
function keywords(text) {
  return clean(text)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
    .map((w) => SYNONYMS[w] ?? SYNONYMS[w.replace(/s$/, '')] ?? w);
}

// Boxes matching any of the words, those matching the most words first. searchProducts needs EVERY word to match,
// which suits a search box but not a sentence, so each word is searched on its own and the hits are counted.
export function matchProducts(products, text, limit = MAX_PRODUCTS) {
  const hits = new Map();
  for (const word of new Set(keywords(text))) {
    for (const product of searchProducts(products, word, products.length)) {
      hits.set(product, (hits.get(product) ?? 0) + 1);
    }
  }
  return [...hits.entries()]
    .sort((a, b) => Number(a[0].stock <= 0) - Number(b[0].stock <= 0) || b[1] - a[1])
    .slice(0, limit)
    .map(([product]) => product);
}

// The answer to one message. `supportEmail` turns into an "Email support" button for the topics that want one.
export function replyTo(text, { products = [], supportEmail = '' } = {}) {
  const message = clean(text);

  const topic = TOPICS.find((t) => t.pattern.test(message));
  if (topic) {
    const links = [...topic.links];
    if (topic.emailSupport && supportEmail) links.push({ label: 'Email support', href: `mailto:${supportEmail}` });
    return { text: topic.text, links, products: [], suggest: false };
  }

  const found = matchProducts(products, message);
  if (found.length > 0) {
    return { text: PRODUCT_INTRO, links: [{ label: 'See all boxes', href: '/products' }], products: found, suggest: false };
  }

  return { text: FALLBACK.text, links: [...FALLBACK.links], products: [], suggest: true };
}

export async function askAssistant(text, context) {
  return replyTo(text, context);
}
