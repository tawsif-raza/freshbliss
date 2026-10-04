import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PRIVACY_SECTIONS } from '../content/privacy.js';

const everything = JSON.stringify(PRIVACY_SECTIONS);
const section = (id) => PRIVACY_SECTIONS.find((s) => s.id === id);

describe('privacy page covers signing in', () => {
  it('has a sign-in section naming each way to sign in', () => {
    const text = JSON.stringify(section('signin'));
    for (const word of ['Google', 'Microsoft', 'mobile number', 'Firebase Authentication', 'guest']) assert.match(text, new RegExp(word), word);
  });

  it('no longer says there is no name, email or login', () => {
    assert.doesNotMatch(everything, /no name, email or password yet/);
  });

  it('says the name and number reach the order spreadsheet, because lookupCustomer in excelSync.js does that', () => {
    assert.match(JSON.stringify(section('where')), /name and mobile number on your account/);
    assert.match(JSON.stringify(section('signin')), /order spreadsheet/);
  });

  it('every section still has an id, a title and content', () => {
    const ids = new Set();
    for (const s of PRIVACY_SECTIONS) {
      assert.ok(s.id && s.title && s.items.length > 0, s.id);
      assert.equal(ids.has(s.id), false, `duplicate ${s.id}`);
      ids.add(s.id);
    }
  });
});
