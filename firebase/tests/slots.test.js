'use strict';

// Tests for delivery slots (functions/shared/slots.js). Run: npm run test:unit   (no emulator, no network)
// All times are Indian time (IST = UTC+5:30), whatever the computer's own time zone is.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { availableSlots, validateSlot, istDate, WINDOWS, LEAD_MINUTES } = require('../functions/shared/slots');

// "2026-10-05 15:30 IST"
const at = (date, hhmm) => new Date(`${date}T${hhmm}:00+05:30`);

describe('availableSlots', () => {
  it('offers today and tomorrow, soonest first, in two-hour windows', () => {
    // 08:00 -> the earliest start is 09:30, so today's 9-11 am window has already closed: 5 + 6 slots
    const slots = availableSlots(at('2026-10-05', '08:00'));
    assert.equal(slots.length, WINDOWS.length - 1 + WINDOWS.length);
    const starts = slots.map((s) => s.startsAt);
    assert.deepEqual(starts, [...starts].sort(), 'soonest first');
    assert.deepEqual([...new Set(slots.map((s) => s.day))], ['today', 'tomorrow']);
    assert.ok(WINDOWS.every((w) => w.endHour - w.startHour === 2));
  });

  it('hides a window that starts sooner than the lead time (90 minutes)', () => {
    // 15:30 -> earliest start is 17:00, so 3-5 pm is gone and 5-7 pm is still open
    const labels = availableSlots(at('2026-10-05', '15:30')).filter((s) => s.day === 'today').map((s) => s.label);
    assert.deepEqual(labels, ['5 pm to 7 pm', '7 pm to 9 pm']);
    // one minute later, 5-7 pm closes too
    const later = availableSlots(at('2026-10-05', '15:31')).filter((s) => s.day === 'today').map((s) => s.label);
    assert.deepEqual(later, ['7 pm to 9 pm']);
    assert.equal(LEAD_MINUTES, 90);
  });

  it('offers only tomorrow late at night', () => {
    const slots = availableSlots(at('2026-10-05', '23:00'));
    assert.ok(slots.every((s) => s.day === 'tomorrow' && s.date === '2026-10-06'));
    assert.equal(slots.length, WINDOWS.length);
  });

  it('crosses month and year ends correctly', () => {
    assert.equal(availableSlots(at('2026-12-31', '23:00'))[0].date, '2027-01-01');
    assert.equal(availableSlots(at('2026-02-28', '23:00'))[0].date, '2026-03-01');
  });

  it('uses the INDIA date, not the UTC date, near midnight', () => {
    // 2026-10-05 20:00 UTC is already 6 Oct, 01:30 in India
    assert.equal(istDate(new Date('2026-10-05T20:00:00Z')), '2026-10-06');
    assert.equal(availableSlots(new Date('2026-10-05T20:00:00Z'))[0].date, '2026-10-06');
  });

  it('gives each slot a start time as a real instant', () => {
    const s = availableSlots(at('2026-10-05', '08:00')).find((x) => x.id === '1700-1900' && x.day === 'today');
    assert.equal(s.startsAt, '2026-10-05T11:30:00.000Z'); // 17:00 IST
  });
});

describe('validateSlot', () => {
  const now = at('2026-10-05', '15:30');

  it('treats no slot as "as soon as possible"', () => {
    assert.equal(validateSlot(null, now), null);
    assert.equal(validateSlot(undefined, now), null);
  });

  it('accepts an open slot and returns the full slot', () => {
    const s = validateSlot({ date: '2026-10-05', id: '1900-2100' }, now);
    assert.equal(s.label, '7 pm to 9 pm');
    assert.equal(s.startsAt, '2026-10-05T13:30:00.000Z');
  });

  it('says "gone" for a real slot that has closed', () => {
    assert.throws(() => validateSlot({ date: '2026-10-05', id: '1500-1700' }, now), { code: 'gone' });
    assert.throws(() => validateSlot({ date: '2026-10-05', id: '0900-1100' }, now), { code: 'gone' });
  });

  it('says "invalid" for anything we never offer', () => {
    const bad = [
      { date: '2026-10-07', id: '1900-2100' }, // the day after tomorrow
      { date: '2026-10-04', id: '1900-2100' }, // yesterday
      { date: '2026-10-05', id: '0300-0500' }, // not a window
      { date: '2026-10-05' },
      { id: '1900-2100' },
      { date: 5, id: '1900-2100' },
      { date: '05/10/2026', id: '1900-2100' },
      'tomorrow',
      42,
      [],
    ];
    for (const slot of bad) assert.throws(() => validateSlot(slot, now), { code: 'invalid' }, JSON.stringify(slot));
  });

  it('ignores extra fields the browser might send', () => {
    const s = validateSlot({ date: '2026-10-05', id: '1900-2100', price: 0 }, now);
    assert.deepEqual(Object.keys(s).sort(), ['date', 'day', 'id', 'label', 'startsAt']);
  });
});
