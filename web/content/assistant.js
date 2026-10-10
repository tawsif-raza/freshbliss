// The words of the chat assistant (components/ChatAssistant.js), in one place, so they can change without touching code.
//
// For now the assistant has no backend: lib/assistant.js answers from the topics below and from the fruit boxes already
// loaded in the browser. When a real backend is chosen, only lib/assistant.js changes; these words stay the defaults.
//
// REVIEW BEFORE LAUNCH: every answer is a promise the shop is held to. Each one points to the page that holds the real
// details (the FAQ, the refund policy, the order page) rather than restating them, so they cannot drift apart.

export const ASSISTANT = {
  name: 'FreshBliss Assistant',
  status: 'Here to help',
  greeting: "Hi! I'm the FreshBliss assistant. Ask me about our fruit boxes, delivery, or an order you've placed.",
  suggestionsTitle: 'Try asking',
  placeholder: 'Ask about boxes, delivery, orders...',
  // Shown under the message box while there is no real backend.
  note: 'Preview assistant. For anything urgent, use the FAQ or email us.',
};

// The chips shown before the first message. Each is sent as if the visitor had typed it.
export const SUGGESTIONS = [
  'Track my order',
  'Show me fitness packs',
  'Do you deliver to my pincode?',
  "What's seasonal right now?",
  'How do I cancel or get a refund?',
];

// What the assistant recognises. The first topic whose pattern matches the message answers it, so the more specific
// topics come first ("cancel my order" is about cancelling, not tracking). `links` become buttons under the answer.
// Patterns see the message in lower case with apostrophes removed ("where's" arrives as "wheres").
export const TOPICS = [
  {
    id: 'cancel',
    pattern: /\b(cancel\w*|refund\w*|money back|return\w*|damaged|wrong item)\b/,
    text: 'If an order can still be cancelled, there is a Cancel button on its page under My orders. The refund policy explains when and how the money comes back.',
    links: [
      { label: 'My orders', href: '/account' },
      { label: 'Refund policy', href: '/refunds' },
    ],
  },
  {
    id: 'order',
    pattern: /\b(track\w*|order status|my orders?|where(s| is) my|delivered yet|arriv\w*)\b/,
    text: 'You can follow every order live, from the moment it is confirmed to the moment it reaches your door. Open it from My orders.',
    links: [{ label: 'My orders', href: '/account' }],
  },
  {
    id: 'delivery',
    pattern: /\b(deliver\w*|pincode|pin code|zip|my area|location|slots?|how (long|soon|fast))\b/,
    text: 'We deliver to selected pincodes in Bengaluru. Check yours on the home page to see whether we reach you and what delivery costs.',
    links: [
      { label: 'Check my pincode', href: '/#delivery' },
      { label: 'Delivery FAQ', href: '/faq' },
    ],
  },
  {
    id: 'payment',
    pattern: /\b(pay|paying|payment\w*|upi|card|cash|cod|razorpay)\b/,
    text: 'You pay online, securely through Razorpay, and you see the full total (delivery and any tip included) before you pay.',
    links: [{ label: 'Payment FAQ', href: '/faq' }],
  },
  {
    id: 'human',
    pattern: /\b(human|person|agent|call|phone|email|contact|support|complain\w*)\b/,
    text: 'Happy to get you to a person. Most questions are answered in the FAQ, and our support team reads every email.',
    links: [{ label: 'Read the FAQ', href: '/faq' }],
    emailSupport: true, // adds an "Email support" button using BUSINESS.supportEmail
  },
];

// Words people use that mean one of the shop's categories, so "something for the gym" finds the Fitness boxes.
export const SYNONYMS = {
  gym: 'fitness',
  workout: 'fitness',
  protein: 'fitness',
  iftar: 'ramadan',
  suhoor: 'ramadan',
  immune: 'immunity',
  season: 'seasonal',
  exotic: 'exotics',
  drink: 'beverages',
  juice: 'beverages',
  combo: 'combos',
};

export const PRODUCT_INTRO = 'Here are some boxes that match:';

// When nothing matched.
export const FALLBACK = {
  text: "I'm still learning, so I couldn't answer that one yet. These pages should help, or try one of the questions below.",
  links: [
    { label: 'Shop all boxes', href: '/products' },
    { label: 'Read the FAQ', href: '/faq' },
  ],
};
