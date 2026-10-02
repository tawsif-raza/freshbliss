// The privacy page: /privacy
// What the shop collects, why, and where it is kept. The wording is in content/privacy.js.

import Head from 'next/head';
import Link from 'next/link';
import { BUSINESS } from '@/content/business';
import { PRIVACY_SECTIONS, PRIVACY_UPDATED } from '@/content/privacy';

export default function PrivacyPage() {
  return (
    <>
      <Head>
        <title>Privacy | FreshBliss</title>
        <meta name="description" content="What FreshBliss collects when you order, why, and where it is kept." />
      </Head>
      <div className="fb-container py-14.5">
        <article className="max-w-3xl">
          <p className="text-label text-gold">Your information</p>
          <h1 className="mt-2 text-heading-2 text-brand-text">Privacy</h1>
          <p className="mt-2 text-lead text-ink-muted">What {BUSINESS.legalName || BUSINESS.name} collects when you order, why, and where it is kept.</p>
          <p className="mt-1 text-small text-ink-muted">Last updated {PRIVACY_UPDATED}</p>

          {PRIVACY_SECTIONS.map((section) => (
            <section key={section.id} aria-labelledby={`privacy-${section.id}`} className="mt-8.5">
              <h2 id={`privacy-${section.id}`} className="text-heading-3 text-ink">
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

          {BUSINESS.contact && (
            <section aria-labelledby="privacy-ask" className="mt-8.5">
              <h2 id="privacy-ask" className="text-heading-3 text-ink">
                Questions about your information
              </h2>
              <p className="mt-3 text-body text-ink">To ask what we hold about you, or to ask us to change or remove it, contact us at {BUSINESS.contact}.</p>
            </section>
          )}

          <p className="mt-10">
            <Link href="/products" className="inline-grid min-h-11 place-items-center rounded-pill border border-brand px-6 text-nav-link text-brand-text hover:bg-surface-cream">
              Back to the shop
            </Link>
          </p>
        </article>
      </div>
    </>
  );
}
