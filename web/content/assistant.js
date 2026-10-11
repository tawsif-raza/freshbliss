// The words of the chat assistant (components/ChatAssistant.js), in one place, so they can change without touching code.
//
// How a question is answered (lib/assistant.js, docs/CHATBOT.md):
//   1. TOPICS below: the frequently asked questions, answered instantly in the browser. No AI call, no cost.
//   2. Browsing ("show me fitness packs"): matching products from the catalogue already loaded in the browser.
//   3. Anything else goes to the AI (pages/api/assistant.js), which only knows what the shop tells it.
//   4. If the AI cannot be reached: the matching products, or FALLBACK.
//
// REVIEW BEFORE LAUNCH: every answer is a promise the shop is held to. Each one says only what the system does today
// and points to the page that holds the details (the FAQ, the policies, the order page), so they cannot drift apart.

import { FREE_DELIVERY_THRESHOLD } from './storefront.js';
import { LEAD_MINUTES, WINDOWS, windowLabel } from '../lib/slots.js';

export const ASSISTANT = {
  name: 'FreshBliss Assistant',
  status: 'Online · usually replies in seconds',
  greeting: "Hi! I'm the FreshBliss assistant. Ask me about our fruit and drinks, delivery, offers, or an order you've placed.",
  suggestionsTitle: 'Popular questions',
  relatedTitle: 'You might also ask',
  placeholder: 'Ask anything about FreshBliss...',
  // Shown under the message box.
  note: 'AI answers can be wrong. Please don’t share payment details here.',
  aiLabel: 'AI answer',
  thinking: 'Thinking',
  clear: 'Start a new chat',
  retry: 'Try again',
  offline: 'I couldn’t reach my AI helper just now, so here is what I can tell you from the shop:',
};

// The chips shown before the first message. Each is sent as if the visitor had typed it, and each is answered from TOPICS
// or the catalogue (web/tests/assistant.test.mjs makes sure none of them needs the AI).
export const SUGGESTIONS = [
  'Track my order',
  'What does delivery cost?',
  'Do you deliver to my pincode?',
  'Show me Ramadan specials',
  'How do I cancel or get a refund?',
  'Do you have cash on delivery?',
];

const [firstWindow, lastWindow] = [WINDOWS[0], WINDOWS[WINDOWS.length - 1]];
const deliveryHours = `${windowLabel({ startHour: firstWindow.startHour, endHour: lastWindow.endHour })}`;

