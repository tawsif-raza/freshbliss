// The privacy page, in plain words. Each statement below describes what this shop's systems actually do,
// as built (the code, the database rules and the order spreadsheet), so it stays true.
//
// REVIEW BEFORE LAUNCH: this describes the data practices; it is not legal advice. Have a lawyer or the
// business's advisor read it, and add anything the business does that the code does not show (how long
// records are kept, who the delivery partners are, a grievance contact). See docs/GO_LIVE.md, section 8.3.
// If any of the system changes (an analytics tool, a new payment provider), change this at the same time.

export const PRIVACY_UPDATED = '3 October 2026';

// `sections` is rendered in order. Each has a title and a list of paragraphs or bullet lists.
export const PRIVACY_SECTIONS = [
  {
    id: 'collect',
    title: 'What we collect',
    items: [
      { type: 'p', text: 'We collect only what we need to take and deliver your order:' },
      {
        type: 'ul',
        items: [
          'Your delivery address, pincode and any delivery instructions you type.',
          'What you ordered, the prices, the delivery fee, any tip and promo code, and when you ordered.',
          'A payment reference (an ID from Razorpay, our payment provider). We do not see or store your card, UPI or bank details.',
          'An anonymous account ID. Your browser creates it the first time you start a checkout, so that your cart and your orders belong to you. There is no name, email or password yet.',
        ],
      },
    ],
  },
  {
    id: 'location',
    title: 'Your location (only if you choose)',
    items: [
      {
        type: 'p',
        text: 'On the checkout page, "Use Current Location" is optional. If you press it, your browser asks your permission, and then your position is sent from your browser to OpenStreetMap (the free Nominatim service) to look up the nearest road, area and pincode. Those are put into the address boxes for you to check and change. We do not receive, store or keep your coordinates. OpenStreetMap handles that request under its own privacy policy. If you do not press the button, nothing is sent.',
      },
    ],
  },
  {
    id: 'browser',
    title: 'What stays in your browser',
    items: [
      { type: 'p', text: 'Your cart, your wishlist and the pincode you checked are saved in your own browser so they are still there when you come back. Clearing your browser data removes them, and also hides your past orders, because they are tied to that browser.' },
      { type: 'p', text: 'This site does not load analytics or advertising scripts. When you open the payment window, it is run by Razorpay and is covered by Razorpay’s own privacy policy.' },
    ],
  },
  {
    id: 'use',
    title: 'How we use it',
    items: [
      {
        type: 'ul',
        items: [
          'To confirm, prepare and deliver your order, and to show you its status as it moves.',
          'To take your payment through Razorpay and to refund it if an order is cancelled.',
          'To keep a record of orders for the shop’s own accounts and reporting.',
        ],
      },
      { type: 'p', text: 'We do not sell your information.' },
    ],
  },
  {
    id: 'where',
    title: 'Where it is kept, and who can see it',
    items: [
      {
        type: 'ul',
        items: [
          'Orders and carts are stored in Google’s Firebase (Cloud Firestore), in Mumbai, India. The database rules let you read only your own orders.',
          'Our staff can see orders so that they can prepare and deliver them.',
          'A copy of each order (items, totals, address, status) is kept in a private spreadsheet in Amazon Web Services storage, for the shop’s reporting. It is not public, and only staff can download it.',
          'Razorpay processes your payment under its own terms.',
        ],
      },
    ],
  },
];
