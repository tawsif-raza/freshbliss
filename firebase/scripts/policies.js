'use strict';

// The `policies` collection: every policy the website shows, one document each, so the wording can live in the
// database instead of in code. scripts/seed.js writes it to the LOCAL EMULATOR ONLY (never with --remote).
//
// Two kinds of document:
//   - Terms, Cancellation & Refunds, Privacy: the real drafts, read from web/content/policies.js and privacy.js
//     (builtInPolicies), so the database and the pages' built-in copy say the same thing. placeholder: false.
//   - Everything in buildPolicies(): DUMMY TEXT for development, written to be close to how the shop works so the
//     pages look realistic, but never reviewed. placeholder: true. The website labels these "Placeholder text, not in
//     force" and hides them from search engines. Before any of them goes live, the business and an advisor must rewrite
//     it, and the document must be saved with placeholder: false. Anything in [square brackets] is a decision only the
//     business can make.
//
// One document:
//   title, kicker, description, lead   the page's heading, the small line above it, the search snippet and the intro
//   updated                            "11 October 2026": the "Last updated" date shown on the page
//   order                              position in the /policies list
//   placeholder                        true = dummy text, not in force
//   active                             false hides it everywhere
//   sections                           [{ id, title, items: [{ type: 'p', text } | { type: 'ul', items: [text, ...] }] }]
//                                      (the same shape as web/content/policies.js; Firestore allows the list inside a map)

const path = require('node:path');
const { pathToFileURL } = require('node:url');

const UPDATED = '11 October 2026';
const p = (text) => ({ type: 'p', text });
const ul = (...items) => ({ type: 'ul', items });

const placeholder = (order, policy) => ({ ...policy, order, updated: UPDATED, placeholder: true, active: true });

