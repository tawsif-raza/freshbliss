// The words on the Contact Us page (pages/contact.js), in one place so they can change without touching code.
//
// The contact details themselves (email, phone, hours, address) come from content/business.js, so every page that shows
// them agrees. Anything left empty there is simply not shown here: nothing is made up.

export const CONTACT = {
  eyebrow: 'Get in touch',
  title: 'Contact Us',
  lead: 'Questions about an order, a delivery or a fruit box? Write to us and a real person will get back to you.',
  formTitle: 'Send us a message',
  // There is no message backend yet: "Send" opens the visitor's own email app with the message filled in.
  formNote: 'Pressing Send opens your email app with your message filled in, addressed to our support team. We reply by email.',
  sentNote: 'Your email app should now be open with your message ready to send. If nothing opened, email us directly at',
  quickTitle: 'Quick help',
};

// What the message is about. The label becomes the start of the email's subject line.
export const CONTACT_TOPICS = [
  { id: 'order', label: 'An order I placed' },
  { id: 'delivery', label: 'Delivery or my area' },
  { id: 'product', label: 'A product or the Ramadan range' },
  { id: 'refund', label: 'Cancellation or refund' },
  { id: 'bulk', label: 'Bulk, gifting or office orders' },
  { id: 'feedback', label: 'Feedback' },
  { id: 'other', label: 'Something else' },
];

// Shortcuts to the pages that answer most questions without writing in.
export const QUICK_LINKS = [
  { href: '/account', label: 'Track or manage an order', text: 'See every order live, cancel one, or order again.' },
  { href: '/faq', label: 'Read the FAQ', text: 'Delivery areas, payments, freshness and more.' },
  { href: '/refunds', label: 'Cancellation & refunds', text: 'When you can cancel, and how refunds work.' },
];
