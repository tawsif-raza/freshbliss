// POST /api/assistant: the chat assistant's AI answers (lib/assistantServer.js does the work; docs/CHATBOT.md explains it).
//
//   request   { message: string, history: [{ role: 'user' | 'assistant', text }] }
//   response  200 { text, productIds, links, source: 'ai' | 'cache' }
//             400 { error }  bad request        429 { error }  too many questions from this visitor
//             503 { error }  no AI available (no key set, or every provider failed): the browser then answers locally
//
// Frequently asked questions never reach this route: the browser answers them itself (content/assistant.js TOPICS).
// The API keys (GROQ_API_KEY, OPENROUTER_API_KEY) are read here, on the server, and never sent to the browser.

import { listPolicies } from '@/lib/policies';
import { askModel, buildKnowledge, createCache, createRateLimiter, hasProvider, questionKey, validateRequest } from '@/lib/assistantServer';
import { documentsUrl, fetchActiveProducts, fieldsToData, request, restTarget } from '@/lib/serverCatalog';
import { fetchPolicies } from '@/lib/serverPolicies';
import { normaliseZone } from '@/lib/zoneMatch';

export const config = { api: { bodyParser: { sizeLimit: '16kb' } } };

const KNOWLEDGE_TTL_MS = 5 * 60 * 1000;
const answers = createCache(); // standalone answers by question, for every visitor
const allow = createRateLimiter();
let knowledge = { at: 0, value: null };

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

  const key = questionKey(input.message);
  const cached = answers.get(key);
  if (cached) return res.status(200).json({ ...cached, source: 'cache' });

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
