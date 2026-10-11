import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RELATED_QUESTIONS, SUGGESTIONS, TOPICS } from '../content/assistant.js';
import { askAssistant, cachedReply, forgetAnswers, historyFor, matchProducts, replyTo } from '../lib/assistant.js';

const box = (id, name, category, stock = 5) => ({ id, name, category, stock, price: 299, ingredients: [] });
const PRODUCTS = [
  box('power', 'Protein Power Bowl', 'Fitness'),
  box('lean', 'Lean Green Box', 'Fitness', 0),
  box('mango', 'Mango Season Box', 'Seasonal'),
  box('iftar', 'Iftar Platter', 'Ramadan'),
];
const ids = (list) => list.map((p) => p.id);

describe('replyTo', () => {
  it('answers the known topics with links to the pages that hold the details', () => {
    assert.deepEqual(replyTo('Track my order').links.map((l) => l.href), ['/account']);
    assert.deepEqual(replyTo("Where's my box?").links.map((l) => l.href), ['/account']);
    assert.ok(replyTo('Do you deliver to my pincode?').links.some((l) => l.href === '/#delivery'));
    assert.ok(replyTo('Can I pay with UPI?').links.some((l) => l.href === '/faq'));
  });

  it('treats "cancel my order" as cancelling, not tracking', () => {
    assert.ok(replyTo('I want to cancel my order').links.some((l) => l.href === '/refunds'));
  });

  it('offers an email button only when there is a support address', () => {
    const hrefs = (r) => r.links.map((l) => l.href);
    assert.ok(hrefs(replyTo('talk to a human', { supportEmail: 'help@example.com' })).includes('mailto:help@example.com'));
    assert.ok(!hrefs(replyTo('talk to a human')).some((h) => h.startsWith('mailto:')));
  });

  it('suggests matching boxes from a sentence, in stock first, using synonyms', () => {
    const fitness = replyTo('Show me fitness packs', { products: PRODUCTS });
    assert.deepEqual(ids(fitness.products), ['power', 'lean']);
    assert.deepEqual(ids(replyTo('something for after the gym', { products: PRODUCTS }).products), ['power', 'lean']);
    assert.deepEqual(ids(replyTo('boxes for iftar', { products: PRODUCTS }).products), ['iftar']);
    assert.deepEqual(ids(replyTo("What's seasonal right now?", { products: PRODUCTS }).products), ['mango']);
  });

  it('falls back politely, and asks for the suggestions to be shown again', () => {
    const reply = replyTo('what is the meaning of life', { products: PRODUCTS });
    assert.equal(reply.products.length, 0);
    assert.equal(reply.suggest, true);
    assert.ok(reply.links.length > 0);
    assert.equal(replyTo('').suggest, true);
  });

  it('gives a useful answer to every suggested question', () => {
    for (const s of SUGGESTIONS) {
      const reply = replyTo(s, { products: PRODUCTS });
      assert.equal(reply.suggest, false, `"${s}" fell through to the fallback`);
    }
  });

  it('never returns more than three boxes, and the async wrapper gives the same answer', async () => {
    const many = Array.from({ length: 10 }, (_, i) => box(`f${i}`, `Fit Box ${i}`, 'Fitness'));
    assert.equal(matchProducts(many, 'fitness').length, 3);
    assert.deepEqual(await askAssistant('Track my order'), replyTo('Track my order'));
  });
});

describe('instant answers (no AI call)', () => {
  it('answers every popular question and every follow-up chip without the AI', () => {
    for (const q of [...SUGGESTIONS, ...RELATED_QUESTIONS]) assert.ok(cachedReply(q, { products: PRODUCTS }), `"${q}" would need the AI`);
  });

  it('every follow-up chip a topic offers is one the tests know about', () => {
    const known = new Set([...SUGGESTIONS, ...RELATED_QUESTIONS]);
    for (const t of TOPICS) for (const q of t.related ?? []) assert.ok(known.has(q), `${t.id} offers "${q}"`);
  });

  it('picks the right topic for common wordings', () => {
    const topicOf = (q) => TOPICS.find((t) => t.text === cachedReply(q)?.text)?.id;
    assert.equal(topicOf('Do you have COD?'), 'cod');
    assert.equal(topicOf('can I pay cash on delivery'), 'cod');
    assert.equal(topicOf('what is the delivery fee'), 'delivery-fee');
    assert.equal(topicOf('what time slots are there'), 'slots');
    assert.equal(topicOf('can I change my address'), 'change-order');
    assert.equal(topicOf('any discount codes?'), 'offers');
    assert.equal(topicOf('does the lassi have nuts'), 'allergens');
    assert.equal(topicOf('delete my account'), 'privacy');
    assert.equal(topicOf('hi'), 'greeting');
    assert.equal(topicOf('thanks a lot'), 'thanks');
  });

  it('leaves long, detailed questions and open questions to the AI', () => {
    assert.equal(cachedReply('I ordered yesterday for my mother and I want to know if the mango shake is too sweet for someone who is diabetic'), null);
    assert.equal(cachedReply('which fruit has the most fibre?', { products: PRODUCTS }), null);
  });
});

describe('asking the AI', () => {
  const server = (status, body, calls = []) => async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return { ok: status === 200, status, json: async () => body };
  };

  it('sends the question and recent history to the shop server, and shows the products it names', async () => {
    forgetAnswers();
    const calls = [];
    const reply = await askAssistant('which fruit has the most fibre?', {
      products: PRODUCTS,
      history: [{ role: 'user', text: 'hello' }],
      fetchImpl: server(200, { text: 'Guava.', productIds: ['mango', 'nope'], links: [{ label: 'Shop', href: '/products' }] }, calls),
    });
    assert.equal(calls[0].url, '/api/assistant');
    assert.deepEqual(calls[0].body, { message: 'which fruit has the most fibre?', history: [{ role: 'user', text: 'hello' }] });
    assert.equal(reply.source, 'ai');
    assert.equal(reply.text, 'Guava.');
    assert.deepEqual(ids(reply.products), ['mango']);
  });

  it('remembers a first-turn answer, so asking again makes no new call', async () => {
    forgetAnswers();
    const calls = [];
    const fetchImpl = server(200, { text: 'Guava.', productIds: [], links: [] }, calls);
    await askAssistant('which fruit has the most fibre?', { fetchImpl });
    const again = await askAssistant('Which fruit has the most fibre', { fetchImpl });
    assert.equal(calls.length, 1);
    assert.equal(again.text, 'Guava.');
  });

  it('answers locally when the AI cannot be reached, and passes on a rate-limit message', async () => {
    forgetAnswers();
    const offline = await askAssistant('which fruit has the most fibre?', {
      products: PRODUCTS,
      fetchImpl: async () => {
        throw new Error('offline');
      },
    });
    assert.equal(offline.source, 'offline');
    assert.equal(offline.suggest, true);
    const limited = await askAssistant('which fruit has the most fibre?', { fetchImpl: server(429, { error: 'Please wait a few minutes.' }) });
    assert.equal(limited.text, 'Please wait a few minutes.');
  });

  it('sends only the last turns of the conversation, without failed replies', () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({ from: i % 2 ? 'bot' : 'user', text: `m${i}` }));
    messages.push({ from: 'bot', text: 'oops', error: true });
    const history = historyFor(messages);
    assert.equal(history.length, 6);
    assert.deepEqual(history.at(-1), { role: 'assistant', text: 'm9' });
  });
});
