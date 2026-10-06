// Choose when to deliver: "As soon as possible", or a 2-hour window today or tomorrow.
// Real radio buttons underneath, so the arrow keys and screen readers work (same pattern as TipSelector).
//
// The list comes from lib/slots.js (the same rules the server uses). It refreshes every minute, so a
// window that closes while the customer is deciding disappears; if it was the one they picked, they are
// moved back to "As soon as possible" and told why. The server checks the slot again when they pay.

import { useEffect, useId, useState } from 'react';
import { availableSlots } from '@/lib/slots';

const DAY_TITLE = { today: 'Today', tomorrow: 'Tomorrow' };

export default function SlotPicker({ value, onChange, etaText = '', disabled = false }) {
  const group = useId();
  const [now, setNow] = useState(() => new Date());
  const [closedSlot, setClosedSlot] = useState(null); // the window that closed under the customer, if any

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const slots = availableSlots(now);
  const stillOpen = !value || slots.some((s) => s.date === value.date && s.id === value.id);

  // Remember which window closed (React allows adjusting our own state while rendering, once per change).
  if (!stillOpen && closedSlot !== value) setClosedSlot(value);

  useEffect(() => {
    if (!stillOpen) onChange(null); // back to "As soon as possible"
  }, [stillOpen, onChange]);

  const closedNote = closedSlot && !value ? 'That time window just closed, so we switched you back to "As soon as possible". Pick another if you like.' : '';

  const choose = (slot) => {
    setClosedSlot(null);
    onChange(slot);
  };

  const radio = (id, checked, onPick, label) => (
    <div key={id}>
      <input id={id} type="radio" name={group} checked={checked} onChange={onPick} className="peer sr-only" />
      <label
        htmlFor={id}
        className="inline-grid min-h-11 cursor-pointer place-items-center rounded-pill border border-green-accent bg-surface-card px-4 text-nav-link text-brand-text motion-safe:transition-colors peer-checked:border-brand peer-checked:bg-brand peer-checked:text-on-brand peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus-ring peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
      >
        {label}
      </label>
    </div>
  );

  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="text-nav-link text-ink">Delivery time</legend>
      <p className="text-small text-ink-muted">Deliver right away, or choose a window that suits you. Windows open until 90 minutes before they start.</p>

      <div className="mt-2 flex flex-wrap gap-3">{radio(`${group}-asap`, !value, () => choose(null), etaText ? `As soon as possible (${etaText})` : 'As soon as possible')}</div>

      {['today', 'tomorrow'].map((day) => {
        const forDay = slots.filter((s) => s.day === day);
        if (forDay.length === 0) return null;
        return (
          <div key={day} className="mt-4">
            <p className="text-small font-bold text-ink">{DAY_TITLE[day]}</p>
            <div className="mt-2 flex flex-wrap gap-3">
              {forDay.map((s) => radio(`${group}-${s.date}-${s.id}`, Boolean(value) && value.date === s.date && value.id === s.id, () => choose(s), s.label))}
            </div>
          </div>
        );
      })}

      <p role="status" className="mt-3 text-small text-ink">
        {closedNote}
      </p>
    </fieldset>
  );
}
