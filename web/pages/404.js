// Shown for any address that does not exist, including a fruit box that is not sold (any more). Search engines get a
// real 404 status with it (pages/products/[slug].js returns `notFound`), so dead links drop out of their results.
//
// A dead end loses a visitor, so the page offers the ways back: the shop, the home page, and a link to each category.

import Head from 'next/head';
import Link from 'next/link';
import { Compass } from 'lucide-react';
import { CATEGORIES } from '@/content/storefront';

export default function NotFoundPage() {
  const categories = CATEGORIES.filter((c) => c.id !== 'all');
  return (
    <>
      <Head>
        <title>Page not found | FreshBliss</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="fb-container py-14.5 md:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-brand text-gold-bright">
            <Compass size={32} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <p aria-hidden="true" className="mt-6 font-serif text-[88px] leading-none font-bold text-gold/40 select-none">
            404
          </p>
          <h1 className="mt-2 text-heading-2 text-brand-text">We could not find that page.</h1>
          <p className="mt-3 text-lead text-ink-muted">The link may be wrong, or this fruit box may have sold out for good. Let us get you back to something fresh.</p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/products" className="inline-grid min-h-12 place-items-center rounded-pill bg-gold-bright px-7 text-nav-link text-on-gold hover:brightness-95">
              See all fruit boxes
            </Link>
            <Link href="/" className="inline-grid min-h-12 place-items-center rounded-pill border border-brand px-7 text-nav-link text-brand-text hover:bg-surface-cream">
              Go to the home page
            </Link>
          </div>

          <div className="mt-12 border-t border-line pt-8">
            <p className="text-label text-gold">Or browse by category</p>
            <ul className="mt-4 flex flex-wrap justify-center gap-2">
              {categories.map((c) => (
                <li key={c.id}>
                  <Link href={`/?category=${c.id}#shop`} className="inline-grid min-h-11 place-items-center rounded-pill border border-green-accent bg-surface-card px-5 text-nav-link text-brand-text hover:bg-surface-cream">
                    {c.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
