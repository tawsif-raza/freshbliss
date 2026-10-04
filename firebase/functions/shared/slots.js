'use strict';

// Delivery time slots: "As soon as possible", or a 2-hour window today or tomorrow.
//
// The browser has the SAME rules in web/lib/slots.js (so the page can list slots without a round trip).
// web/tests/slots.test.mjs loads both files and fails if they ever disagree.
//
// Rules, all in Indian time (IST, UTC+5:30, no daylight saving), so they do not depend on the
// customer's device clock or time zone:
//   - six windows a day: 9-11, 11-1, 1-3, 3-5, 5-7, 7-9
//   - today and tomorrow only
//   - a window is offered only while it starts at least LEAD_MINUTES from now (we need time to cut and pack)
//   - the SERVER checks the chosen slot again when the customer pays (validateSlot), with its own clock
//
// To change the hours (a Ramadan iftar window, for example), edit WINDOWS in BOTH files.

const IST_OFFSET_MINUTES = 330;
const LEAD_MINUTES = 90;
const DAYS_AHEAD = 2; // today and tomorrow

// startHour / endHour are 24-hour clock hours, in IST.
const WINDOWS = [
  { id: '0900-1100', startHour: 9, endHour: 11 },
  { id: '1100-1300', startHour: 11, endHour: 13 },
  { id: '1300-1500', startHour: 13, endHour: 15 },
  { id: '1500-1700', startHour: 15, endHour: 17 },
  { id: '1700-1900', startHour: 17, endHour: 19 },
  { id: '1900-2100', startHour: 19, endHour: 21 },
];

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

const pad = (n) => String(n).padStart(2, '0');

// "5 pm", "11 am", "12 pm"
function hourLabel(hour) {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${hour < 12 ? 'am' : 'pm'}`;
}

const windowLabel = (w) => `${hourLabel(w.startHour)} to ${hourLabel(w.endHour)}`;

// The calendar date in IST for an instant, as "YYYY-MM-DD".
function istDate(instant) {
  const shifted = new Date(instant.getTime() + IST_OFFSET_MINUTES * 60000);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

// The instant a given IST date and hour happens, as a Date.
function istInstant(date, hour) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hour, 0, 0) - IST_OFFSET_MINUTES * 60000);
}

// Adds whole days to an IST "YYYY-MM-DD" date.
function addDays(date, days) {
  const [y, m, d] = date.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

// Every slot still open at `now`, soonest first.
// Each: { date, id, label, startsAt (ISO string), day: 'today' | 'tomorrow' }
function availableSlots(now = new Date()) {
  const today = istDate(now);
  const earliest = now.getTime() + LEAD_MINUTES * 60000;
  const out = [];
  for (let offset = 0; offset < DAYS_AHEAD; offset++) {
    const date = addDays(today, offset);
    for (const w of WINDOWS) {
      const start = istInstant(date, w.startHour);
      if (start.getTime() < earliest) continue;
      out.push({ date, id: w.id, label: windowLabel(w), startsAt: start.toISOString(), day: offset === 0 ? 'today' : 'tomorrow' });
    }
  }
  return out;
}

// Checks a slot the customer chose. Returns the full slot, or null for "as soon as possible"
// (slot is null or undefined). Throws an Error with code 'invalid' or 'gone' otherwise:
//   invalid  not a slot we ever offer (a tampered request)
//   gone     a real slot, but too late to book now
function validateSlot(slot, now = new Date()) {
  if (slot === null || slot === undefined) return null;
  const bad = (code, message) => Object.assign(new Error(message), { code });
  if (typeof slot !== 'object' || Array.isArray(slot)) throw bad('invalid', 'That delivery slot is not valid.');
  const { date, id } = slot;
  if (typeof date !== 'string' || !DATE_FORMAT.test(date) || typeof id !== 'string') throw bad('invalid', 'That delivery slot is not valid.');
  const window = WINDOWS.find((w) => w.id === id);
  const today = istDate(now);
  const offered = [];
  for (let offset = 0; offset < DAYS_AHEAD; offset++) offered.push(addDays(today, offset));
  if (!window || !offered.includes(date)) throw bad('invalid', 'That delivery slot is not valid.');
  const open = availableSlots(now).find((s) => s.date === date && s.id === id);
  if (!open) throw bad('gone', 'That delivery slot is no longer available. Please pick another time.');
  return open;
}

module.exports = { IST_OFFSET_MINUTES, LEAD_MINUTES, DAYS_AHEAD, WINDOWS, availableSlots, validateSlot, istDate, windowLabel };
