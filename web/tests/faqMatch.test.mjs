import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fillAnswer, indexFaqs, matchFaq, words } from '../lib/faqMatch.js';
import { faqFromData } from '../lib/serverFaqs.js';

// The real FAQ bank, as the seed writes it to Firestore.
const { buildAssistantFaqs } = createRequire(import.meta.url)('../../firebase/scripts/assistantFaqs.js');
const FAQS = buildAssistantFaqs();
const INDEX = indexFaqs(FAQS);
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const idOf = (q) => matchFaq(q, INDEX)?.faq.id ?? null;

describe('matching questions to the FAQ bank', () => {
  it('every FAQ wording finds its own FAQ, and no other', () => {
    for (const f of FAQS) for (const q of [f.question, ...f.variants]) assert.equal(idOf(q), f.id, `"${q}"`);
  });

  it('understands everyday and Hinglish phrasings', () => {
    assert.equal(idOf('do u deliver in bangalore?'), 'delivery-areas');
    assert.equal(idOf('refund kab aayega'), 'refund-time');
    assert.equal(idOf('is COD available??'), 'cod');
    assert.equal(idOf('my fruit is rotten'), 'damaged');
    assert.equal(idOf('order nahi aaya'), 'order-late');
    assert.equal(idOf('do you deliver on sunday'), 'weekends');
    assert.equal(idOf('can I pay by gpay'), 'payment-methods');
  });

  it('leaves open questions, product questions and long questions to the AI', () => {
    for (const q of [
      'what is the meaning of life',
      'which fruit has the most vitamin c',
      'best fruit for weight loss',
      'i want to buy dates',
      'can you recommend a drink for iftar',
      'price of guava',
      'I ordered the large mango box yesterday for my parents and want to know whether it suits someone who just had surgery',
      '',
    ]) {
      assert.equal(idOf(q), null, `"${q}" should go to the AI`);
    }
  });

  it('says nothing when two FAQs fit equally well', () => {
    const index = indexFaqs([
      { id: 'a', question: 'delivery charge', variants: [], answer: 'A' },
      { id: 'b', question: 'delivery charge', variants: [], answer: 'B' },
    ]);
    assert.equal(matchFaq('delivery charge', index), null);
  });

  it('reduces wording to meaningful words, merging synonyms', () => {
    assert.deepEqual([...words('Do you deliver to Bangalore?')], ['delivery', 'bengaluru']);
    assert.deepEqual([...words('Is cash on delivery available')], ['cash', 'available']);
    assert.ok(words('apply coupon').has('promo'));
  });

  it('ignores switched-off and empty FAQs', () => {
    const index = indexFaqs([{ id: 'off', question: 'cash on delivery', variants: [], answer: 'No', active: false }, { id: 'empty', question: 'cash', answer: '' }]);
    assert.equal(index.length, 0);
  });
});

describe('the answer', () => {
  it('fills in the shop’s own numbers, and never shows braces', () => {
    assert.equal(fillAnswer('Free from ₹{{freeDeliveryFrom}}.', { freeDeliveryFrom: 499 }), 'Free from ₹499.');
    assert.equal(fillAnswer('Email {{supportEmail}}{{contactLine}}, or write.', { supportEmail: 'a@b.in', contactLine: '' }), 'Email a@b.in, or write.');
    assert.equal(fillAnswer('Hi {{unknown}}.', {}), 'Hi.');
  });

  it('the quantity limit the answers quote is the one the cart and the server enforce', () => {
    const limit = (source) => Number(source.match(/MAX_QTY(?:_PER_LINE)? = (\d+)/)[1]);
    const route = limit(read('pages/api/assistant.js'));
    assert.equal(route, limit(read('context/CartContext.js')));
    assert.equal(route, limit(read('../firebase/functions/createCheckout.js')));
  });
});

describe('a FAQ read from Firestore', () => {
  it('is cleaned up, and keeps only links to this website', () => {
    const f = faqFromData('cod', {
      question: ' Do you have COD? ',
      variants: ['cod', 7, ''],
      answer: 'No.',
      links: [{ label: 'Pay', href: '/policies/payments' }, { label: 'Evil', href: 'https://evil.example' }, { label: 'Sneaky', href: '//evil.example' }],
    });
    assert.deepEqual(f, { id: 'cod', question: 'Do you have COD?', variants: ['cod'], answer: 'No.', links: [{ label: 'Pay', href: '/policies/payments' }], active: true });
    assert.equal(faqFromData('cod', { question: 'x', answer: 'y', active: false }), null);
    assert.equal(faqFromData('../x', { question: 'x', answer: 'y' }), null);
  });
});
