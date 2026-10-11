'use strict';

// The chat assistant's FAQ bank: the `assistantFaqs` collection. pages/api/assistant.js answers a question from here
// when it matches one of these (web/lib/faqMatch.js), so the AI is never called for it: no cost, no wait. Written by
// scripts/seed.js (`npm run seed`; with --remote it only adds the missing ones, like every other collection).
//
// Chosen from what customers of Indian fruit and grocery delivery sites ask most (delivery areas and times, tracking,
// changing or cancelling, refunds, damaged or missing items, payment methods and failed payments, offers, stock,
// freshness, allergens and diet, contact), and answered from what THIS shop's code actually does. docs/CHATBOT.md
// lists how to add one. REVIEW BEFORE LAUNCH: every answer is a promise.
//
// One document:
//   category     for the owner's overview (Ordering, Delivery, Payments...)
//   question     the main wording, also matched
//   variants     other ways people ask it (Hinglish included); the more, the better the matching
//   answer       the reply. {{name}} is filled in when answering, from the shop's own settings, so the numbers can never
//                drift from the code: freeDeliveryFrom, deliveryHours, leadMinutes, maxQty, tips, supportEmail, contactLine
//   links        buttons under the answer: only pages of this website
//   order        position in the owner's list;  active  false switches it off

const faq = (id, category, question, variants, answer, links = []) => ({ id, category, question, variants, answer, links });

const L = {
  shop: { label: 'Shop everything', href: '/products' },
  orders: { label: 'My orders', href: '/account' },
  contact: { label: 'Contact us', href: '/contact' },
  refunds: { label: 'Refund policy', href: '/refunds' },
  terms: { label: 'Terms', href: '/terms' },
  pincode: { label: 'Check my pincode', href: '/#delivery' },
  login: { label: 'Sign in', href: '/login' },
  ramadan: { label: 'Ramadan Specials', href: '/products?category=ramadan' },
  privacy: { label: 'Privacy', href: '/privacy' },
  benefits: { label: 'Why fruit every day', href: '/#benefits' },
  faq: { label: 'Read the FAQ', href: '/faq' },
};

