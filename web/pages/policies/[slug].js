// One website policy: /policies/<id> (Shipping & Delivery, Cookies, Grievance Redressal...), read from the `policies`
// collection in Firestore. Terms, Refunds and Privacy keep their own addresses (/terms, /refunds, /privacy), so their
// /policies/<id> address redirects there. A policy marked placeholder shows a warning and is hidden from search engines
// (components/PolicyPage.js).

import PolicyPage from '@/components/PolicyPage';
import { POLICY_PATHS } from '@/lib/policies';
import { fetchPolicies, fetchPolicy } from '@/lib/serverPolicies';

export async function getStaticPaths() {
  const policies = await fetchPolicies();
  return { paths: (policies ?? []).filter((p) => !POLICY_PATHS[p.id]).map((p) => ({ params: { slug: p.id } })), fallback: 'blocking' };
}

export async function getStaticProps({ params }) {
  if (POLICY_PATHS[params.slug]) return { redirect: { destination: POLICY_PATHS[params.slug], permanent: true } };
  const found = await fetchPolicy(params.slug);
  if (found.status !== 'found') return { notFound: true, revalidate: found.status === 'error' ? 10 : 60 };
  return { props: { policy: found.policy }, revalidate: 300 };
}

export default function PolicyByIdPage({ policy }) {
  return <PolicyPage slug={policy.id} {...policy} />;
}
