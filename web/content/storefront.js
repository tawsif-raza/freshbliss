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
  { id: 'exotics', label: 'Exotics', category: 'Exotics' },
  { id: 'immunity', label: 'Immunity', category: 'Immunity' },
  { id: 'seasonal', label: 'Seasonal', category: 'Seasonal' },
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
//   { name: 'Asha R.', area: 'Indiranagar', quote: 'What they actually said.', avatar: 'photo link (optional)' }
//
// NEVER put invented reviews on a live shop. The entries below are PLACEHOLDERS, marked `sample: true`
// so the layout can be seen while developing. In production a sample is never shown, and when there
// are no real reviews the whole section is hidden.
export const TESTIMONIALS = [
  {
    name: 'Ananya R.',
    area: 'Indiranagar',
    quote: 'Tastes like the fruit stall I grew up next to. The mango was unreal.',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
    sample: true,
  },
  {
    name: 'Rohan M.',
    area: 'Koramangala',
    quote: 'Arrived chilled, cut fresh, and on time. My gym-bag staple now.',
    avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=150&q=80',
    sample: true,
  },
  {
    name: 'Priya S.',
    area: 'HSR Layout',
    quote: 'Finally a fruit box my kids finish. We have ordered every week since.',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80',
    sample: true,
  },
];

// ---------- the ticker under the banner ----------

// REVIEW BEFORE LAUNCH: each line is a promise, so make sure it is true. In particular, check the free
// delivery line against the delivery zones (Zone B charges a fee today) and the rating against real reviews.
export const MARQUEE_ITEMS = [
  '🌿 100% Organic & Pesticide-Free',
  '🚚 Free Bengaluru Delivery over ₹500',
  '👨‍🌾 Farm to Doorstep in 12 Hours',
  '⭐ 4.9/5 Average Rating',
];

// ---------- our roots ----------

export const OUR_ROOTS = {
  eyebrow: 'Our roots',
  title: 'Sourced with Purpose',
  text: 'We partner directly with independent farmers across Karnataka and Maharashtra to bring you produce that actually tastes like nature intended.',
  image: 'https://images.unsplash.com/photo-1595841696677-6489ff3f8cd1?auto=format&fit=crop&w=1200&q=80',
  imageAlt: 'Fresh produce from one of our partner farms',
};

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
