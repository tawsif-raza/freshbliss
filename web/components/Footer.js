// The site footer: the brand and a newsletter box, quick links, the Bengaluru delivery footprint, and
// opening hours and contact details. The brand and newsletter have a row of their own; below it the link columns stack into
// one column on phones (two for the shop links), two on tablets, four on wide screens. Colours come from the design tokens (deep green ground, gold accents).
//
// Honest by design:
//   - The newsletter box only checks the address looks right. Nothing is saved or sent anywhere yet, and it
//     says so, rather than telling someone they have subscribed when they have not. Connect it to a real
//     mailing service before launch, or remove it (docs/GO_LIVE.md).
//   - The delivery footprint comes from the LIVE delivery zones, so it is always the real list.
//   - Opening hours and contact details appear only if the shop has filled them in (content/business.js).

import Link from 'next/link';
import { useId, useState } from 'react';
import { Clock, Mail, MapPin, Phone } from 'lucide-react';
import { CATEGORIES } from '@/content/storefront';
import { BUSINESS } from '@/content/business';
import { phoneNumber } from '@/lib/contact';
import { describeEta, feeLabel, useZones } from '@/lib/zones';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function Newsletter() {
  const id = useId();
  const [email, setEmail] = useState('');
  const [state, setState] = useState('idle'); // idle | invalid | noted

  function submit(event) {
    event.preventDefault();
    // UI only: nothing is stored or sent. Say so plainly.
    setState(EMAIL.test(email.trim()) ? 'noted' : 'invalid');
  }

  return (
    <form onSubmit={submit} noValidate>
      <label htmlFor={id} className="text-nav-link text-on-brand">
        Fresh news, now and then
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Mail size={18} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-on-hero/70" />
          <input
            id={id}
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (state !== 'idle') setState('idle');
            }}
            autoComplete="email"
            placeholder="you@example.com"
            aria-invalid={state === 'invalid'}
            aria-describedby={`${id}-message`}
            className={`min-h-11 w-full rounded-pill border bg-on-hero/10 pr-4 pl-10 text-body text-on-brand placeholder:text-on-hero/60 ${state === 'invalid' ? 'border-gold-bright' : 'border-on-hero/30'}`}
          />
        </div>
        <button type="submit" className="min-h-11 rounded-pill bg-gold-bright px-6 text-nav-link text-on-gold hover:brightness-95">
          Notify me
        </button>
      </div>
      <p id={`${id}-message`} role="status" className="mt-2 min-h-[1.5em] text-small text-on-hero">
        {state === 'invalid' && 'Enter a valid email address.'}
        {state === 'noted' && 'Thank you. Newsletter sign-ups are not open yet, so we have not saved your address. Please check back soon.'}
      </p>
    </form>
  );
}

function Heading({ children }) {
  return <h2 className="text-label text-gold-bright">{children}</h2>;
}

const linkClass = 'inline-flex min-h-11 items-center lg:min-h-9 text-body text-on-hero hover:text-on-brand hover:underline';

