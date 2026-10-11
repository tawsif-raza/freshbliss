// The chat assistant's FAQ bank as the SERVER sees it (pages/api/assistant.js only), read from Firestore's public REST
// endpoint like the catalogue (lib/serverCatalog.js): the rules let anyone read `assistantFaqs`. Never throws: null when
// Firestore could not be reached, so the assistant simply goes on to the AI.

import { documentsUrl, fieldsToData, request, restTarget } from './serverCatalog.js';

const SAFE_ID = /^[a-z0-9-]{1,80}$/;
const text = (v) => (typeof v === 'string' ? v.trim() : '');

// A stored document -> { id, question, variants, answer, links, active }, or null if it cannot be used.
export function faqFromData(id, data) {
  if (!SAFE_ID.test(String(id)) || !data || data.active === false) return null;
  const question = text(data.question);
  const answer = text(data.answer);
  if (!question || !answer) return null;
  return {
    id,
    question,
    variants: (Array.isArray(data.variants) ? data.variants : []).map(text).filter(Boolean),
    answer,
    links: (Array.isArray(data.links) ? data.links : [])
      .filter((l) => typeof l?.href === 'string' && /^\/(?!\/)/.test(l.href) && text(l.label))
      .slice(0, 3)
      .map((l) => ({ label: text(l.label).slice(0, 32), href: l.href })),
    active: true,
  };
}

export async function fetchAssistantFaqs({ env = process.env, fetchImpl = fetch } = {}) {
  const target = restTarget(env);
  if (!target) return null;
  try {
    const res = await request(`${documentsUrl(target)}/assistantFaqs?pageSize=300`, { method: 'GET' }, fetchImpl);
    if (!res.ok) return null;
    const { documents = [] } = await res.json();
    return documents.map((d) => faqFromData(String(d.name).split('/').pop(), fieldsToData(d.fields))).filter(Boolean);
  } catch {
    return null;
  }
}
