import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ERASE_PHRASE, clearOurKeys, erasureSummary, isErasePhrase } from '../lib/erasureHelpers.js';
import { PRIVACY_SECTIONS } from '../content/privacy.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const section = (id) => PRIVACY_SECTIONS.find((s) => s.id === id);

describe('the confirmation word', () => {
  it('is DELETE, in capitals, and nothing else is accepted', () => {
    assert.equal(ERASE_PHRASE, 'DELETE');
    assert.equal(isErasePhrase('DELETE'), true);
    assert.equal(isErasePhrase('  DELETE '), true, 'a phone keyboard may add spaces');
    for (const wrong of ['delete', 'Delete', 'DELET', 'DELETE ME', '', '   ', null, undefined, 42]) assert.equal(isErasePhrase(wrong), false, String(wrong));
  });
});

describe('wiping what the browser kept', () => {
  // A minimal Storage: the same shape the browser's has.
  function storage(entries) {
    const map = new Map(Object.entries(entries));
    return {
      get length() {
        return map.size;
      },
      key: (i) => [...map.keys()][i] ?? null,
      removeItem: (k) => map.delete(k),
      keys: () => [...map.keys()].sort(),
    };
  }

  it('removes our cart, wishlist, pincode and guest note, and nothing that belongs to anyone else', () => {
    const s = storage({ 'freshbliss:cart:v1': '[]', 'freshbliss:wishlist:v1': '[]', 'freshbliss:pincode:v1': '"560001"', 'fb-guest-checkout': '1', theme: 'dark', 'other-site:cart': 'x' });
    assert.equal(clearOurKeys(s), 4);
    assert.deepEqual(s.keys(), ['other-site:cart', 'theme']);
  });

  it('never throws, even when the storage is blocked', () => {
    const blocked = {
      get length() {
        throw new Error('SecurityError');
      },
    };
    assert.equal(clearOurKeys(blocked), 0);
  });
});

describe('what the customer is told afterwards', () => {
  it('words the sentence by how many orders were erased', () => {
    assert.match(erasureSummary({ orders: 0 }), /account and everything saved with it/);
    assert.match(erasureSummary({ orders: 1 }), /on your order have been erased/);
    assert.match(erasureSummary({ orders: 3 }), /on your 3 orders have been erased/);
    assert.match(erasureSummary(undefined), /account and everything saved with it/);
  });
});

describe('the words on the site match what the server does', () => {
  const server = read('../../firebase/functions/shared/erasure.js');
  const marker = server.match(/const REDACTED = '([^']+)'/)?.[1];

  it('uses the server’s own marker text in the privacy page and the account card', () => {
    assert.equal(marker, '[REDACTED - DPDP ERASURE]');
    assert.ok(JSON.stringify(section('rights')).includes(marker), 'privacy page');
    assert.ok(read('../components/auth/DeleteAccountCard.js').includes(marker), 'account card');
  });

  it('sends the same confirmation word the server insists on', () => {
    const fn = read('../../firebase/functions/requestDataErasure.js');
    assert.match(fn, new RegExp(`confirm !== '${ERASE_PHRASE}'`));
  });

  it('the privacy page has a consent section and says what is erased, what is kept and when it waits', () => {
    const consent = JSON.stringify(section('consent'));
    assert.match(consent, /tick a box/);
    assert.match(consent, /never ticked for you/);
    const rights = JSON.stringify(section('rights'));
    for (const word of ['Delete my data', 'DELETE', 'What is erased', 'What we keep', 'refunds', 'Razorpay', 'still on the way', 'spreadsheet']) assert.match(rights, new RegExp(word), word);
  });

  it('every privacy section still has an id, a title and content, and no id is repeated', () => {
    const ids = new Set();
    for (const s of PRIVACY_SECTIONS) {
      assert.ok(s.id && s.title && s.items.length > 0, s.id);
      assert.equal(ids.has(s.id), false, `duplicate ${s.id}`);
      ids.add(s.id);
    }
  });
});

describe('sign-in asks for consent first', () => {
  const form = read('../components/auth/LoginForm.js');
  it('has a checkbox that starts unticked and holds back every sign-in method until it is ticked', () => {
    assert.match(form, /const \[agreed, setAgreed\] = useState\(false\)/);
    assert.match(form, /type="checkbox"/);
    assert.doesNotMatch(form, /defaultChecked|checked=\{true\}/, 'never pre-ticked');
    // Google, Microsoft, Send OTP and Verify are each switched off, and attempt() refuses as well.
    assert.equal((form.match(/disabled=\{working \|\| !agreed\}/g) || []).length, 4);
    assert.match(form, /async function attempt\(label, work\) \{\s*if \(!agreed\)/);
  });
});