export default function Footer() {
  const { zones } = useZones();
  const categories = CATEGORIES.filter((c) => c.id !== 'all');
  const hasContact = BUSINESS.hours || BUSINESS.contact || BUSINESS.address;
  const phone = phoneNumber(BUSINESS.contact); // null when `contact` is an email address

  return (
    <footer className="fb-no-print mt-14.5 bg-hero-deep text-on-hero">
      <div className="fb-container py-14.5">
        {/* brand + newsletter: a row of their own, so the link columns below stay narrow and short */}
        <div className="grid gap-8 border-b border-on-hero/15 pb-10 lg:grid-cols-2 lg:items-end lg:gap-16">
          <div>
            <p className="font-serif text-[28px] leading-none font-bold text-on-brand">{BUSINESS.name}</p>
            <p className="mt-3 max-w-md text-body text-on-hero">Freshly sliced. Perfectly packed. Always.</p>
          </div>
          <Newsletter />
        </div>

        <div className="mt-10 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
        {/* shop links: two across on a phone, so the list is half as tall */}
        <nav aria-label="Shop">
          <Heading>Shop</Heading>
          <ul className="mt-3 grid grid-cols-2 gap-x-4 sm:grid-cols-1">
            <li>
              <Link href="/products" className={linkClass}>
                Shop all boxes
              </Link>
            </li>
            {categories.map((c) => (
              <li key={c.id}>
                <Link href={`/?category=${c.id}#shop`} className={linkClass}>
                  {c.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* help and policies */}
        <nav aria-label="Help and policies">
          <Heading>Help</Heading>
          <ul className="mt-3 flex flex-col">
            <li>
              <Link href="/account" className={linkClass}>
                My account
              </Link>
            </li>
            <li>
              <Link href="/faq" className={linkClass}>
                FAQ
              </Link>
            </li>
            <li>
              <Link href="/contact" className={linkClass}>
                Contact Us
              </Link>
            </li>
            <li>
              <Link href="/refunds" className={linkClass}>
                Cancellation &amp; Refunds
              </Link>
            </li>
            <li>
              <Link href="/terms" className={linkClass}>
                Terms of Service
              </Link>
            </li>
            <li>
              <Link href="/privacy" className={linkClass}>
                Privacy Policy
              </Link>
            </li>
          </ul>
        </nav>

        {/* delivery footprint */}
        <div>
          <Heading>Where we deliver</Heading>
          <p className="mt-3 flex items-start gap-2 text-body text-on-hero">
            <MapPin size={18} aria-hidden="true" className="mt-1 shrink-0 text-gold-bright" />
            Bengaluru, to selected pincodes
          </p>
          {zones.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2">
              {zones.map((zone) => (
                <li key={zone.id} className="rounded-md border border-on-hero/20 px-3 py-2 text-small text-on-hero">
                  <span className="font-bold text-on-brand">{zone.name}</span>
                  <span>: {zone.fee === 0 ? 'free delivery' : `${feeLabel(zone.fee)} delivery`}</span>
                  {describeEta(zone) && <span>, {describeEta(zone)}</span>}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-small text-on-hero">Enter your pincode at checkout to see your exact fee.</p>
        </div>

        {/* hours and contact: only what the shop has filled in */}
        <div>
          <Heading>Hours and contact</Heading>
          {hasContact ? (
            <ul className="mt-3 flex flex-col gap-3 text-body text-on-hero">
              {BUSINESS.hours && (
                <li className="flex items-start gap-2">
                  <Clock size={18} aria-hidden="true" className="mt-1 shrink-0 text-gold-bright" />
                  <span>
                    <span className="sr-only">Operating hours: </span>
                    {BUSINESS.hours}
                  </span>
                </li>
              )}
              {BUSINESS.address && (
                <li className="flex items-start gap-2">
                  <MapPin size={18} aria-hidden="true" className="mt-1 shrink-0 text-gold-bright" />
                  <span>{BUSINESS.address}</span>
                </li>
              )}
              {BUSINESS.contact && (
                <li className="flex items-start gap-2">
                  {/* `contact` may be a phone number or an email address: the icon and the link follow what it is */}
                  {phone ? (
                    <Phone size={18} aria-hidden="true" className="mt-1 shrink-0 text-gold-bright" />
                  ) : (
                    <Mail size={18} aria-hidden="true" className="mt-1 shrink-0 text-gold-bright" />
                  )}
                  <a href={phone ? `tel:${phone}` : `mailto:${BUSINESS.contact}`} className="underline-offset-4 hover:underline">
                    {BUSINESS.contact}
                  </a>
                </li>
              )}
            </ul>
          ) : (
            <p className="mt-3 text-body text-on-hero">Track any order live from My orders.</p>
          )}
        </div>
        </div>
      </div>

      <div className="border-t border-on-hero/15">
        <div className="fb-container flex flex-col gap-1 py-5 text-small text-on-hero sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {BUSINESS.legalName || BUSINESS.name}. All rights reserved.
            {BUSINESS.fssai && <span className="block sm:inline sm:ml-3">FSSAI Lic. No. {BUSINESS.fssai}</span>}
          </p>
          <p>Fresh fruit boxes, delivered in Bengaluru. Payments secured by Razorpay.</p>
        </div>
      </div>
    </footer>
  );
}
