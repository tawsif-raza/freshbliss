// The words on the home page, in one place, so the shop owner can change them without touching code.
//
// REVIEW BEFORE LAUNCH: these are the claims customers read and the shop is held to (delivery in an
// hour, hygiene, no preservatives, the FAQ answers). Make sure every one is true for the business as
// it really runs. See docs/GO_LIVE.md.

// ---------- the hero ----------

// The visitor can flip between these. Each can send them to a category of boxes below.
export const HERO_MODES = {
  everyday: {
    id: 'everyday',
    label: 'Everyday Fresh',
    eyebrow: 'Freshness delivered',
    headline: 'Fresh fruit boxes, at your door in an hour.',
    body: 'Freshly sliced. Perfectly packed. Always. Order a box in a minute and we bring it across Bengaluru.',
    primary: { label: 'Shop fresh boxes', category: 'fresh' },
    secondary: { label: 'Fitness packs', category: 'fitness' },
  },
  ramadan: {
    id: 'ramadan',
    label: 'Ramadan Special',
    eyebrow: 'Ramadan Special',
    headline: 'Open your fast with something fresh.',
    body: 'Special boxes for iftar and suhoor, freshly packed and delivered to your door.',
    primary: { label: 'Shop Ramadan boxes', category: 'ramadan' },
    secondary: { label: 'See everything', category: 'all' },
  },
};
export const DEFAULT_HERO_MODE = 'everyday';

export const TRUST_BADGES = ['1-Hour Delivery in Bengaluru', 'Fresh & Hygienic', 'Zero Preservatives'];

// ---------- the category tabs ----------

// `category` is the value of a product's `category` field in Firestore. A tab with no products shows
// a friendly message instead of an empty grid.
export const CATEGORIES = [
  { id: 'all', label: 'All', category: null },
  { id: 'fresh', label: 'Fresh Boxes', category: 'Fresh' },
  { id: 'fitness', label: 'Fitness Packs', category: 'Fitness' },
  { id: 'ramadan', label: 'Ramadan Specials', category: 'Ramadan' },
  { id: 'combos', label: 'Combos', category: 'Combos' },
];

export const FEATURED_LIMIT = 8; // boxes shown on the home page before "See all boxes"

// ---------- the three pillars (the "Farm-to-Table" story on the home page) ----------

// Each is a promise customers will hold the shop to, so check every one is true. The icons are chosen in
// components/TrustStory.js by `id`.
export const TRUST_STORY = {
  eyebrow: 'Farm to table',
  title: 'Fresh from the first pick to your door',
  intro: 'Three promises we keep with every box.',
};

export const TRUST_PILLARS = [
  { id: 'handpicked', title: 'Handpicked Daily', text: 'Our fruit is picked fresh every day, so only the best goes into your box.' },
  { id: 'preservatives', title: 'Zero Preservatives', text: 'Just fruit. Nothing is added to make it last longer, so you taste the fruit itself.' },
  { id: 'chilled', title: 'Chilled Delivery', text: 'Your box is delivered chilled, so it arrives crisp and ready to eat.' },
];

// ---------- reviews ----------

// Real customer reviews go here, with the customer's permission. Each entry:
//   { name: 'Asha R.', area: 'Indiranagar', quote: 'What they actually said.' }
//
// NEVER put invented reviews on a live shop. The entries below are PLACEHOLDERS, marked `sample: true`
// so the layout can be seen while developing. In production a sample is never shown, and when there
// are no real reviews the whole section is hidden.
export const TESTIMONIALS = [
  { name: 'Customer name', area: 'Area', quote: 'A real customer review goes here.', sample: true },
  { name: 'Customer name', area: 'Area', quote: 'A real customer review goes here.', sample: true },
  { name: 'Customer name', area: 'Area', quote: 'A real customer review goes here.', sample: true },
];

// ---------- questions ----------

// `zones` is the list of live delivery zones (from Firestore) so the answer is always current.
export function buildFaq(zones) {
  const zoneLines = zones.map((z) => {
    const eta = z.etaMin !== null && z.etaMax !== null ? `${z.etaMin} to ${z.etaMax} minutes` : '';
    return `${z.name}: ${z.fee === 0 ? 'free delivery' : `₹${z.fee} delivery`}${eta ? `, usually ${eta}` : ''}.`;
  });
  return [
    {
      id: 'hygiene',
      question: 'How is my box packed, and is it hygienic?',
      answer:
        'Every box is freshly cut and packed hygienically, with zero preservatives, so it reaches you fresh.',
    },
    {
      id: 'zones',
      question: 'Where do you deliver, and what does it cost?',
      answer:
        zoneLines.length > 0
          ? `We deliver to selected pincodes in Bengaluru. ${zoneLines.join(' ')} Enter your pincode at checkout to see your exact fee before you pay.`
          : 'We deliver to selected pincodes in Bengaluru. Enter your pincode at checkout to see your exact delivery fee before you pay.',
    },
    {
      id: 'time',
      question: 'How fast will my order arrive?',
      answer: 'We aim to deliver within the hour. You can follow your order live, from the moment it is confirmed to the moment it is at your door.',
    },
    {
      id: 'pay',
      question: 'How do I pay?',
      answer: 'Online, securely through Razorpay. You see the full total, including delivery and any tip, before you pay.',
    },
  ];
}
