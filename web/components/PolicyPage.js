// Shared layout for the plain-text policy pages (/terms, /refunds and every /policies/<id>). The wording comes from the
// `policies` collection in Firestore, or the built-in copy in content/policies.js (lib/policies.js decides which).
//
// A policy marked `placeholder` is dummy text: it carries a warning banner and is hidden from search engines.

import Head from 'next/head';
import Link from 'next/link';
import { BUSINESS } from '@/content/business';
import { POLICIES_UPDATED } from '@/content/policies';

export default function PolicyPage({ slug, kicker, title, description, lead, sections, updated = POLICIES_UPDATED, placeholder = false }) {
  const contact = BUSINESS.contact || BUSINESS.supportEmail;
  return (
    <>
      <Head>
        <title>{`${title} | ${BUSINESS.name}`}</title>
        <meta name="description" content={description} />
        {placeholder && <meta name="robots" content="noindex" />}
      </Head>
      <div className="fb-container py-14.5">
        <article className="max-w-3xl">
          <p className="text-label text-gold">{kicker}</p>
          <h1 className="mt-2 text-heading-2 text-brand-text">{title}</h1>
          <p className="mt-2 text-lead text-ink-muted">{lead}</p>
          {updated && <p className="mt-1 text-small text-ink-muted">Last updated {updated}</p>}

          {placeholder && (
            <p role="note" className="mt-5 rounded-xl border border-gold bg-surface-callout p-4 text-body text-ink">
              <strong>Placeholder text, not in force.</strong> This page is a draft for testing the website. It has not been reviewed and does not
              describe a promise from {BUSINESS.name}. Anything in [square brackets] is still to be decided.
            </p>
          )}

          {sections.map((section) => (
            <section key={section.id} aria-labelledby={`${slug}-${section.id}`} className="mt-8.5">
              <h2 id={`${slug}-${section.id}`} className="text-heading-3 text-ink">
                {section.title}
              </h2>
              <div className="mt-3 flex flex-col gap-3">
                {section.items.map((item, i) =>
                  item.type === 'ul' ? (
                    <ul key={i} className="list-disc space-y-2 pl-6 text-body text-ink">
                      {item.items.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  ) : (
                    <p key={i} className="text-body text-ink">
                      {item.text}
                    </p>
                  ),
                )}
              </div>
            </section>
          ))}

          <section aria-labelledby={`${slug}-contact`} className="mt-8.5">
            <h2 id={`${slug}-contact`} className="text-heading-3 text-ink">
              Contact us
            </h2>
            <p className="mt-3 text-body text-ink">
              Write to us at {contact}, and include your order number.
              {BUSINESS.fssai && ` FSSAI Lic. No. ${BUSINESS.fssai}.`}
            </p>
          </section>

          <p className="mt-10 flex flex-wrap gap-3">
            <Link href="/account" className="inline-grid min-h-11 place-items-center rounded-pill border border-brand px-6 text-nav-link text-brand-text hover:bg-surface-cream">
              My orders
            </Link>
            <Link href="/products" className="inline-grid min-h-11 place-items-center rounded-pill border border-brand px-6 text-nav-link text-brand-text hover:bg-surface-cream">
              Back to the shop
            </Link>
          </p>
        </article>
      </div>
    </>
  );
}
