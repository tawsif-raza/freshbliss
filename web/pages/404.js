// Shown for any address that does not exist, including a fruit box that is not sold (any more). Search engines get a
// real 404 status with it (pages/products/[slug].js returns `notFound`), so dead links drop out of their results.

import Head from 'next/head';
import Link from 'next/link';
import Callout from '@/components/Callout';

export default function NotFoundPage() {
  return (
    <>
      <Head>
        <title>Page not found | FreshBliss</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="fb-container py-14.5">
        <Callout title="We could not find that page.">The link may be wrong, or this fruit box may have sold out for good.</Callout>
        <Link href="/products" className="mt-6 inline-grid min-h-11 place-items-center rounded-pill bg-gold-bright px-6 text-nav-link text-on-gold hover:brightness-95">
          See all fruit boxes
        </Link>
      </div>
    </>
  );
}
