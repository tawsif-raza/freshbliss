// The terms page: /terms. Wording in content/policies.js.

import PolicyPage from '@/components/PolicyPage';
import { TERMS_SECTIONS } from '@/content/policies';

export default function TermsPage() {
  return (
    <PolicyPage
      slug="terms"
      kicker="The small print"
      title="Terms of Service"
      description="The terms for ordering fresh fruit boxes from FreshBliss."
      lead="The terms for ordering from us, in plain words."
      sections={TERMS_SECTIONS}
    />
  );
}