function buildPolicies() {
  return [
    placeholder(10, {
      id: 'shipping',
      title: 'Shipping & Delivery Policy',
      kicker: 'Getting your order to you',
      description: 'Where FreshBliss delivers, delivery windows, fees and what happens if nobody is home.',
      lead: 'Where we deliver, when, and what it costs.',
      sections: [
        {
          id: 'areas',
          title: 'Where we deliver',
          items: [
            p('We deliver within Bengaluru only. Checkout checks your pincode and tells you straight away whether we reach it.'),
            ul(
              'Zone A (central Bengaluru pincodes): delivery is free on every order.',
              'Zone B (the rest of the Bengaluru pincodes we serve): a flat ₹30, free on orders of ₹499 or more.',
              'If your pincode is not served yet, you cannot place an order for it. [Add how customers can ask for a new area.]',
            ),
          ],
        },
        {
          id: 'windows',
          title: 'Delivery windows',
          items: [
            p('You choose a two-hour delivery window at checkout, between 9 am and 9 pm. A window can be booked until 90 minutes before it starts, so we have time to cut, pack and chill your order.'),
            p('We aim to arrive within the window you chose. Traffic and weather in Bengaluru can occasionally make us late; if that happens we will tell you on your order page. [Decide whether a late delivery earns a credit.]'),
          ],
        },
        {
          id: 'handover',
          title: 'Handing over your order',
          items: [
            ul(
              'Please make sure someone can receive the order at the address you gave. Chilled and frozen products cannot be left unattended.',
              'Delivery instructions you type at checkout (gate code, landmark, floor) are shown to our delivery partner.',
              '[Decide what happens if nobody is home: a second attempt, a call, or a cancellation with or without a refund.]',
            ),
          ],
        },
        {
          id: 'cold-chain',
          title: 'Chilled and frozen products',
          items: [p('Ice cream, milk, juices and drinks travel in insulated bags. Put them in the fridge or freezer as soon as they arrive; the storage note on each product page says how.')],
        },
        {
          id: 'tracking',
          title: 'Following your order',
          items: [p('Your order page shows each step: preparing, out for delivery and delivered. You can open it from My orders at any time.')],
        },
      ],
    }),

    placeholder(20, {
      id: 'payments',
      title: 'Payments & Pricing',
      kicker: 'Paying for your order',
      description: 'How prices are worked out at FreshBliss and how payment works.',
      lead: 'How we price your order and take payment.',
      sections: [
        {
          id: 'prices',
          title: 'Prices',
          items: [
            ul(
              'All prices are in Indian rupees. The price you pay is the one shown at checkout, worked out by our server when you pay.',
              'Larger sizes cost more by the amount shown next to each size.',
              'Delivery fee, an optional tip and any promo discount are shown as separate lines before you pay.',
              '[Tax: decide with your accountant whether prices include GST, and whether a tax invoice is issued.]',
            ),
          ],
        },
        {
          id: 'methods',
          title: 'How you pay',
          items: [
            p('Payments are handled by Razorpay, our payment provider. You pay on Razorpay’s secure screen; we never see or store your card, UPI or bank details.'),
            p('We do not offer cash on delivery. [Change this only if the business decides to offer it.]'),
          ],
        },
        {
          id: 'confirmation',
          title: 'When an order counts as placed',
          items: [p('An order is confirmed only after Razorpay confirms your payment to us. If a payment fails or is interrupted, no order is placed, and any amount taken is returned by Razorpay.')],
        },
        {
          id: 'errors',
          title: 'Pricing mistakes',
          items: [p('If a product is shown at a clearly wrong price, we may cancel the order and refund the full amount before it is packed. We will tell you why. [Have your advisor confirm this wording.]')],
        },
      ],
    }),

    placeholder(30, {
      id: 'promotions',
      title: 'Offers & Promo Codes',
      kicker: 'Discounts',
      description: 'How FreshBliss promo codes and special prices work.',
      lead: 'How our promo codes and special prices work.',
      sections: [
        {
          id: 'codes',
          title: 'Promo codes',
          items: [
            ul(
              'A promo code takes a percentage or a fixed amount off your items. Checkout shows the saving before you pay.',
              'Each code can have a minimum order value, an end date, a limit on total uses and a limit of one use per customer. Checkout says so if a code cannot be used.',
              'Only one code can be used per order. Codes cannot be exchanged for cash.',
              'If a code reaches its limit while you are paying, we cancel the order and refund you in full, and you can order again without the code.',
            ),
          ],
        },
        {
          id: 'special-prices',
          title: 'Special prices',
          items: [p('During an offer (for example our Ramadan prices) the regular price is shown crossed out next to the price you pay. The regular price is what the product costs outside the offer. Offers end on the date we announce, or when stock runs out. [Add the end date of each offer.]')],
        },
        {
          id: 'changes',
          title: 'Changing or ending an offer',
          items: [p('We may change or end an offer at any time, but never for an order that is already paid.')],
        },
      ],
    }),

    placeholder(40, {
      id: 'food-safety',
      title: 'Food Safety, Allergens & Storage',
      kicker: 'What is in your food',
      description: 'How FreshBliss prepares food, allergen information and how to store your order.',
      lead: 'How we prepare your food, and how to keep it fresh.',
      sections: [
        {
          id: 'preparation',
          title: 'How we prepare your order',
          items: [p('Fruit is washed, cut and packed in our kitchen on the day of delivery. [Add your kitchen’s FSSAI licence number to content/business.js; it is then shown on every receipt and in the footer.]')],
        },
        {
          id: 'allergens',
          title: 'Allergens',
          items: [
            p('Each product page lists its ingredients and allergens. Please read them before you order.'),
            ul(
              'Milk: lassi, chaas, milkshakes, milk, ice cream.',
              'Tree nuts: the dry fruit milkshake (almonds, cashews, pistachios).',
              'Our kitchen also handles milk and nuts, so we cannot promise any product is free of traces. [Confirm with your kitchen.]',
            ),
          ],
        },
        {
          id: 'storage',
          title: 'Storing your order',
          items: [
            ul(
              'Cut fruit and drinks: refrigerate below 4°C and eat within the shelf life shown on the product page.',
              'Ice cream: keep frozen at -18°C.',
              'Whole fruit such as bananas and mangoes: keep at room temperature until ripe.',
            ),
          ],
        },
        {
          id: 'problem',
          title: 'If something is wrong with your food',
          items: [p('Do not eat it. Contact us with your order number and a photo, and we will look into it. [Decide the window for reporting a problem, and make the FAQ and the refund policy say the same.]')],
        },
      ],
    }),

    placeholder(50, {
      id: 'health-disclaimer',
      title: 'Health & Nutrition Information',
      kicker: 'Good to know',
      description: 'How to read the health and nutrition information on the FreshBliss website.',
      lead: 'What our nutrition notes mean, and what they do not.',
      sections: [
        {
          id: 'general',
          title: 'General information only',
          items: [p('The nutrition notes on our website, including the "Why fruit every day" section and the benefits on each product, are general information about fruit and drinks. They are not medical advice and do not replace advice from your doctor or a dietitian.')],
        },
        {
          id: 'figures',
          title: 'Nutrition figures',
          items: [p('Calorie and nutrition figures are typical reference values for the fruit, not laboratory measurements of your box. Fruit varies naturally in size, ripeness and sweetness.')],
        },
        {
          id: 'conditions',
          title: 'If you have a health condition',
          items: [p('If you have diabetes or kidney disease, are pregnant, or follow a special diet, ask your doctor which products suit you. Shakes, lassi, sharbat and juices contain sugar.')],
        },
      ],
    }),

    placeholder(60, {
      id: 'cookies',
      title: 'Cookies & Browser Storage',
      kicker: 'Your browser',
      description: 'What the FreshBliss website stores in your browser, and why.',
      lead: 'What our website keeps in your browser, and why.',
      sections: [
        {
          id: 'what',
          title: 'What we store',
          items: [
            ul(
              'Your cart and wishlist, so they are still there when you come back.',
              'A sign-in session from Firebase Authentication, so you stay signed in (or a guest ID if you check out as a guest).',
              'Razorpay’s payment screen may set its own cookies while you pay; see Razorpay’s privacy policy.',
            ),
          ],
        },
        {
          id: 'not',
          title: 'What we do not use',
          items: [p('We do not use advertising or analytics cookies today. If that changes, this page and the privacy page will be updated first. [Keep this true.]')],
        },
        {
          id: 'control',
          title: 'Your choices',
          items: [p('You can clear this storage in your browser’s settings at any time. Your cart and wishlist will then be emptied, and you will need to sign in again.')],
        },
      ],
    }),

    placeholder(70, {
      id: 'data-retention',
      title: 'Data Retention & Deletion',
      kicker: 'Your information',
      description: 'How long FreshBliss keeps your information and how to have it deleted.',
      lead: 'How long we keep your information, and how to have it removed.',
      sections: [
        {
          id: 'how-long',
          title: 'How long we keep it',
          items: [
            ul(
              'Orders and payment references: [number] years, because tax and accounting law requires it. [Confirm with your accountant.]',
              'Your cart and wishlist: until you empty them or delete your data.',
              'Messages you send us: [number] months.',
            ),
          ],
        },
        {
          id: 'delete',
          title: 'Deleting your data',
          items: [p('Use "Delete my data" on the account page. It erases your personal details, closes your account and clears the cart and wishlist kept in your browser. Paid orders and payment records are kept for our accounts, with your name, phone and address removed from them. It waits until no order of yours is still on the way. You can also write to us and we will do it for you.')],
        },
        {
          id: 'law',
          title: 'Your rights',
          items: [p('Under India’s Digital Personal Data Protection Act, 2023 you can ask what we hold about you, ask us to correct it, or ask us to erase it. [Have your advisor review this section.]')],
        },
      ],
    }),

    placeholder(80, {
      id: 'grievance',
      title: 'Grievance Redressal',
      kicker: 'Complaints',
      description: 'How to raise a complaint with FreshBliss and how it is handled.',
      lead: 'How to raise a complaint, and what happens next.',
      sections: [
        {
          id: 'officer',
          title: 'Grievance Officer',
          items: [
            p('As required for online sellers in India, we have a Grievance Officer:'),
            ul('Name: [to be appointed]', 'Email: [grievance email address]', 'Phone: [phone number]', 'Address: [registered address]'),
          ],
        },
        {
          id: 'process',
          title: 'How we handle a complaint',
          items: [
            ul(
              'Write to us with your order number and what went wrong.',
              'We acknowledge every complaint within [48 hours].',
              'We aim to resolve it within [one month] and tell you the outcome in writing.',
            ),
          ],
        },
        {
          id: 'escalate',
          title: 'If you are not satisfied',
          items: [p('You can contact the National Consumer Helpline (dial 1915) or file a complaint on the government’s e-Daakhil portal. [Have your advisor confirm these details.]')],
        },
      ],
    }),

    placeholder(90, {
      id: 'acceptable-use',
      title: 'Acceptable Use',
      kicker: 'Using our website',
      description: 'The rules for using the FreshBliss website.',
      lead: 'A few rules that keep the shop working for everyone.',
      sections: [
        {
          id: 'dont',
          title: 'Please do not',
          items: [
            ul(
              'Place orders you do not intend to pay for or receive.',
              'Use automated tools to scrape the website or place orders.',
              'Try to get around promo-code limits, for example with many accounts.',
              'Interfere with the website’s security or other customers’ accounts.',
            ),
          ],
        },
        {
          id: 'limits',
          title: 'Limits we apply',
          items: [p('To protect the shop we limit how often orders and other actions can be made from one device or account. If you hit a limit, wait a little and try again.')],
        },
        {
          id: 'action',
          title: 'What we may do',
          items: [p('If an account breaks these rules we may cancel its orders (with a full refund of anything paid) and block it. [Have your advisor review this section.]')],
        },
      ],
    }),

    placeholder(100, {
      id: 'accessibility',
      title: 'Accessibility Statement',
      kicker: 'For everyone',
      description: 'How FreshBliss makes its website usable for everyone.',
      lead: 'We want everyone to be able to order from us.',
      sections: [
        {
          id: 'aim',
          title: 'What we aim for',
          items: [p('We design the website to meet the Web Content Accessibility Guidelines (WCAG) 2.1 at level AA: it works with a keyboard and a screen reader, text has enough contrast, and motion stops if your device asks for less motion.')],
        },
        {
          id: 'known',
          title: 'Known gaps',
          items: [p('[List any parts of the website that are not yet fully accessible.]')],
        },
        {
          id: 'feedback',
          title: 'Tell us',
          items: [p('If anything on the website is hard to use, contact us and tell us what you were trying to do. We will help you place your order another way.')],
        },
      ],
    }),

    placeholder(110, {
      id: 'bulk-orders',
      title: 'Bulk & Corporate Orders',
      kicker: 'Offices and events',
      description: 'Terms for bulk, gifting and office orders from FreshBliss.',
      lead: 'Fruit for offices, events and gifting.',
      sections: [
        {
          id: 'how',
          title: 'How to order',
          items: [p('For orders larger than the website allows, contact us through the Contact Us page and choose "Bulk, gifting or office orders". Tell us the date, the address and roughly how many people.')],
        },
        {
          id: 'terms',
          title: 'Terms for bulk orders',
          items: [
            ul(
              'We confirm the price and the delivery time in writing before you pay.',
              '[Notice needed: for example, two days before delivery.]',
              '[Cancellation: decide until when a bulk order can be cancelled, and what is refunded.]',
            ),
          ],
        },
      ],
    }),
  ];
}

