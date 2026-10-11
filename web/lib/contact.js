// The Contact Us form (pages/contact.js) as pure functions, so they are easy to test.
//
// There is no backend for messages yet. Sending builds a mailto: link addressed to the shop's support mailbox with the
// subject and the message filled in, and the visitor's own email app sends it. When a backend is chosen (a Firebase
// function that stores or emails the message), validateContact() stays and only the sending changes.

export const NAME_MAX = 80;
export const MESSAGE_MIN = 10;
// Some email apps cut a mailto: link off at around 2,000 characters, so the message is capped well below that.
export const MESSAGE_MAX = 1500;
const ORDER_MAX = 40;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const clean = (value) => String(value ?? '').trim();

// { name?, email?, message? }: the problem with each field, in words for the visitor. An empty object means it is fine.
export function validateContact({ name, email, message } = {}) {
  const errors = {};
  if (!clean(name)) errors.name = 'Please tell us your name.';
  else if (clean(name).length > NAME_MAX) errors.name = `Please keep your name under ${NAME_MAX} characters.`;
  if (!clean(email)) errors.email = 'Please give an email address so we can reply.';
  else if (!EMAIL.test(clean(email))) errors.email = 'That email address does not look right.';
  if (clean(message).length < MESSAGE_MIN) errors.message = 'Please write a little more, so we can help.';
  else if (clean(message).length > MESSAGE_MAX) errors.message = `Please keep it under ${MESSAGE_MAX} characters.`;
  return errors;
}

// The mailto: link that opens the visitor's email app with everything filled in. `topics` is CONTACT_TOPICS.
export function contactMailto({ name, email, topic, orderNumber, message }, to, topics = []) {
  const topicLabel = topics.find((t) => t.id === topic)?.label ?? 'A question';
  const order = clean(orderNumber).slice(0, ORDER_MAX);
  const subject = `${topicLabel}${order ? ` (order ${order})` : ''} - ${clean(name)}`;
  const body = [
    clean(message),
    '',
    '---',
    `Name: ${clean(name)}`,
    `Reply to: ${clean(email)}`,
    order ? `Order number: ${order}` : null,
    `Topic: ${topicLabel}`,
  ]
    .filter((line) => line !== null)
    .join('\n');
  return `mailto:${encodeURIComponent(to).replace('%40', '@')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// The shop's phone number from business.js `contact`, if that is a phone number (it may also be an email address).
// Returns the digits with a leading + kept, or null.
export function phoneNumber(contact) {
  const text = clean(contact);
  if (!text || text.includes('@')) return null;
  const digits = text.replace(/[^\d+]/g, '');
  const count = digits.replace(/\D/g, '').length;
  return count >= 8 && count <= 15 ? digits : null;
}

// A WhatsApp chat link for that number. WhatsApp needs the country code, so this is offered only when the number is
// written with one (+91 98765 43210); a number without it gets a phone link only.
export function whatsappHref(contact) {
  const phone = phoneNumber(contact);
  return phone && phone.startsWith('+') ? `https://wa.me/${phone.slice(1)}` : null;
}
