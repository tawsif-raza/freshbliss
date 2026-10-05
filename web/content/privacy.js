// The privacy page, in plain words. Each statement below describes what this shop's systems actually do,
// as built (the code, the database rules and the order spreadsheet), so it stays true.
//
// REVIEW BEFORE LAUNCH: this describes the data practices; it is not legal advice. Have a lawyer or the
// business's advisor read it, and add anything the business does that the code does not show (how long
// records are kept, who the delivery partners are, a grievance contact). See docs/GO_LIVE.md, section 8.3.
// If any of the system changes (an analytics tool, a new payment provider), change this at the same time.

export const PRIVACY_UPDATED = '5 October 2026';

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
          'An account ID, so that your cart and your orders belong to you. If you check out as a guest, your browser creates an anonymous ID with no name, email or password. If you sign in, the ID belongs to your account (see "Signing in" below).',
        ],
      },
    ],
  },
  {
    id: 'signin',
    title: 'Signing in',
    items: [
      { type: 'p', text: 'You can sign in with Google, Microsoft or your mobile number. Signing in is optional: you can browse and check out as a guest.' },
      {
        type: 'ul',
        items: [
          'With Google or Microsoft, they tell us your name and email address, and your profile photo if you have one. We never see your Google or Microsoft password.',
          'With your mobile number, we receive the number, and a text message with a one-time code is sent to it. We never see the code before you type it.',
          'We use these details to identify your account and show you your orders on any device. Your name and mobile number, if your account has them, are also written next to your order in the shop’s order spreadsheet (see below) so that staff can deliver it. We do not use any of these details for advertising, and we do not sell them.',
          'If you sign in after ordering as a guest, the orders you placed as a guest are added to your account.',
        ],
      },
      { type: 'p', text: 'Sign-in is run by Firebase Authentication, a Google service, and by Google and Microsoft themselves when you choose them. Each handles your details under its own privacy policy. Phone sign-in also uses Google’s reCAPTCHA to tell people from robots, which receives some information about your browser. You can sign out at any time from the header or your account page.' },
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
      { type: 'p', text: 'Your cart, your wishlist and the pincode you checked are saved in your own browser so they are still there when you come back. Clearing your browser data removes them. If you checked out as a guest, it also hides your past orders, because a guest’s orders are tied to that browser. Orders in a signed-in account stay with the account.' },
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
          'Your sign-in details (name, email or mobile number, and how you signed in) are kept by Firebase Authentication, a Google service.',
          'Our staff can see orders so that they can prepare and deliver them.',
          'A copy of each order (items, totals, address, status, and the name and mobile number on your account if you signed in) is kept in a private spreadsheet in Amazon Web Services storage, for the shop’s reporting. It is not public, and only staff can download it. If you erase your data (see "Your rights and erasing your data"), your name, mobile number, address and delivery note in that spreadsheet are overwritten as well.',
          'Razorpay processes your payment under its own terms.',
        ],
      },
    ],
  },
  {
    id: 'consent',
    title: 'Your consent',
    items: [
      { type: 'p', text: 'When you create an account we ask you to tick a box to consent to us collecting and using your name, email or mobile number, delivery address and order details to run your account, take and deliver your orders and keep the shop’s accounts. The box is never ticked for you, and sign-in does not start until you tick it. If you check out as a guest, we use your address and order details only to deliver and account for that order.' },
      { type: 'p', text: 'You can take your consent back at any time by erasing your data (below). That closes your account; we cannot keep an account without the details it needs.' },
    ],
  },
  {
    id: 'rights',
    title: 'Your rights and erasing your data',
    items: [
      { type: 'p', text: 'Under India’s Digital Personal Data Protection Act you can see what we hold about you, ask us to correct it, and ask us to erase it. Your orders are on your account page. To correct something, or to ask what we hold, contact us (details at the end of this page).' },
      { type: 'p', text: 'To erase your data yourself, open My account and press "Delete my data". You type the word DELETE to confirm. It works for a signed-in account and for a guest session.' },
      { type: 'p', text: 'What is erased:' },
      {
        type: 'ul',
        items: [
          'Your sign-in account, with the name, email address, mobile number and sign-in details it holds.',
          'Your cart and your wishlist.',
          'The delivery address and delivery instructions on your orders, any words in your reviews, and any note a staff member typed when cancelling your order.',
          'Your name, mobile number, address and delivery note in the order spreadsheet.',
        ],
      },
      { type: 'p', text: 'What we keep, and why:' },
      {
        type: 'ul',
        items: [
          'Your paid orders, refunds and payment records. The shop must keep its accounts, so these are not deleted. What remains is what you bought, the amounts, the dates, the delivery pincode (an area, not an address), the order and refund status, and the payment and refund references from Razorpay. Your address and notes are replaced with "[REDACTED - DPDP ERASURE]", and the link to your account is replaced with a code that cannot be traced back to you, so these records no longer identify you.',
          'A short log that your data was erased, and when. It holds no personal details.',
          'Razorpay keeps its own record of your payments under its own terms, and Google may keep short-lived backups and logs under its own policies. We cannot erase those ourselves.',
        ],
      },
      { type: 'p', text: 'If you have an order that is still on the way, or a payment still in progress, erasure waits: we need your address until the order is delivered or cancelled. Press the button again afterwards. Erasing your data cannot be undone. You can always shop again as a new customer.' },
    ],
  },
];
