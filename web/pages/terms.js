// The terms page: /terms. The wording comes from the `policies` collection in Firestore when it holds an approved
// version (not placeholder), otherwise from the built-in copy in content/policies.js (lib/policies.js chooseBuiltIn).

import PolicyPage from '@/components/PolicyPage';
import { chooseBuiltIn } from '@/lib/policies';
import { fetchPolicy } from '@/lib/serverPolicies';

export async function getStaticProps() {
  const found = await fetchPolicy('terms');
  return { props: { policy: chooseBuiltIn('terms', found.status === 'found' ? found.policy : null) }, revalidate: 300 };
}

export default function TermsPage({ policy }) {
  return <PolicyPage slug="terms" {...policy} />;
}
