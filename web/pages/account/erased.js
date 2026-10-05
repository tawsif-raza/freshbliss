// "Your data has been erased": /account/erased
// Where the customer lands after "Delete my data" (components/auth/DeleteAccountCard.js). It is a plain page that needs no
// account: the account no longer exists. The count of orders comes from the address (?orders=3) and is only used to word one
// sentence, so it is accepted only as a small whole number.

import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { BUSINESS } from '@/content/business';
import { erasureSummary } from '@/lib/erasureHelpers';

export default function ErasedPage() {
  const { query, isReady } = useRouter();
  const raw = Number(Array.isArray(query.orders) ? query.orders[0] : query.orders);
  const orders = isReady && Number.isInteger(raw) && raw >= 0 && raw <= 1000 ? raw : 0;

  return (
    <>
      <Head>
        <title>Your data has been erased | FreshBliss</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="fb-container py-14.5">
        <article className="max-w-2xl">
          <p className="text-label text-gold">Done</p>
          <h1 className="mt-2 text-heading-2 text-brand-text">Your data has been erased</h1>
          <p className="mt-3 text-lead text-ink">{erasureSummary({ orders })}</p>
          <p className="mt-3 text-body text-ink-muted">
            The shop keeps its payment and refund records for its accounts, with your address and notes removed and nothing linking them to
            you. Razorpay keeps its own payment records under its own terms. You are welcome to shop again as a new customer at any time.
          </p>
          {BUSINESS.contact && <p className="mt-3 text-body text-ink-muted">Questions about your data? Contact us on {BUSINESS.contact}.</p>}
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/" className="inline-grid min-h-11 place-items-center rounded-pill bg-brand px-6 text-nav-link text-on-brand hover:brightness-110">
              Back to the shop
            </Link>
            <Link href="/privacy" className="inline-grid min-h-11 place-items-center rounded-pill border border-green-accent px-6 text-nav-link text-brand-text hover:bg-surface-cream">
              Read the privacy page
            </Link>
          </div>
        </article>
      </div>
    </>
  );
}
