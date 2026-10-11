// POST /api/assistant: the chat assistant's server answers (docs/CHATBOT.md explains the whole design).
//
//   request   { message: string, history: [{ role: 'user' | 'assistant', text }] }
//   response  200 { text, productIds, links, source: 'faq' | 'ai', cached? }
//             400 { error }  bad request        429 { error }  too many AI questions from this visitor
//             503 { error }  no AI available (no key set, or every provider failed): the browser then answers locally
//
// In order, cheapest first:
//   1. the FAQ bank (the `assistantFaqs` collection, matched by lib/faqMatch.js): no AI call, no cost, no rate limit;
//   2. the answer cache: an AI answer someone already got for the same question;
//   3. the AI (lib/assistantServer.js), limited per visitor.
// The most common questions never reach this route at all: the browser answers them (content/assistant.js TOPICS).
// The API keys are read here, on the server, and never sent to the browser.

import { BUSINESS } from '@/content/business';
import { FREE_DELIVERY_THRESHOLD } from '@/content/storefront';
import { askModel, buildKnowledge, createCache, createRateLimiter, hasProvider, questionKey, validateRequest } from '@/lib/assistantServer';
import { fillAnswer, indexFaqs, matchFaq } from '@/lib/faqMatch';
import { listPolicies } from '@/lib/policies';
import { TIP_OPTIONS } from '@/lib/pricing';
import { documentsUrl, fetchActiveProducts, fieldsToData, request, restTarget } from '@/lib/serverCatalog';
import { fetchAssistantFaqs } from '@/lib/serverFaqs';
import { fetchPolicies } from '@/lib/serverPolicies';
import { LEAD_MINUTES, WINDOWS, windowLabel } from '@/lib/slots';
import { normaliseZone } from '@/lib/zoneMatch';

export const config = { api: { bodyParser: { sizeLimit: '16kb' } } };

const KNOWLEDGE_TTL_MS = 5 * 60 * 1000;
const answers = createCache(); // standalone AI answers by question, for every visitor
const allow = createRateLimiter();
let knowledge = { at: 0, value: null };
let faqBank = { at: 0, index: null };

// The most of one item and size an order can hold: the same as MAX_QTY_PER_LINE in context/CartContext.js (which this
// server route must not import: it pulls in the browser's Firebase) and in firebase/functions/createCheckout.js.
// web/tests/faqMatch.test.mjs fails if they ever differ.
const MAX_QTY = 20;

// The numbers the FAQ answers quote ({{name}}), taken from the code so they can never drift from what checkout does.
const phone = /^\+?[\d\s-]{8,}$/.test(BUSINESS.contact ?? '') ? BUSINESS.contact : '';
const FAQ_VARS = {
  freeDeliveryFrom: FREE_DELIVERY_THRESHOLD,
  deliveryHours: windowLabel({ startHour: WINDOWS[0].startHour, endHour: WINDOWS[WINDOWS.length - 1].endHour }),
  leadMinutes: LEAD_MINUTES,
  maxQty: MAX_QTY,
  tips: TIP_OPTIONS.filter((t) => t > 0)
    .map((t) => `₹${t}`)
    .join(', ')
    .replace(/, ([^,]*)$/, ' or $1'),
  supportEmail: BUSINESS.supportEmail,
  contactLine: phone ? `, or call${phone.startsWith('+91') ? ' or WhatsApp' : ''} ${phone}` : '',
};

async function fetchZones() {
  const target = restTarget();
  if (!target) return [];
  try {
    const res = await request(`${documentsUrl(target)}/deliveryZones`, { method: 'GET' }, fetch);
    if (!res.ok) return [];
    const { documents = [] } = await res.json();
    return documents
      .map((d) => normaliseZone(String(d.name).split('/').pop(), fieldsToData(d.fields)))
      .filter(Boolean)
      .sort((a, b) => a.priority - b.priority);
  } catch {
    return [];
  }
}

// The FAQ bank, refreshed every few minutes so answers edited in the Firestore console are picked up without a deploy.
async function loadFaqs() {
  if (faqBank.index && Date.now() - faqBank.at < KNOWLEDGE_TTL_MS) return faqBank.index;
  const faqs = await fetchAssistantFaqs();
  // A failed read keeps the previous bank (if any) and is retried after 30 seconds.
  faqBank = faqs ? { at: Date.now(), index: indexFaqs(faqs) } : { at: Date.now() - KNOWLEDGE_TTL_MS + 30000, index: faqBank.index ?? [] };
  return faqBank.index;
}

// The shop's facts for the model, refreshed every few minutes so new products and prices are picked up.
async function loadKnowledge() {
  if (knowledge.value && Date.now() - knowledge.at < KNOWLEDGE_TTL_MS) return knowledge.value;
  const [products, zones, policies] = await Promise.all([fetchActiveProducts(), fetchZones(), fetchPolicies()]);
  const approved = listPolicies(policies).filter((p) => !p.placeholder);
  const value = {
    text: buildKnowledge({ products: products ?? [], zones, policies: approved }),
    productIds: (products ?? []).map((p) => p.id),
    policyIds: approved.map((p) => p.id),
  };
  // A failed catalogue read is not kept for long, so the next question tries again.
  knowledge = { at: products ? Date.now() : Date.now() - KNOWLEDGE_TTL_MS + 30000, value };
  return value;
}

const visitor = (req) => String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Use POST.' });
  }

  const input = validateRequest(req.body);
  if (input.error) return res.status(400).json({ error: input.error });

  // 1. The FAQ bank.
  const hit = matchFaq(input.message, await loadFaqs());
  if (hit) return res.status(200).json({ text: fillAnswer(hit.faq.answer, FAQ_VARS), productIds: [], links: hit.faq.links ?? [], source: 'faq' });

  // 2. An AI answer someone already got.
  const key = questionKey(input.message);
  const cached = answers.get(key);
  if (cached) return res.status(200).json({ ...cached, source: 'ai', cached: true });

  // 3. The AI.
  if (!hasProvider()) return res.status(503).json({ error: 'The AI assistant is not set up.' });
  if (!allow(visitor(req))) return res.status(429).json({ error: 'You’ve asked a lot of questions in a short time. Please wait a few minutes, or contact us directly.' });

  const facts = await loadKnowledge();
  const result = await askModel({
    message: input.message,
    history: input.history,
    knowledge: facts.text,
    productIds: facts.productIds,
    policyIds: facts.policyIds,
    log: (line) => console.warn(`[assistant] ${line}`),
  });
  if (!result) return res.status(503).json({ error: 'The AI assistant is not available right now.' });

  const { standalone, ...reply } = result.reply;
  if (standalone) answers.set(key, reply);
  return res.status(200).json({ ...reply, source: 'ai' });
}
