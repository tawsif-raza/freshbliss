// Every website policy in one list: /policies. The list is the `policies` collection in Firestore, with the built-in
// Terms, Refunds and Privacy always present (lib/policies.js listPolicies), so it is never empty.

import Head from 'next/head';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { BUSINESS } from '@/content/business';
import { listPolicies, policyHref } from '@/lib/policies';
import { fetchPolicies } from '@/lib/serverPolicies';

export async function getStaticProps() {
  const fromDb = await fetchPolicies();
  const policies = listPolicies(fromDb).map(({ id, title, description, updated, placeholder }) => ({ id, title, description, updated, placeholder }));
  return { props: { policies }, revalidate: 300 };
}

export default function PoliciesPage({ policies }) {
  return (
    <>
      <Head>
        <title>{`Policies | ${BUSINESS.name}`}</title>
        <meta name="description" content={`Every ${BUSINESS.name} policy in one place: terms, refunds, privacy, delivery and more.`} />
      </Head>
      <div className="fb-container py-14.5">
        <div className="max-w-3xl">
          <p className="text-label text-gold">The small print</p>
          <h1 className="mt-2 text-heading-2 text-brand-text">Policies</h1>
          <p className="mt-2 text-lead text-ink-muted">Every policy for ordering from us, in one place.</p>

          <ul className="mt-8.5 divide-y divide-line rounded-xl border border-line bg-surface-card shadow-card">
            {policies.map((p) => (
              <li key={p.id}>
                <Link href={policyHref(p.id)} className="flex items-center gap-4 p-5 hover:bg-surface-cream">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-heading-3 text-brand-text">{p.title}</span>
                      {p.placeholder && <span className="rounded-pill bg-surface-callout px-2.5 py-0.5 text-small text-ink ring-1 ring-gold/40">Placeholder</span>}
                    </span>
                    {p.description && <span className="mt-1 block text-body text-ink-muted">{p.description}</span>}
                    {p.updated && <span className="mt-1 block text-small text-ink-muted">Last updated {p.updated}</span>}
                  </span>
                  <ChevronRight size={20} aria-hidden="true" className="shrink-0 text-ink-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