// The frequently asked questions. The FIRST topic whose pattern matches answers, so the more specific topics come first
// ("cancel my order" is about cancelling, not tracking). Patterns see the message in lower case with apostrophes removed
// ("where's" arrives as "wheres"). `links` become buttons; `related` are follow-up questions offered as chips (each must
// itself be answered by a topic here, which the tests check).
export const TOPICS = [
  {
    id: 'greeting',
    pattern: /^(hi+|hello|hey|hiya|salaam|salam|assalamu? ?alaikum|namaste|namaskara?|good (morning|afternoon|evening))\b[\s!.?]*$/,
    text: 'Hello! How can I help you today? You can ask about our fruit and drinks, delivery, offers or an order.',
    links: [],
    related: ['What does delivery cost?', 'Show me Ramadan specials'],
  },
  {
    id: 'thanks',
    pattern: /^(ok(ay)?[, ]*)?(thanks?|thank you|thx|ty|great|perfect|cool)\b[\s\w!.]*$/,
    text: 'You’re welcome! Anything else I can help with?',
    links: [],
    related: [],
  },
  {
    id: 'change-order',
    pattern: /\b(change|edit|modify|update|add to|remove from)\b.{0,20}\b(order|address|slot|items?)\b/,
    text: 'A paid order can’t be edited. If it hasn’t been packed yet, you can cancel it from its page under My orders (the refund goes back to your original payment method) and place a new one.',
    links: [
      { label: 'My orders', href: '/account' },
      { label: 'Refund policy', href: '/refunds' },
    ],
    related: ['How do I cancel or get a refund?'],
  },
  {
    id: 'cancel',
    pattern: /\b(cancel\w*|refund\w*|money back|return\w*|damaged|wrong item|spoil\w*|rotten|bad quality)\b/,
    text: 'You can cancel an order until we have packed it, using the Cancel button on its page under My orders. The refund goes back to your original payment method. The refund policy has the details.',
    links: [
      { label: 'My orders', href: '/account' },
      { label: 'Refund policy', href: '/refunds' },
    ],
    related: ['Track my order', 'Talk to a person'],
  },
  {
    id: 'order',
    pattern: /\b(track\w*|order status|my orders?|where(s| is) my|delivered yet|arriv\w*|late)\b/,
    text: 'You can follow every order live, from preparing to out for delivery to delivered. Open it from My orders.',
    links: [{ label: 'My orders', href: '/account' }],
    related: ['How do I cancel or get a refund?', 'Talk to a person'],
  },
  {
    id: 'cod',
    pattern: /\b(cod|cash on delivery|pay (in |by |with )?cash|cash payment)\b/,
    text: 'We don’t offer cash on delivery. You pay online through Razorpay when you place the order, and you see the full total before you pay.',
    links: [{ label: 'Payments & pricing', href: '/policies/payments' }],
    related: ['Which payment methods do you accept?'],
  },
  {
    id: 'payment',
    pattern: /\b(pay|paying|payment\w*|upi|card|razorpay|gpay|phonepe|paytm|netbanking)\b/,
    text: 'You pay online, securely through Razorpay. Razorpay’s screen shows every way you can pay. We never see or store your card, UPI or bank details.',
    links: [{ label: 'Payment FAQ', href: '/faq' }],
    related: ['Do you have cash on delivery?', 'Do you have any offers?'],
  },
  {
    id: 'delivery-fee',
    pattern: /\b(free delivery|delivery (fee|charges?|cost)|shipping (fee|charges?|cost)|minimum order|how much (is|for) delivery|what does delivery cost)\b/,
    text: `Delivery is free to some central Bengaluru pincodes. Elsewhere there is a small flat fee, and delivery is free on orders of ₹${FREE_DELIVERY_THRESHOLD} or more. Enter your pincode to see your exact fee before you pay.`,
    links: [{ label: 'Check my pincode', href: '/#delivery' }],
    related: ['When do you deliver?', 'Do you deliver to my pincode?'],
  },
  {
    id: 'slots',
    pattern: /\b(slots?|time ?slots?|delivery (time|window)s?|when do you deliver|what time|schedule\w*|tomorrow|tonight|morning|evening|deliver today)\b/,
    text: `At checkout, choose "As soon as possible" or a two-hour window from ${deliveryHours}, today or tomorrow. A window can be booked until ${LEAD_MINUTES} minutes before it starts.`,
    links: [{ label: 'Shipping & delivery', href: '/policies/shipping' }],
    related: ['What does delivery cost?', 'Track my order'],
  },
  {
    id: 'delivery',
    pattern: /\b(deliver\w*|pincode|pin code|zip|my area|location|bengaluru|bangalore|how (long|soon|fast))\b/,
    text: 'We deliver to selected pincodes in Bengaluru. Check yours to see whether we reach you, what delivery costs and how soon it usually arrives.',
    links: [
      { label: 'Check my pincode', href: '/#delivery' },
      { label: 'Delivery FAQ', href: '/faq' },
    ],
    related: ['What does delivery cost?', 'When do you deliver?'],
  },
  {
    id: 'offers',
    pattern: /\b(promo\w*|coupons?|discount\w*|offers?|deals?|sale|codes?|cheaper)\b/,
    text: 'Ramadan Specials are on offer right now: the regular price is shown crossed out next to what you pay. If you have a promo code, enter it at checkout; one code per order, and checkout shows the saving before you pay.',
    links: [
      { label: 'See Ramadan Specials', href: '/products?category=ramadan' },
      { label: 'Offer rules', href: '/policies/promotions' },
    ],
    related: ['What does delivery cost?'],
  },
  {
    id: 'allergens',
    pattern: /\b(allerg\w*|nuts?|peanuts?|lactose|dairy free|gluten|vegan|ingredients?)\b/,
    text: 'Every product page lists its ingredients and allergens, so please check it before you order. Milk is in the lassi, chaas, milkshakes, milk and ice cream, and the dry fruit milkshake has almonds, cashews and pistachios. If you have a severe allergy, contact us first.',
    links: [{ label: 'Food safety & allergens', href: '/policies/food-safety' }],
    related: ['How should I store the fruit?', 'Talk to a person'],
  },
  {
    id: 'storage',
    pattern: /\b(store|storage|fridge|refrigerat\w*|freez\w*|shelf life|expir\w*|how long (does|do|will|can) .{0,25}(last|keep|stay))\b/,
    text: 'Put cut fruit and drinks in the fridge (below 4°C) as soon as they arrive, and ice cream in the freezer. Each product page shows its shelf life and storage note.',
    links: [{ label: 'Food safety & storage', href: '/policies/food-safety' }],
    related: ['Is the fruit hygienic?'],
  },
  {
    id: 'hygiene',
    pattern: /\b(hygien\w*|preservatives?|clean|wash\w*|packed|packing|packaging)\b/,
    text: 'Every order is freshly cut and packed hygienically, with zero preservatives, so it reaches you fresh.',
    links: [{ label: 'Read the FAQ', href: '/faq' }],
    related: ['How should I store the fruit?'],
  },
  {
    id: 'health',
    pattern: /\b(healthy|health|benefits?|nutrition\w*|calories?|vitamins?|diabet\w*|sugar|weight|protein)\b/,
    text: 'Our "Why fruit every day" section explains what each fruit and drink brings, and each product page lists its own notes. It’s general information, not medical advice: if you have diabetes or another condition, ask your doctor what suits you.',
    links: [
      { label: 'Why fruit every day', href: '/#benefits' },
      { label: 'Health information', href: '/policies/health-disclaimer' },
    ],
    related: ['Show me Ramadan specials'],
  },
  {
    id: 'organic',
    pattern: /\b(organic|pesticides?|chemicals?|where .{0,20}(grown|from)|farms?|sourc\w*)\b/,
    text: 'Each product page says where its fruit comes from. For anything more about how a product is grown, please ask us directly and we’ll find out.',
    links: [{ label: 'Contact us', href: '/contact' }],
    related: ['Is the fruit hygienic?'],
  },
  {
    id: 'bulk',
    pattern: /\b(bulk|corporate|office|party|parties|events?|gift\w*|wholesale|large order)\b/,
    text: 'We’d love to help with bulk, office or gifting orders. Send us a message on the Contact page and choose "Bulk, gifting or office orders", with the date, address and roughly how many people.',
    links: [{ label: 'Contact us', href: '/contact' }],
    related: ['Talk to a person'],
  },
  {
    id: 'privacy',
    pattern: /\b(delete (my )?(data|account)|close (my )?account|privacy|personal (data|information)|my data)\b/,
    text: 'You can delete your data yourself with "Delete my data" on your account page. The privacy page explains what we keep and why.',
    links: [
      { label: 'My account', href: '/account' },
      { label: 'Privacy', href: '/privacy' },
    ],
    related: [],
  },
  {
    id: 'account',
    pattern: /\b(sign ?in|sign ?up|log ?in|register|account|guest|password)\b/,
    text: 'You can check out as a guest, or sign in so your orders follow you to any device. Your account page shows your orders.',
    links: [
      { label: 'Sign in', href: '/login' },
      { label: 'My account', href: '/account' },
    ],
    related: ['Track my order', 'How do I delete my data?'],
  },
  {
    id: 'human',
    pattern: /\b(human|person|agent|call|phone|email|contact|support|complain\w*|whatsapp|talk to)\b/,
    text: 'Happy to get you to a person. Our support team reads every message, and the Contact page has every way to reach us.',
    links: [
      { label: 'Contact us', href: '/contact' },
      { label: 'Read the FAQ', href: '/faq' },
    ],
    emailSupport: true, // adds an "Email support" button using BUSINESS.supportEmail
    related: [],
  },
];

// Follow-up questions offered as chips (`related` above) that are not SUGGESTIONS. Listed so the tests can check that
// every chip is answered instantly, without the AI.
export const RELATED_QUESTIONS = [
  'When do you deliver?',
  'Talk to a person',
  'Which payment methods do you accept?',
  'Do you have any offers?',
  'How should I store the fruit?',
  'Is the fruit hygienic?',
  'How do I delete my data?',
];

// Words people use that mean one of the shop's categories, so "something for the gym" finds the Fitness boxes.
export const SYNONYMS = {
  gym: 'fitness',
  workout: 'fitness',
  iftar: 'ramadan',
  suhoor: 'ramadan',
  sehri: 'ramadan',
  immune: 'immunity',
  season: 'seasonal',
  exotic: 'exotics',
  drink: 'beverages',
  juice: 'beverages',
  combo: 'combos',
};

export const PRODUCT_INTRO = 'Here are some that match:';

// When nothing matched and the AI could not be reached.
export const FALLBACK = {
  text: "I couldn't answer that one right now. These pages should help, or try one of the questions below.",
  links: [
    { label: 'Shop everything', href: '/products' },
    { label: 'Read the FAQ', href: '/faq' },
    { label: 'Contact us', href: '/contact' },
  ],
};