// Terms, Cancellation & Refunds and Privacy: the real drafts from the website's own content files.
async function builtInPolicies() {
  const load = (file) => import(pathToFileURL(path.join(__dirname, '../../web/content', file)).href);
  const [policies, privacy] = await Promise.all([load('policies.js'), load('privacy.js')]);
  const real = (order, updated, policy) => ({ ...policy, order, updated, placeholder: false, active: true });
  return [
    real(1, policies.POLICIES_UPDATED, {
      id: 'terms',
      title: 'Terms of Service',
      kicker: 'The small print',
      description: 'The terms for ordering fresh fruit boxes from FreshBliss.',
      lead: 'The terms for ordering from us, in plain words.',
      sections: policies.TERMS_SECTIONS,
    }),
    real(2, policies.POLICIES_UPDATED, {
      id: 'refunds',
      title: 'Cancellation & Refunds',
      kicker: 'If plans change',
      description: 'How to cancel a FreshBliss order and how refunds work.',
      lead: 'How to cancel an order, and how your money comes back.',
      sections: policies.REFUND_SECTIONS,
    }),
    real(3, privacy.PRIVACY_UPDATED, {
      id: 'privacy',
      title: 'Privacy',
      kicker: 'Your information',
      description: 'What FreshBliss collects when you order, why, and where it is kept.',
      lead: 'What we collect when you order, why, and where it is kept.',
      sections: privacy.PRIVACY_SECTIONS,
    }),
  ];
}

// Every policy for the emulator, in list order.
async function allPolicies() {
  return [...(await builtInPolicies()), ...buildPolicies()].sort((a, b) => a.order - b.order);
}

module.exports = { buildPolicies, builtInPolicies, allPolicies };
