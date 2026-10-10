import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SUGGESTIONS } from '../content/assistant.js';
import { askAssistant, matchProducts, replyTo } from '../lib/assistant.js';

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
