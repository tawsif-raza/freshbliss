import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as web from '../lib/slots.js';

// The server's copy, plain CommonJS with no Firebase imports, so it loads here.
const server = createRequire(import.meta.url)('../../firebase/functions/shared/slots.js');

const at = (date, hhmm) => new Date(`${date}T${hhmm}:00+05:30`);

describe('web slots match the server slots', () => {
  it('uses the same hours and rules', () => {
    assert.deepEqual(web.WINDOWS, server.WINDOWS);
    assert.equal(web.LEAD_MINUTES, server.LEAD_MINUTES);
    assert.equal(web.DAYS_AHEAD, server.DAYS_AHEAD);
    assert.equal(web.IST_OFFSET_MINUTES, server.IST_OFFSET_MINUTES);
  });

  it('lists the same open slots at every half hour across several days, including month and year ends', () => {
    for (const day of ['2026-10-05', '2026-10-31', '2026-12-31', '2027-02-28']) {
      for (let minutes = 0; minutes < 24 * 60; minutes += 30) {
        const now = new Date(at(day, '00:00').getTime() + minutes * 60000);
        assert.deepEqual(web.availableSlots(now), server.availableSlots(now), `${day} +${minutes}min`);
      }
    }
  });

  it('accepts and refuses the same slots', () => {
    const now = at('2026-10-05', '15:30');
    const tries = [
      null,
      { date: '2026-10-05', id: '1900-2100' },
      { date: '2026-10-05', id: '1500-1700' },
      { date: '2026-10-06', id: '0900-1100' },
      { date: '2026-10-07', id: '0900-1100' },
      { date: '2026-10-05', id: 'x' },
      'soon',
    ];
    for (const slot of tries) {
      const run = (fn) => {
        try {
          return { ok: fn(slot, now) };
        } catch (e) {
          return { code: e.code };
        }
      };
      assert.deepEqual(run(web.validateSlot), run(server.validateSlot), JSON.stringify(slot));
    }
  });
});

describe('slotText', () => {
  const now = at('2026-10-05', '15:30');
  it('says Today and Tomorrow, and a short date for anything else', () => {
    assert.equal(web.slotText({ date: '2026-10-05', label: '7 pm to 9 pm' }, now), 'Today, 7 pm to 9 pm');
    assert.equal(web.slotText({ date: '2026-10-06', label: '9 am to 11 am' }, now), 'Tomorrow, 9 am to 11 am');
    assert.match(web.slotText({ date: '2026-10-09', label: '9 am to 11 am' }, now), /Fri.*9 Oct, 9 am to 11 am/);
  });
  it('shows nothing for no slot or a broken one', () => {
    assert.equal(web.slotText(null, now), '');
    assert.equal(web.slotText({}, now), '');
  });
});

describe('slotChoice', () => {
  it('keeps only the date and window id (what the cart stores)', () => {
    assert.deepEqual(web.slotChoice({ date: '2026-10-05', id: '1900-2100', label: 'x', startsAt: 'y' }), { date: '2026-10-05', id: '1900-2100' });
    assert.equal(web.slotChoice(null), null);
  });
});
