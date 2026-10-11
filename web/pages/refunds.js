// The cancellation and refund page: /refunds. The wording comes from the `policies` collection in Firestore when it holds an approved
// version (not placeholder), otherwise from the built-in copy in content/policies.js (lib/policies.js chooseBuiltIn).

import PolicyPage from '@/components/PolicyPage';
import { chooseBuiltIn } from '@/lib/policies';
import { fetchPolicy } from '@/lib/serverPolicies';

export async function getStaticProps() {
  const found = await fetchPolicy('refunds');
  return { props: { policy: chooseBuiltIn('refunds', found.status === 'found' ? found.policy : null) }, revalidate: 300 };
}

export default function RefundsPage({ policy }) {
  return <PolicyPage slug="refunds" {...policy} />;
}
