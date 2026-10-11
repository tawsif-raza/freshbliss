// The FAQ page: /faq. Questions grouped by topic, each an animated accordion item (components/AccordionItem.js),
// with a "Still have questions?" banner at the bottom that opens an email to support.
//
// REVIEW BEFORE LAUNCH (docs/GO_LIVE.md): the answers below are promises the shop is held to. Check each one
// against how the business really runs, and against the shorter FAQ on the home page (content/storefront.js),
// which must say the same thing.

import Head from 'next/head';
import Link from 'next/link';
import { Mail } from 'lucide-react';
import AccordionItem from '@/components/AccordionItem';
import { BUSINESS } from '@/content/business';

const FAQ_GROUPS = [
  {
    id: 'delivery',
    title: 'Delivery & Orders',
    items: [
      {
        question: 'How fast is the delivery?',
        answer:
          'We specialize in quick commerce. Orders placed within our active Bengaluru delivery zones (Zone A & B) are typically delivered within 60 to 90 minutes.',
      },
      {
        question: 'What happens if I am not home to receive my order?',
        answer:
          'Our delivery partners will attempt to contact you. If unreachable, we will safely leave the package with your building security (if permitted) or reschedule the delivery for later in the day.',
      },
      {
        question: 'Can I modify or cancel my order after placing it?',
        answer:
          'You can cancel from the My orders page until your order is packed (that is, while it still says "Payment confirmed" or "Preparing"). Once it is packed or out for delivery it can no longer be cancelled online, so please contact support. Orders cannot be edited after payment. See our Cancellation & Refunds page for how refunds work.',
      },
      {
        question: 'Is there a minimum order value for free delivery?',
        answer: 'Yes, orders of ₹499 or more qualify for free delivery. For orders below this amount, a flat ₹30 delivery fee is applied during checkout.',
      },
    ],
  },
  {
    id: 'sourcing',
    title: 'Sourcing & Quality',
    items: [
      {
        question: 'Are your fruits 100% organic and pesticide-free?',
        answer:
          'Absolutely. We partner directly with certified organic farms across Karnataka and Maharashtra. We guarantee zero chemical ripening and no synthetic pesticides.',
      },
      {
        question: 'What happens if an item I ordered is out of stock?',
        answer:
          "Because we deal in fresh daily harvests, items occasionally run out. We check stock before you pay. If the last box sells out in the moments while you are paying, we cancel the whole order (not just that item) and refund the full amount to your original payment method, and you can order again. We never substitute with lower-quality items.",
      },
    ],
  },
  {
    id: 'payments',
    title: 'Payments & Returns',
    items: [
      {
        question: 'What is your return and refund policy?',
        answer:
          "Your satisfaction is guaranteed. If you receive a damaged or subpar item, please report it via the 'My Orders' page within 12 hours of delivery. We will issue a no-questions-asked refund or replacement.",
      },
      {
        question: 'What payment methods do you accept?',
        answer: 'We accept all major Credit/Debit Cards, Net Banking, and UPI (Google Pay, PhonePe, Paytm) via our secure Razorpay gateway.',
      },
    ],
  },
];

export default function FaqPage() {
  return (
    <>
      <Head>
        <title>Frequently Asked Questions | FreshBliss</title>
        <meta name="description" content="Answers about FreshBliss delivery, sourcing and quality, payments, refunds and returns." />
      </Head>

      {/* Header: deep green with cream text, set in the serif like every heading */}
      <section aria-labelledby="faq-page-title" className="bg-gradient-to-br from-hero-deep to-hero-mid text-on-hero">
        <div className="fb-container py-14.5 text-center md:py-20">
          <p className="text-label text-gold-bright">Help centre</p>
          <h1 id="faq-page-title" className="mt-3 text-heading-2 text-on-brand md:text-[44px] md:leading-[1.15]">
            Frequently Asked Questions
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-lead text-on-hero">Delivery, sourcing, payments and refunds: the things our customers ask us most.</p>
        </div>
      </section>

      <div className="fb-container py-14.5">
        <div className="mx-auto flex max-w-3xl flex-col gap-12">
          {FAQ_GROUPS.map((group) => (
            <section key={group.id} aria-labelledby={`faq-${group.id}`}>
              <h2 id={`faq-${group.id}`} className="border-b border-gold-bright/50 pb-2 text-heading-3 text-brand-text">
                {group.title}
              </h2>
              <div className="mt-4 flex flex-col gap-3">
                {group.items.map((item) => (
                  <AccordionItem key={item.question} question={item.question}>
                    <p>{item.answer}</p>
                  </AccordionItem>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Still stuck? Write to us. */}
        <section aria-labelledby="faq-help-title" className="mx-auto mt-16 max-w-3xl overflow-hidden rounded-2xl bg-gradient-to-br from-hero-deep to-hero-mid p-8 text-center text-on-hero shadow-xl md:p-12">
          <h2 id="faq-help-title" className="text-heading-2 text-on-brand">
            Still have questions? We&apos;re here to help.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-body text-on-hero">Write to us and a real person will get back to you.</p>
          <a
            href={`mailto:${BUSINESS.supportEmail}`}
            className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-pill bg-gold-bright px-7 text-nav-link text-on-gold hover:brightness-95 motion-safe:transition-[filter] motion-safe:duration-200"
          >
            <Mail size={18} aria-hidden="true" />
            Email {BUSINESS.supportEmail}
          </a>
          <p className="mt-4 text-body text-on-hero">
            Or{' '}
            <Link href="/contact" className="font-bold text-on-brand underline underline-offset-4">
              see every way to contact us
            </Link>
            .
          </p>
        </section>
      </div>
    </>
  );
}
