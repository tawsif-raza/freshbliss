// The Contact Us page: /contact. Linked from the header, the footer, the FAQ and the chat assistant.
//
//   - Ways to reach us: the support email always; phone, WhatsApp, opening hours and address only once they are filled
//     in content/business.js (nothing is made up).
//   - A message form: name, email, topic, an optional order number and the message. There is no message backend yet,
//     so Send opens the visitor's own email app with everything filled in (lib/contact.js). The form says so plainly.
//   - Quick links to the pages that answer most questions (track an order, FAQ, refunds).
//
// The words are in content/contact.js.

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, Clock, Mail, MapPin, MessageCircle, Phone, Send } from 'lucide-react';
import { Field, inputClass } from '@/components/Field';
import Seo from '@/components/Seo';
import { BUSINESS } from '@/content/business';
import { CONTACT, CONTACT_TOPICS, QUICK_LINKS } from '@/content/contact';
import { MESSAGE_MAX, NAME_MAX, contactMailto, phoneNumber, validateContact, whatsappHref } from '@/lib/contact';

const EMPTY = { name: '', email: '', topic: CONTACT_TOPICS[0].id, orderNumber: '', message: '' };
const box = (invalid) => `${inputClass(invalid)} min-h-11 focus-visible:outline-brand`;

// One way to reach us: an icon, what it is, and the detail (a link when it can be one).
function Channel({ icon: Icon, title, children }) {
  return (
    <li className="flex gap-4 rounded-xl border border-line/70 bg-surface-card p-5 shadow-card">
      <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-hero-mid to-hero-deep text-gold-bright">
        <Icon size={20} />
      </span>
      <div className="min-w-0">
        <p className="text-label text-gold">{title}</p>
        <div className="mt-1 text-body break-words text-ink">{children}</div>
      </div>
    </li>
  );
}