const FAQS = [
  // ---------- ordering ----------
  faq('how-to-order', 'Ordering', 'How do I place an order?', ['how to order', 'how can I buy fruit', 'how does ordering work', 'order kaise kare', 'how do I buy from you', 'steps to order'],
    'Pick a product and size, add it to your cart, then check out: enter your address and pincode, choose "As soon as possible" or a delivery window, and pay online through Razorpay. You can then follow the order live under My orders.', [L.shop]),
  faq('guest-checkout', 'Ordering', 'Can I order without an account?', ['do I need to sign up', 'guest checkout', 'order without login', 'do I need an account to order', 'bina login order'],
    'Yes, you can check out as a guest. Signing in keeps your orders with you on any device.', [L.login]),
  faq('sign-in-options', 'Ordering', 'How can I sign in?', ['login options', 'sign in with phone number', 'sign in with google', 'how do I log in', 'otp login', 'login kaise kare'],
    'You can sign in with Google, Microsoft or your phone number (with a one-time code).', [L.login]),
  faq('max-quantity', 'Ordering', 'How many of one item can I order?', ['maximum quantity per item', 'order limit', 'quantity limit', 'can I order 50 boxes', 'how many can I add to cart'],
    'You can add up to {{maxQty}} of each item and size to one order. For more than that, send us a bulk order request on the Contact page.', [L.contact]),
  faq('min-order', 'Ordering', 'Is there a minimum order value?', ['minimum order amount', 'min order', 'smallest order I can place', 'minimum purchase'],
    'There is no minimum order. Where a delivery fee applies, delivery is free on orders of ₹{{freeDeliveryFrom}} or more.', [L.pincode]),
  faq('reorder', 'Ordering', 'How do I reorder something I bought before?', ['order again', 'repeat my last order', 'buy the same again', 'reorder previous order'],
    'Open My orders and press Reorder on a past order: the same items go back into your cart.', [L.orders]),
  faq('wishlist', 'Ordering', 'Can I save products for later?', ['wishlist', 'save for later', 'favourite products', 'how do I use the heart button'],
    'Yes. Tap the heart on any product to add it to your wishlist; open it from Wishlist in the header.'),
  faq('search', 'Ordering', 'How do I find a product?', ['search for a product', 'where is the search bar', 'find a fruit', 'search kaise kare'],
    'Use Search in the header (or press Ctrl+K, or Cmd+K on a Mac), or browse the categories on the Shop page.', [L.shop]),
  faq('app', 'Ordering', 'Do you have a mobile app?', ['android app', 'iphone app', 'download your app', 'play store app', 'app hai kya', 'install app'],
    'There is no app to download from a store, but you can install FreshBliss from your browser: open the menu and choose "Add to Home screen" or "Install app". It then opens like an app.'),
  faq('gift', 'Ordering', 'Can I send fruit as a gift to someone else?', ['gift delivery', 'send fruit to a friend', 'deliver to another address', 'gift box for someone'],
    'Yes. At checkout you can enter any Bengaluru address we deliver to. For gift boxes or larger gifting orders, send us a message on the Contact page.', [L.contact]),
  faq('order-confirmed', 'Ordering', 'How do I know my order is confirmed?', ['is my order confirmed', 'did my order go through', 'order placed or not', 'order confirmation'],
    'An order is confirmed once Razorpay confirms your payment. It then appears under My orders with its live status.', [L.orders]),
  faq('notifications', 'Ordering', 'Will I get an SMS or email about my order?', ['order confirmation email', 'sms updates', 'whatsapp order updates', 'do you send notifications'],
    'Not yet. Your order’s live status is always on its page under My orders, so keep that page handy.', [L.orders]),

  // ---------- delivery ----------
  faq('delivery-areas', 'Delivery', 'Which areas do you deliver to?', ['do you deliver to my area', 'which pincodes do you serve', 'delivery locations', 'do you deliver in bangalore', 'service area', 'mere area me delivery hai'],
    'We deliver to selected pincodes in Bengaluru. Enter your pincode on the home page or at checkout to see whether we reach you, what delivery costs and how soon it usually arrives.', [L.pincode]),
  faq('outside-bengaluru', 'Delivery', 'Do you deliver outside Bengaluru?', ['deliver to mumbai', 'deliver to chennai', 'other cities', 'pan india delivery', 'ship to hyderabad', 'deliver to mysore'],
    'Not yet: we deliver only within Bengaluru, so everything reaches you fresh.'),
  faq('delivery-fee', 'Delivery', 'How much is delivery?', ['delivery charges', 'shipping cost', 'delivery fee', 'is delivery free', 'delivery charge kitna hai'],
    'Delivery is free to some central Bengaluru pincodes. Elsewhere there is a small flat fee, and delivery is free on orders of ₹{{freeDeliveryFrom}} or more. Checkout shows your exact fee before you pay.', [L.pincode]),
  faq('delivery-speed', 'Delivery', 'How fast is delivery?', ['how long does delivery take', 'when will my order arrive', 'one hour delivery', 'quick delivery', 'kitne time me delivery'],
    'Choose "As soon as possible" at checkout for the earliest delivery; the pincode check shows how long it usually takes in your area. You can also pick a two-hour window.', [L.pincode]),
  faq('delivery-windows', 'Delivery', 'Can I choose a delivery time?', ['schedule a delivery', 'time slot', 'deliver tomorrow', 'pick a delivery time', 'delivery slots', 'what time do you deliver', 'delivery timings'],
    'Yes: "As soon as possible", or a two-hour window from {{deliveryHours}}, today or tomorrow. A window can be booked until {{leadMinutes}} minutes before it starts.'),
  faq('schedule-later', 'Delivery', 'Can I order for a later date, like next week?', ['order in advance', 'book for next week', 'deliver day after tomorrow', 'pre order', 'advance booking'],
    'Deliveries can be booked for today or tomorrow only. For a later date, place the order the day before, or contact us for a large order.', [L.contact]),
  faq('weekends', 'Delivery', 'Do you deliver on Sundays and holidays?', ['sunday delivery', 'holiday delivery', 'weekend delivery', 'are you open today', 'do you deliver every day'],
    'Checkout offers delivery every day, weekends included. If a window is shown, we deliver in it.'),
  faq('late-night', 'Delivery', 'Do you deliver late at night or early in the morning?', ['midnight delivery', 'deliver at 11 pm', 'early morning delivery', '6 am delivery', 'night delivery'],
    'Delivery windows run from {{deliveryHours}}. Outside those hours, choose the first window the next day.'),
  faq('change-address', 'Delivery', 'Can I change the delivery address after ordering?', ['wrong address', 'update my address', 'change delivery address', 'edit address after order', 'address galat dal diya'],
    'A paid order can’t be edited. If it hasn’t been packed yet, cancel it from My orders (the refund goes back to your original payment method) and order again with the right address. Otherwise, contact us straight away.', [L.orders, L.contact]),
  faq('not-home', 'Delivery', 'What if I’m not home when the order arrives?', ['missed delivery', 'nobody at home', 'can the rider leave it at the door', 'leave with security', 'ghar pe koi nahi hai'],
    'Add a note for the rider in the delivery instructions at checkout, for example "leave with security". If your plans change after ordering, contact us quickly.', [L.contact]),
  faq('order-late', 'Delivery', 'My order is late. What should I do?', ['order delayed', 'order not arrived yet', 'delivery is late', 'still waiting for my order', 'order nahi aaya'],
    'Check its live status under My orders. If it’s past its delivery window, contact us with your order number and we’ll find out where it is.', [L.orders, L.contact]),
  faq('track', 'Delivery', 'How do I track my order?', ['track order', 'order status', 'where is my order', 'live tracking', 'order kahan hai'],
    'Open the order under My orders: it shows each step live, from preparing to out for delivery to delivered.', [L.orders]),

  // ---------- payments ----------
  faq('payment-methods', 'Payments', 'Which payment methods do you accept?', ['can I pay with upi', 'credit card', 'debit card', 'net banking', 'gpay phonepe paytm', 'payment options'],
    'You pay online through Razorpay, whose payment screen shows every method available to you. We never see or store your card, UPI or bank details.'),
  faq('cod', 'Payments', 'Do you have cash on delivery?', ['cod available', 'pay cash on delivery', 'pay when it arrives', 'cash payment', 'cod hai kya'],
    'We don’t offer cash on delivery. You pay online through Razorpay when you place the order, and you see the full total before you pay.'),
  faq('payment-failed', 'Payments', 'My payment failed but the money was deducted.', ['money deducted but order not placed', 'payment failed', 'amount debited but no order', 'charged twice', 'paisa kat gaya order nahi hua'],
    'If money left your account but no order appears under My orders, the payment wasn’t completed and it goes back to your original payment method. If it doesn’t come back, contact us with the payment reference from your bank or UPI app.', [L.orders, L.contact]),
  faq('payment-safe', 'Payments', 'Is it safe to pay on your website?', ['is payment secure', 'safe to pay online', 'is this site genuine', 'is my card safe'],
    'Yes. Payments are handled by Razorpay on its own secure screen, and we never see or store your card, UPI or bank details.'),
  faq('tip', 'Payments', 'Can I tip the rider?', ['tip the delivery person', 'add a tip', 'tip option', 'tip for delivery boy'],
    'Yes, optionally, at checkout: {{tips}}, as a thank-you to your rider.'),
  faq('gst', 'Payments', 'Do prices include GST or any hidden charges?', ['gst included', 'is tax extra', 'hidden charges', 'extra charges at checkout'],
    'Checkout shows everything you pay before you pay it: items, delivery, any tip and any discount, with nothing added afterwards. For tax questions or a GST invoice, contact us.', [L.contact]),
  faq('invoice', 'Payments', 'Can I get a receipt or invoice?', ['bill for my order', 'download receipt', 'invoice', 'order receipt pdf', 'gst bill', 'gst invoice'],
    'Yes. Open the order under My orders and use its receipt: "Print / Save as PDF". For a GST invoice, contact us.', [L.orders]),
  faq('price-changed', 'Payments', 'Why did the price change at checkout?', ['total changed at checkout', 'price is different at checkout', 'price increased'],
    'Prices, stock and offers are checked again when you pay. If something changed since you added it to your cart, checkout shows the updated amount before you pay.', [L.terms]),

  // ---------- offers ----------
  faq('offers', 'Offers', 'Are there any offers right now?', ['current offers', 'any discount', 'sale', 'deals today', 'koi offer hai'],
    'Ramadan Specials are on offer right now: the regular price is shown crossed out next to the price you pay.', [L.ramadan]),
  faq('promo-code', 'Offers', 'How do I use a promo code?', ['apply coupon', 'where do I enter the code', 'promo code not working', 'coupon code', 'discount code'],
    'Enter it at checkout before you pay. One code per order; a code can have a minimum order, an end date and a one-per-customer limit, and checkout tells you if it can’t be used.'),
  faq('first-order', 'Offers', 'Is there a first order discount?', ['new user offer', 'welcome offer', 'first time discount', 'welcome code'],
    'Any welcome offer we run is shown on the website. If you have a code, enter it at checkout.'),
  faq('offer-end', 'Offers', 'When does the Ramadan offer end?', ['how long is the offer', 'ramadan sale end date', 'offer valid till'],
    'Offer prices last while they are shown on the site. A paid order always keeps the price you paid.', [L.ramadan]),

  // ---------- cancellations and refunds ----------
  faq('cancel', 'Cancellations & refunds', 'How do I cancel my order?', ['cancel order', 'cancel my order', 'order cancel kaise kare', 'I want to cancel'],
    'Open the order under My orders and press Cancel; you can cancel until we have packed it. The refund is sent to your original payment method automatically.', [L.orders, L.refunds]),
  faq('cancel-after-packed', 'Cancellations & refunds', 'Can I cancel after my order is packed?', ['cancel after dispatch', 'cancel when out for delivery', 'too late to cancel', 'cancel button missing'],
    'Once it’s packed, the Cancel button goes away because your fruit is already cut. Contact us with your order number and we’ll see what we can do.', [L.contact]),
  faq('refund-time', 'Cancellations & refunds', 'How long does a refund take?', ['refund status', 'when will I get my money back', 'refund not received', 'refund kab aayega'],
    'After you cancel, the refund is sent to your original payment method automatically, and the order shows "Refunded" once Razorpay confirms it. How long your bank or UPI app takes to show it depends on them. If you can’t see it, contact us with your order number.', [L.refunds, L.contact]),
  faq('damaged', 'Cancellations & refunds', 'My fruit arrived damaged or not fresh.', ['rotten fruit', 'bad quality', 'damaged items', 'spoiled fruit', 'fruit kharab hai', 'not fresh'],
    'We’re sorry! Please don’t eat it. Contact us with your order number and a photo of what arrived, and we’ll look into it straight away.', [L.contact]),
  faq('missing-item', 'Cancellations & refunds', 'An item is missing or wrong in my order.', ['item missing', 'wrong item delivered', 'incomplete order', 'received the wrong product'],
    'Sorry about that. Contact us with your order number and what’s missing or wrong, ideally with a photo of what arrived.', [L.contact]),
  faq('returns', 'Cancellations & refunds', 'Can I return or exchange a product?', ['return policy', 'exchange an item', 'return fruit'],
    'Fresh food can’t be sent back like other shopping, but if something is wrong with your order, contact us with your order number and a photo and we’ll look into it.', [L.refunds, L.contact]),

  // ---------- products ----------
  faq('freshness', 'Products', 'How fresh is the fruit?', ['is the fruit fresh', 'when is it cut', 'same day cut', 'how is it packed', 'is it hygienic'],
    'Every order is freshly cut and packed hygienically, with no preservatives. Each product page shows its shelf life.'),
  faq('organic', 'Products', 'Is your fruit organic?', ['organic certified', 'pesticide free', 'chemical free', 'where does the fruit come from'],
    'Each product page says where its fruit comes from. For anything more about how a product is grown, contact us and we’ll find out.', [L.contact]),
  faq('out-of-stock', 'Products', 'When will a sold-out product be back?', ['out of stock', 'sold out', 'not available', 'restock', 'back in stock'],
    'Sold-out products are marked on their page and come back when we restock. We can’t notify you yet, so please check back or try a similar product.', [L.shop]),
  faq('custom-box', 'Products', 'Can I customise a fruit box?', ['custom box', 'choose my own fruits', 'make my own box', 'remove a fruit from the box'],
    'Boxes come as listed, but you can build your own selection from the individual fruits and drinks in the shop. For a special mix in bulk, contact us.', [L.shop, L.contact]),
  faq('sizes', 'Products', 'What’s the difference between the sizes?', ['regular vs large', 'size options', 'how big is the box', 'large size price'],
    'Where a product has sizes, its page shows each size and how much more the larger one costs. The weight or serving is in the product’s name or description.'),
  faq('sugar', 'Products', 'Do your juices and drinks have added sugar?', ['added sugar', 'sugar free drinks', 'is the juice sweetened'],
    'It depends on the drink, and each product page lists its ingredients. For example, the mixed fruit juice is noted as having no added sugar, while sharbat and shakes are sweet.'),
  faq('vegan', 'Products', 'Do you have vegan or dairy-free options?', ['vegan', 'dairy free', 'plant based', 'no milk products'],
    'All our fruit and most juices are plant-based. The lassi, chaas, milkshakes, milk and ice cream contain milk. Each product page lists its ingredients.'),
  faq('allergens', 'Products', 'Where can I see allergens?', ['nut allergy', 'does it contain nuts', 'allergy information', 'lactose'],
    'Every product page lists its ingredients and allergens: please check it before ordering. Milk is in the lassi, chaas, milkshakes, milk and ice cream, and the dry fruit milkshake has almonds, cashews and pistachios. With a severe allergy, contact us first.', [L.contact]),
  faq('storage', 'Products', 'How should I store my order?', ['how long does cut fruit last', 'shelf life', 'keep in fridge', 'storage instructions'],
    'Put cut fruit and drinks in the fridge (below 4°C) as soon as they arrive, and ice cream in the freezer. Each product page shows its shelf life and storage note.'),
  faq('health', 'Products', 'Is fruit good for health?', ['health benefits', 'nutrition', 'is it healthy', 'good for diabetes', 'calories'],
    'Our "Why fruit every day" section explains what each fruit and drink brings, and each product page lists its own notes. It’s general information, not medical advice: if you have a health condition, ask your doctor what suits you.', [L.benefits]),

  // ---------- account and support ----------
  faq('contact', 'Support', 'How can I contact you?', ['customer care number', 'support email', 'phone number', 'whatsapp number', 'helpline', 'talk to a person'],
    'Email us at {{supportEmail}}{{contactLine}}, or send a message from the Contact page.', [L.contact]),
  faq('hours', 'Support', 'What are your working hours?', ['opening hours', 'what time do you open', 'timings', 'support hours'],
    'We deliver every day, from {{deliveryHours}}. Messages to support are answered as soon as we can.', [L.contact]),
  faq('feedback', 'Support', 'How can I give feedback?', ['give feedback', 'write a review', 'rate my order', 'suggestion'],
    'We’d love to hear it: send it from the Contact page and choose "Feedback".', [L.contact]),
  faq('bulk', 'Support', 'Do you take bulk or office orders?', ['corporate order', 'office fruit', 'party order', 'event order', 'wholesale'],
    'Yes, we’d love to help. Send us a message on the Contact page and choose "Bulk, gifting or office orders", with the date, address and roughly how many people.', [L.contact]),
  faq('delete-data', 'Support', 'How do I delete my account or data?', ['delete my account', 'remove my data', 'close my account', 'privacy'],
    'Use "Delete my data" on your account page. The privacy page explains what we keep and why.', [L.orders, L.privacy]),
  faq('language', 'Support', 'Can I chat in Hindi?', ['hindi me baat', 'kannada', 'tamil', 'other languages'],
    'Yes! Ask in Hindi or another language and I’ll do my best to reply in the same language.'),
];

function buildAssistantFaqs() {
  return FAQS.map((f, i) => ({ ...f, order: (i + 1) * 10, active: true }));
}

module.exports = { buildAssistantFaqs };
