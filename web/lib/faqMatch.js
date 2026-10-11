// Matching a chat question to the FAQ bank (the `assistantFaqs` collection, firebase/scripts/assistantFaqs.js), so the
// assistant can answer it without calling the AI (pages/api/assistant.js). Pure functions, so they are easy to test.
//
// How: the question and each FAQ wording (its question and every variant) are reduced to their meaningful words (lower
// case, filler words such as "the", "kya", "hai" removed, simple plural and -ing endings dropped, common synonyms such
// as "coupon" -> "promo" merged). A wording's score is the Dice overlap of the two word sets (1 = the same words). A FAQ
// answers when its best wording scores at least MATCH_SCORE, or covers nearly all of a short question. It must also
// clearly beat every other FAQ: when two FAQs score about the same, nothing is returned and the AI decides, because a
// wrong canned answer is worse than a slower right one.

export const MATCH_SCORE = 0.6;
const CLEAR_LEAD = 0.08; // the best FAQ must beat the next one by this much

const STOPWORDS = new Set(
  (
    'a about am an and any anything are as at be been can could do does doing for from get got had has have hello hey hi how i if ' +
    'im in is it its just kindly me my need of on or our please pls should so some tell than that the their them there this ' +
    'to u us want was we what whats when which who why will with would you your youre ' +
    // Hinglish filler
    'hai hain kya ka ki ke ko me mein mujhe se toh bhi kaise kare karo karna karein aap apna apni haan nahi na'
  ).split(' '),
);

const SYNONYMS = {
  bangalore: 'bengaluru',
  blr: 'bengaluru',
  pin: 'pincode',
  zip: 'pincode',
  postcode: 'pincode',
  coupon: 'promo',
  voucher: 'promo',
  discount: 'offer',
  deal: 'offer',
  sale: 'offer',
  cancellation: 'cancel',
  cancelled: 'cancel',
  refunded: 'refund',
  money: 'refund',
  gpay: 'upi',
  phonepe: 'upi',
  paytm: 'upi',
  cod: 'cash',
  courier: 'delivery',
  shipping: 'delivery',
  ship: 'delivery',
  deliver: 'delivery',
  delivered: 'delivery',
  delivering: 'delivery',
  fee: 'charge',
  cost: 'charge',
  charges: 'charge',
  rotten: 'damaged',
  spoiled: 'damaged',
  spoilt: 'damaged',
  kharab: 'damaged',
  login: 'signin',
  log: 'signin',
  signin: 'signin',
  register: 'signup',
  slot: 'window',
  timeslot: 'window',
  bill: 'invoice',
  receipt: 'invoice',
  kab: 'when',
  kitna: 'much',
  kitne: 'much',
  paisa: 'refund',
  phone: 'phone',
  mobile: 'phone',
  number: 'phone',
};

const stem = (w) => (w.length > 5 && w.endsWith('ing') ? w.slice(0, -3) : w.length > 4 && w.endsWith('es') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

// "Do you deliver to Bangalore?" -> Set { 'delivery', 'bengaluru' }
export function words(text) {
  const out = new Set();
  const tokens = String(text ?? '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/sign\s+in/g, 'signin')
    .replace(/log\s+in/g, 'login')
    .replace(/sign\s+up/g, 'signup')
    .replace(/cash\s+on\s+delivery/g, 'cash')
    .split(/[^\p{L}\p{N}]+/u);
  for (const t of tokens) {
    if (!t || STOPWORDS.has(t)) continue;
    const w = SYNONYMS[t] ?? SYNONYMS[stem(t)] ?? stem(t);
    if (!STOPWORDS.has(w)) out.add(w);
  }
  return out;
}

function score(q, p) {
  if (q.size === 0 || p.size === 0) return 0;
  let overlap = 0;
  for (const w of q) if (p.has(w)) overlap += 1;
  // One shared word is not enough for a longer question ("I want to buy dates" is not "How do I buy from you?").
  if (overlap < Math.min(2, q.size)) return 0;
  const dice = (2 * overlap) / (q.size + p.size);
  // A short question that the wording covers completely ("cod?", "refund status") counts as a match.
  const covered = overlap === q.size && overlap >= 1 && overlap / p.size >= 0.5;
  return covered ? Math.max(dice, MATCH_SCORE) : dice;
}

// Prepare the FAQs once (their word sets), so each question is quick to match.
export function indexFaqs(faqs) {
  return faqs
    .filter((f) => f && f.active !== false && typeof f.answer === 'string' && f.answer.trim())
    .map((f) => ({ faq: f, wordings: [f.question, ...(Array.isArray(f.variants) ? f.variants : [])].filter((v) => typeof v === 'string').map(words).filter((s) => s.size > 0) }));
}

// The FAQ that answers `question`, or null. `index` comes from indexFaqs.
export function matchFaq(question, index) {
  const q = words(question);
  if (q.size === 0 || q.size > 12) return null; // empty, or a long detailed question: leave it to the AI
  let best = null;
  let second = 0;
  for (const entry of index) {
    const s = Math.max(0, ...entry.wordings.map((p) => score(q, p)));
    if (!best || s > best.score) {
      if (best) second = Math.max(second, best.score);
      best = { faq: entry.faq, score: s };
    } else {
      second = Math.max(second, s);
    }
  }
  if (!best || best.score < MATCH_SCORE || best.score - second < CLEAR_LEAD) return null;
  return best;
}

// Fill in {{name}} from `vars`; an unknown name becomes empty rather than showing braces to a customer.
export const fillAnswer = (template, vars = {}) =>
  String(template)
    .replace(/\{\{(\w+)\}\}/g, (_, name) => (vars[name] === undefined || vars[name] === null ? '' : String(vars[name])))
    .replace(/\s+([.,])/g, '$1')
    .trim();