function ContactForm() {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [sent, setSent] = useState(false);
  const set = (key) => (event) => {
    setForm((f) => ({ ...f, [key]: event.target.value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined })); // the error goes once they start fixing it
  };

  function onSubmit(event) {
    event.preventDefault();
    const found = validateContact(form);
    setErrors(found);
    const first = ['name', 'email', 'message'].find((k) => found[k]);
    if (first) {
      event.currentTarget.elements.namedItem(first)?.focus();
      return;
    }
    window.location.href = contactMailto(form, BUSINESS.supportEmail, CONTACT_TOPICS);
    setSent(true);
  }

  const left = MESSAGE_MAX - form.message.trim().length;

  return (
    <form noValidate onSubmit={onSubmit} aria-labelledby="contact-form-title" className="rounded-2xl border border-line/70 bg-surface-card p-6 shadow-card md:p-8">
      <h2 id="contact-form-title" className="text-heading-3 text-brand-text">
        {CONTACT.formTitle}
      </h2>
      <p className="mt-1 text-small text-ink-muted">{CONTACT.formNote}</p>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <Field label="Your name" error={errors.name}>
          {({ id, invalid, describedBy }) => (
            <input id={id} name="name" type="text" autoComplete="name" maxLength={NAME_MAX} value={form.name} onChange={set('name')} aria-invalid={invalid} aria-describedby={describedBy} className={box(invalid)} />
          )}
        </Field>
        <Field label="Email" error={errors.email}>
          {({ id, invalid, describedBy }) => (
            <input id={id} name="email" type="email" autoComplete="email" inputMode="email" value={form.email} onChange={set('email')} aria-invalid={invalid} aria-describedby={describedBy} className={box(invalid)} />
          )}
        </Field>
        <Field label="What is it about?">
          {({ id, describedBy }) => (
            <select id={id} name="topic" value={form.topic} onChange={set('topic')} aria-describedby={describedBy} className={box(false)}>
              {CONTACT_TOPICS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Order number" optional hint="On your receipt, for example FB-1A2B3C4D.">
          {({ id, describedBy }) => (
            <input id={id} name="orderNumber" type="text" maxLength={40} value={form.orderNumber} onChange={set('orderNumber')} aria-describedby={describedBy} className={box(false)} />
          )}
        </Field>
        <div className="sm:col-span-2">
          <Field label="Message" error={errors.message}>
            {({ id, invalid, describedBy }) => (
              <textarea
                id={id}
                name="message"
                rows={6}
                maxLength={MESSAGE_MAX}
                value={form.message}
                onChange={set('message')}
                aria-invalid={invalid}
                aria-describedby={describedBy}
                className={`${inputClass(invalid)} py-2.5 focus-visible:outline-brand`}
              />
            )}
          </Field>
          <p className="mt-1 text-right text-[12px] text-ink-muted" aria-live="polite">
            {left < 200 ? `${Math.max(0, left)} characters left` : ''}
          </p>
        </div>
      </div>

      <button
        type="submit"
        className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-pill bg-gold-bright px-7 text-nav-link text-on-gold motion-safe:transition-[filter] hover:brightness-95"
      >
        <Send size={18} aria-hidden="true" />
        Send message
      </button>

      {sent && (
        <p role="status" className="mt-4 rounded-lg bg-surface-tag px-4 py-3 text-small text-ink">
          {CONTACT.sentNote}{' '}
          <a href={`mailto:${BUSINESS.supportEmail}`} className="font-bold text-brand-text underline">
            {BUSINESS.supportEmail}
          </a>
          .
        </p>
      )}
    </form>
  );
}

export default function ContactPage() {
  const phone = phoneNumber(BUSINESS.contact);
  const whatsapp = whatsappHref(BUSINESS.contact);
  // business.js `contact` may be an email address rather than a phone number; show it only if it is a different one.
  const otherEmail = !phone && BUSINESS.contact && BUSINESS.contact.includes('@') && BUSINESS.contact !== BUSINESS.supportEmail ? BUSINESS.contact : '';

  return (
    <>
      <Seo title="Contact Us | FreshBliss" description="Contact FreshBliss about an order, a delivery or a fruit box. Email us, or send a message." path="/contact" />

      {/* Header: the same deep green banner as the FAQ */}
      <section aria-labelledby="contact-page-title" className="bg-gradient-to-br from-hero-deep to-hero-mid text-on-hero">
        <div className="fb-container py-14.5 text-center md:py-20">
          <p className="text-label text-gold-bright">{CONTACT.eyebrow}</p>
          <h1 id="contact-page-title" className="mt-3 text-heading-2 text-on-brand md:text-[44px] md:leading-[1.15]">
            {CONTACT.title}
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-lead text-on-hero">{CONTACT.lead}</p>
        </div>
      </section>

      <div className="fb-container py-14.5">
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          {/* Ways to reach us, then quick help */}
          <div className="flex flex-col gap-10">
            <section aria-labelledby="contact-ways-title">
              <h2 id="contact-ways-title" className="text-heading-3 text-brand-text">
                Reach us directly
              </h2>
              <ul className="mt-4 flex flex-col gap-3">
                <Channel icon={Mail} title="Email">
                  <a href={`mailto:${BUSINESS.supportEmail}`} className="font-bold text-brand-text underline-offset-4 hover:underline">
                    {BUSINESS.supportEmail}
                  </a>
                  <p className="text-small text-ink-muted">Best for anything about an order. Include your order number if you have one.</p>
                </Channel>
                {phone && (
                  <Channel icon={Phone} title="Phone">
                    <a href={`tel:${phone}`} className="font-bold text-brand-text underline-offset-4 hover:underline">
                      {BUSINESS.contact}
                    </a>
                  </Channel>
                )}
                {whatsapp && (
                  <Channel icon={MessageCircle} title="WhatsApp">
                    <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="font-bold text-brand-text underline-offset-4 hover:underline">
                      Chat with us on WhatsApp
                    </a>
                  </Channel>
                )}
                {otherEmail && (
                  <Channel icon={Mail} title="Other enquiries">
                    <a href={`mailto:${otherEmail}`} className="font-bold text-brand-text underline-offset-4 hover:underline">
                      {otherEmail}
                    </a>
                  </Channel>
                )}
                {BUSINESS.hours && (
                  <Channel icon={Clock} title="Opening hours">
                    {BUSINESS.hours}
                  </Channel>
                )}
                <Channel icon={MapPin} title={BUSINESS.address ? 'Address' : 'Where we deliver'}>
                  {BUSINESS.address || 'Selected pincodes across Bengaluru.'}
                  {!BUSINESS.address && (
                    <p className="text-small text-ink-muted">
                      <Link href="/#delivery" className="font-bold text-brand-text underline-offset-4 hover:underline">
                        Check your pincode
                      </Link>{' '}
                      to see if we reach you.
                    </p>
                  )}
                </Channel>
              </ul>
            </section>

            <section aria-labelledby="contact-quick-title">
              <h2 id="contact-quick-title" className="text-heading-3 text-brand-text">
                {CONTACT.quickTitle}
              </h2>
              <ul className="mt-4 flex flex-col gap-2">
                {QUICK_LINKS.map((q) => (
                  <li key={q.href}>
                    <Link href={q.href} className="group flex items-center justify-between gap-3 rounded-xl border border-line/70 px-4 py-3 hover:border-gold-bright hover:bg-surface-callout">
                      <span>
                        <span className="block text-nav-link text-ink">{q.label}</span>
                        <span className="block text-small text-ink-muted">{q.text}</span>
                      </span>
                      <ArrowRight size={18} aria-hidden="true" className="shrink-0 text-brand-text motion-safe:transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <ContactForm />
        </div>
      </div>
    </>
  );
}
