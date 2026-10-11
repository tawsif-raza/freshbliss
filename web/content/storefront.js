// The words on the home page, in one place, so the shop owner can change them without touching code.
//
// REVIEW BEFORE LAUNCH: these are the claims customers read and the shop is held to (delivery in an
// hour, hygiene, no preservatives, the FAQ answers). Make sure every one is true for the business as
// it really runs. See docs/GO_LIVE.md.

import { ROOTS_IMAGE } from '../lib/images.js'; // relative on purpose: the tests load this file in plain Node, which does not know the @/ alias

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
    body: 'Dates, fresh fruit and chilled drinks for iftar and suhoor, at special Ramadan prices, delivered to your door.',
    primary: { label: 'Shop Ramadan specials', category: 'ramadan' },
    secondary: { label: 'See everything', category: 'all' },
  },
};
export const DEFAULT_HERO_MODE = 'everyday';

export const TRUST_BADGES = ['1-Hour Delivery in Bengaluru', 'Fresh & Hygienic', 'Zero Preservatives'];

// ---------- the category tabs ----------

// `categories` lists the values of a product's `category` field in Firestore that the tab shows (one tab can
// cover several: see lib/categories.js). "All" has none. A tab with no products shows a friendly message
// instead of an empty grid.
export const CATEGORIES = [
  { id: 'all', label: 'All', categories: [] },
  { id: 'fresh', label: 'Fresh Boxes', categories: ['Fresh'] },
  { id: 'fitness', label: 'Fitness Packs', categories: ['Fitness'] },
  { id: 'ramadan', label: 'Ramadan Specials', categories: ['Ramadan', 'Ramadan Fruits', 'Ramadan Drinks'] },
  { id: 'exotics', label: 'Exotics', categories: ['Exotics'] },
  { id: 'immunity', label: 'Immunity', categories: ['Immunity'] },
  { id: 'seasonal', label: 'Seasonal', categories: ['Seasonal'] },
  { id: 'chilled', label: 'Chilled & Dairy', categories: ['Ice Cream', 'Dairy', 'Cut Fruits'] },
  { id: 'beverages', label: 'Beverages', categories: ['Beverages'] },
  { id: 'combos', label: 'Combos', categories: ['Combos'] },
];

export const FEATURED_LIMIT = 8; // boxes the home page's "All" tab shows before "See all boxes" (a category tab shows all of its own)

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

// ---------- free delivery ----------

// The subtotal (whole rupees) at which the cart's progress bar says delivery is free. It is a PREVIEW message only:
// the server decides the real fee per delivery zone (a zone's `freeDeliveryFrom`, firebase/functions/createCheckout.js).
// REVIEW BEFORE LAUNCH: keep this equal to `freeDeliveryFrom` on the zones that charge a fee, and to the ₹499 wording in
// the ticker below and in the FAQ (pages/faq.js), or the bar will promise something checkout does not give.
export const FREE_DELIVERY_THRESHOLD = 499;

// ---------- the ticker under the banner ----------

// REVIEW BEFORE LAUNCH: each line is a promise, so make sure it is true. In particular, check the free
// delivery line against the delivery zones (Zone B charges a fee today) and the rating against real reviews.
// The icons are chosen in components/Marquee.js by `id` (the design rules allow no emoji). There is no "average rating" line
// on purpose: it would be a number with no real reviews behind it. "Pick your delivery window" is a feature the checkout has.
export const MARQUEE_ITEMS = [
  { id: 'organic', text: '100% Organic & Pesticide-Free' },
  { id: 'delivery', text: 'Free Bengaluru Delivery over ₹499' },
  { id: 'farm', text: 'Farm to Doorstep in 12 Hours' },
  { id: 'windows', text: 'Pick your delivery window' },
];

// ---------- how it works ----------

// The four steps of an order, on the home page (components/HowItWorks.js). Each describes what the shop really does today
// (check against pages/checkout, pages/orders and firebase/functions before changing a word). Icons are chosen there by `id`.
export const HOW_IT_WORKS = {
  eyebrow: 'How it works',
  title: 'From the box to your door in four steps',
  intro: 'No account needed to start. You see every price before you pay.',
  steps: [
    { id: 'choose', title: 'Choose your box', text: 'Pick a box and a size, and add it to your cart. Chilled boxes say how they must be kept.' },
    { id: 'slot', title: 'Pick when it arrives', text: 'Enter your pincode to see the delivery fee, then choose as soon as possible or a delivery window today or tomorrow.' },
    { id: 'pay', title: 'Pay securely online', text: 'Pay through Razorpay. The total, with delivery and any tip, is on the Pay button before you tap it.' },
    { id: 'track', title: 'Follow it live', text: 'Watch your order move from confirmed to out for delivery. You can cancel until it is packed.' },
  ],
};

// ---------- why FreshBliss (features) ----------

// What the shop does for the customer, as plain facts. No numbers and no promises about speed beyond what the rest of the site
// already says. Icons are chosen in components/WhyFreshBliss.js by `id`.
export const WHY_FRESHBLISS = {
  eyebrow: 'Made easy',
  title: 'Everything a good fruit order needs',
  intro: 'Small things that make ordering and receiving easier.',
  items: [
    { id: 'tracking', title: 'Live order tracking', text: 'See each step as it happens, without refreshing the page.' },
    { id: 'windows', title: 'Delivery windows', text: 'Choose a window that suits you, today or tomorrow, or ask for it as soon as possible.' },
    { id: 'cancel', title: 'Cancel until packed', text: 'Change your mind before your box is packed and cancel it yourself. The refund goes back to how you paid.' },
    { id: 'secure', title: 'Secure payments', text: 'You pay online through Razorpay. Prices are checked by our server, never by your browser.' },
    { id: 'reorder', title: 'Reorder in one tap', text: 'Sign in once and put a favourite box back in your cart from My orders.' },
    { id: 'storage', title: 'Clear storage labels', text: 'Chilled and frozen boxes show the temperature they must be kept at, so nothing is a surprise.' },
  ],
};

// ---------- the closing call to action ----------

export const FINAL_CTA = {
  eyebrow: 'Ready when you are',
  title: 'Your next box is a minute away',
  text: 'Choose a box, pick a time and follow it to your door.',
};

// ---------- our roots ----------

// The photo is a placeholder from lib/images.js (a basket of fruit); the caption says what it shows, not where it came from.
export const OUR_ROOTS = {
  eyebrow: 'Our roots',
  title: 'Sourced with Purpose',
  text: 'We partner directly with independent farmers across Karnataka and Maharashtra to bring you produce that actually tastes like nature intended.',
  image: ROOTS_IMAGE,
  imageAlt: 'A basket of fresh fruit: grapes, mango, kiwi, pineapple and plums',
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
