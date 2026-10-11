// The chat assistant's answers (components/ChatAssistant.js). docs/CHATBOT.md explains the design. In order:
//   1. cachedReply: the frequently asked questions in content/assistant.js (TOPICS), answered instantly, no AI call;
//   2. cachedReply: browsing ("show me fitness packs"), answered from the products already loaded in the browser;
//   3. a question asked before in this visit: the AI's earlier answer, from memory (no new call);
//   4. the shop's own server (pages/api/assistant.js): its FAQ bank first (no AI call), then the AI, which keeps the keys;
//   5. if the AI cannot be reached: matching products, or a friendly fallback with useful links.
//
// Every reply has the same shape, so the chat window needs no special cases:
//   { text, links: [{ label, href }], products: [product], related: [question], suggest, source: 'cache' | 'faq' | 'ai' | 'offline' }
// `suggest` asks the window to show the popular questions again; `related` are follow-up chips.
//
// Pure apart from askAssistant's fetch (which tests replace), so it is easy to test.

import { ASSISTANT, FALLBACK, PRODUCT_INTRO, SYNONYMS, TOPICS } from '../content/assistant.js'; // relative on purpose: the tests load this file in plain Node, which does not know the @/ alias
import { searchProducts } from './search.js';

export const MAX_PRODUCTS = 3;
export const MAX_HISTORY = 6;
// A long, detailed question deserves a real answer rather than the closest canned one (unless the AI is unreachable).
const MAX_WORDS_FOR_CANNED = 14;

// Words that say nothing about which box is wanted.
const STOPWORDS = new Set(
  'a an and any are box boxes can do does for from have i in is it me my of on or pack packs please right now show some something the to what whats with you your'.split(' '),
);
// Words that mean "show me products", so a browsing request is answered from the catalogue rather than the AI.
const BROWSE = /\b(show|see|find|list|browse|recommend|suggest|looking for|want|need|buy|order some|have you got|do you (have|sell)|whats (new|seasonal|in))\b/;

const clean = (text) => String(text ?? '').toLowerCase().replace(/[’']/g, '').trim();
const wordCount = (text) => clean(text).split(/\s+/).filter(Boolean).length;
export const questionKey = (text) => clean(text).replace(/[^\p{L}\p{N}₹ ]+/gu, ' ').replace(/\s+/g, ' ').trim();

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

function topicReply(topic, supportEmail) {
  const links = [...topic.links];
  if (topic.emailSupport && supportEmail) links.push({ label: 'Email support', href: `mailto:${supportEmail}` });
  return { text: topic.text, links, products: [], related: [...(topic.related ?? [])], suggest: false, source: 'cache' };
}

const productReply = (found) => ({ text: PRODUCT_INTRO, links: [{ label: 'Shop everything', href: '/products' }], products: found, related: [], suggest: false, source: 'cache' });
const fallbackReply = () => ({ text: FALLBACK.text, links: [...FALLBACK.links], products: [], related: [], suggest: true, source: 'cache' });

// An instant answer, or null when the question needs the AI. `force` (no AI available) skips the length rule.
export function cachedReply(text, { products = [], supportEmail = '', force = false } = {}) {
  const message = clean(text);
  if (!message) return null;
  const short = wordCount(message) <= MAX_WORDS_FOR_CANNED;

  const topic = TOPICS.find((t) => t.pattern.test(message));
  if (topic && (short || force)) return topicReply(topic, supportEmail);

  const browsing = BROWSE.test(message) || wordCount(message) <= 3;
  if (browsing || force) {
    const found = matchProducts(products, message);
    if (found.length > 0) return productReply(found);
  }
  return null;
}

// The whole local answer, used when the AI cannot help: the instant answer, else products, else the fallback.
export function replyTo(text, context = {}) {
  return cachedReply(text, { ...context, force: true }) ?? fallbackReply();
}

// The last few turns, for follow-up questions ("and the large size?").
export function historyFor(messages) {
  return messages
    .filter((m) => (m.from === 'user' || m.from === 'bot') && typeof m.text === 'string' && !m.error)
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.from === 'user' ? 'user' : 'assistant', text: m.text }));
}

// AI answers already given in this visit, by question (and the browser tab's sessionStorage, so a reload keeps them).
const memory = new Map();
const MEMORY_KEY = 'fb-assistant-answers';
const MEMORY_MAX = 50;

function readMemory() {
  if (memory.size || typeof window === 'undefined') return;
  try {
    for (const [k, v] of JSON.parse(window.sessionStorage.getItem(MEMORY_KEY) ?? '[]')) memory.set(k, v);
  } catch {
    // storage blocked or corrupt: start empty
  }
}

function remember(key, reply) {
  memory.set(key, reply);
  while (memory.size > MEMORY_MAX) memory.delete(memory.keys().next().value);
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(MEMORY_KEY, JSON.stringify([...memory]));
  } catch {
    // storage full or blocked: memory still works for this page
  }
}

export function forgetAnswers() {
  memory.clear();
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(MEMORY_KEY);
  } catch {
    // nothing to do
  }
}

// The server's reply -> the shape the window shows, with product ids turned into the products loaded in the browser.
function fromServer(data, products) {
  const byId = new Map(products.map((p) => [p.id, p]));
  return {
    text: data.text,
    links: Array.isArray(data.links) ? data.links : [],
    products: (data.productIds ?? []).map((id) => byId.get(id)).filter(Boolean).slice(0, MAX_PRODUCTS),
    related: [],
    suggest: false,
    source: data.source === 'faq' ? 'faq' : 'ai', // 'faq': answered from the FAQ bank on the server, without the AI
  };
}

export async function askAssistant(text, { products = [], supportEmail = '', history = [], fetchImpl = globalThis.fetch } = {}) {
  const instant = cachedReply(text, { products, supportEmail });
  if (instant) return instant;

  readMemory();
  const key = questionKey(text);
  const remembered = history.length === 0 ? memory.get(key) : undefined; // a follow-up may mean something else
  if (remembered) return fromServer(remembered, products);

  try {
    const res = await fetchImpl('/api/assistant', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: text, history }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && typeof data.text === 'string' && data.text.trim()) {
      const reply = { text: data.text, links: data.links ?? [], productIds: data.productIds ?? [], source: data.source };
      if (history.length === 0) remember(key, reply);
      return fromServer(reply, products);
    }
    if (res.status === 429 || res.status === 400) return { ...fallbackReply(), text: data.error || FALLBACK.text, suggest: false, source: 'offline' };
  } catch {
    // offline or the server is down: answer locally below
  }
  const local = replyTo(text, { products, supportEmail });
  return local.text === FALLBACK.text ? { ...local, source: 'offline' } : { ...local, text: local.products.length ? `${ASSISTANT.offline} ${local.text}` : local.text, source: 'offline' };
}
