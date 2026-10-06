// Terms of service and the cancellation & refund policy, in plain words. Each statement describes what the
// system actually does today (see firebase/functions/cancelOrder.js, processRefund.js), so it stays true.
//
// REVIEW BEFORE LAUNCH: this is a starting draft written from how the code behaves, not legal advice. Have a
// lawyer or the business's advisor read it. Two things deliberately have NO number here because the business
// has not decided them: how many days a refund takes to reach the customer, and any quality-complaint window.
// Add them below ONLY once the business has committed to them (and make the FAQ say the same thing).
// If the system changes, change this at the same time. (Refunds go to Razorpay automatically when an order is cancelled:
// firebase/functions/autoRefund.js.)

export const POLICIES_UPDATED = '4 October 2026';

export const TERMS_SECTIONS = [
  {
    id: 'about',
    title: 'Who we are',
    items: [{ type: 'p', text: 'These terms cover orders placed on this website for fresh fruit boxes delivered in Bengaluru. By placing an order you agree to them.' }],
  },
  {
    id: 'orders',
    title: 'Orders and prices',
    items: [
      {
        type: 'ul',
        items: [
          'Prices, delivery fees, stock and promo discounts are always worked out by our server when you pay. If something changed since you added a box to your cart, the checkout shows the updated amount before you pay.',
          'An order is confirmed only after your payment is confirmed by our payment provider. Until then it is not an order.',
          'We deliver only to the pincodes shown at checkout. If your pincode is not served, checkout will say so.',
          'Promo codes can have limits, for example a total number of uses, or one use per customer. Checkout tells you if a code cannot be used. If a code reaches its limit while you are paying, we cancel the order and refund you in full, and you can order again without the code.',
          'We check stock before you pay. If the last box sells out in the moments while you are paying, we cancel the whole order (not just that item) and refund the full amount to your original payment method. You can then order again.',
        ],
      },
    ],
  },
  {
    id: 'delivery',
    title: 'Delivery',
    items: [
      {
        type: 'ul',
        items: [
          'You can ask for delivery as soon as possible, or choose a delivery window for today or tomorrow. Windows that are too close to the current time are not offered.',
          'Delivery times are estimates, not guarantees. Fresh produce depends on stock, traffic and weather.',
          'Please give a complete address and a phone number that is reachable on delivery.',
        ],
      },
    ],
  },
  {
    id: 'payment',
    title: 'Payment',
    items: [
      {
        type: 'p',
        text: 'Payments are handled by Razorpay. We never see or store your card, UPI or bank details. We keep a payment reference so that we can match your payment to your order and refund it if needed.',
      },
    ],
  },
  {
    id: 'cancel',
    title: 'Cancellation and refunds',
    items: [{ type: 'p', text: 'How cancellation and refunds work is explained on our Cancellation & Refunds page, which is part of these terms.' }],
  },
  {
    id: 'changes',
    title: 'Changes to these terms',
    items: [{ type: 'p', text: 'We may update these terms. The date at the top shows when they last changed. An order is governed by the terms in force when it was placed.' }],
  },
];

export const REFUND_SECTIONS = [
  {
    id: 'cancel',
    title: 'Cancelling an order',
    items: [
      {
        type: 'ul',
        items: [
          'You can cancel an order yourself from its page under My orders. The "Cancel order" button is shown only while cancelling is still possible, which is until we have packed it.',
          'Once an order has been packed, is out for delivery or is delivered, it can no longer be cancelled online. Please contact us and we will look at it with you.',
          'You do not need to give a long explanation: you choose a short reason from a list.',
          'Cancelling puts the items back in stock straight away.',
        ],
      },
    ],
  },
  {
    id: 'how',
    title: 'How you get your money back',
    items: [
      {
        type: 'ul',
        items: [
          'After you cancel, your order shows "Refund pending" while we send the refund to your payment method through Razorpay. This happens automatically. The order changes to "Refunded" once Razorpay confirms it. If something goes wrong on our side, our team steps in.',
          'The refund goes back to the original payment method (the same card, UPI app or bank account you paid with). We cannot refund to a different account.',
          'Once the refund is sent, how long your bank or card issuer takes to show it depends on them.',
        ],
      },
    ],
  },
  {
    id: 'other',
    title: 'Other situations',
    items: [
      {
        type: 'ul',
        items: [
          'An item sells out while you are paying: we cancel the whole order (not just that item) and refund the full amount to your original payment method.',
          'A promo code reaches its usage limit while you are paying: we cancel the order and refund the full amount to your original payment method.',
          'Something is wrong with your delivery (damaged, missing or not as described): contact us (details below) as soon as possible and tell us your order number. We will review it and put it right.',
        ],
      },
    ],
  },
];
