import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CONTACT_TOPICS } from '../content/contact.js';
import { MESSAGE_MAX, contactMailto, phoneNumber, validateContact, whatsappHref } from '../lib/contact.js';

const good = { name: 'Ayesha', email: 'ayesha@example.com', topic: 'order', orderNumber: 'FB-1A2B3C4D', message: 'My order arrived without the dates.' };

describe('the contact form', () => {
  it('accepts a complete message', () => {
    assert.deepEqual(validateContact(good), {});
  });

  it('asks for a name, a real-looking email and a message of some length', () => {
    const errors = validateContact({ name: '  ', email: 'not-an-email', message: 'hi' });
    assert.deepEqual(Object.keys(errors).sort(), ['email', 'message', 'name']);
    assert.ok(validateContact({ ...good, email: '' }).email);
    assert.ok(validateContact({ ...good, message: 'x'.repeat(MESSAGE_MAX + 1) }).message);
    assert.deepEqual(validateContact({ ...good, orderNumber: '' }), {}); // the order number is optional
  });

  it('builds an email to support with the topic, order number and message filled in', () => {
    const href = contactMailto(good, 'support@freshbliss.in', CONTACT_TOPICS);
    assert.ok(href.startsWith('mailto:support@freshbliss.in?'));
    const params = new URLSearchParams(href.split('?')[1]);
    assert.equal(params.get('subject'), 'An order I placed (order FB-1A2B3C4D) - Ayesha');
    const body = params.get('body');
    assert.ok(body.startsWith('My order arrived without the dates.'));
    assert.match(body, /Reply to: ayesha@example\.com/);
    assert.match(body, /Order number: FB-1A2B3C4D/);
  });

  it('leaves the order number out when there is none, and copes with an unknown topic', () => {
    const params = new URLSearchParams(contactMailto({ ...good, orderNumber: ' ', topic: 'nonsense' }, 'a@b.in', CONTACT_TOPICS).split('?')[1]);
    assert.equal(params.get('subject'), 'A question - Ayesha');
    assert.doesNotMatch(params.get('body'), /Order number/);
  });

  it('stays short enough for every email app, even with the longest message allowed', () => {
    const href = contactMailto({ ...good, message: 'a'.repeat(MESSAGE_MAX) }, 'support@freshbliss.in', CONTACT_TOPICS);
    assert.ok(href.length < 2000, `${href.length} characters`);
  });
});

describe('phone and WhatsApp links', () => {
  it('reads a phone number, and offers WhatsApp only when it has a country code', () => {
    assert.equal(phoneNumber('+91 98765 43210'), '+919876543210');
    assert.equal(whatsappHref('+91 98765 43210'), 'https://wa.me/919876543210');
    assert.equal(phoneNumber('080-4567 8901'), '08045678901');
    assert.equal(whatsappHref('080-4567 8901'), null);
  });

  it('shows no phone link for an email address, an empty value or junk', () => {
    for (const value of ['hello@freshbliss.in', '', null, undefined, 'call us', '123']) {
      assert.equal(phoneNumber(value), null, String(value));
      assert.equal(whatsappHref(value), null, String(value));
    }
  });
});
