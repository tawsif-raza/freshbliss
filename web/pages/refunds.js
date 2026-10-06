// The cancellation and refund page: /refunds. Wording in content/policies.js.

import PolicyPage from '@/components/PolicyPage';
import { REFUND_SECTIONS } from '@/content/policies';

export default function RefundsPage() {
  return (
    <PolicyPage
      slug="refunds"
      kicker="If plans change"
      title="Cancellation & Refunds"
      description="How to cancel a FreshBliss order and how refunds work."
      lead="How to cancel an order, and how your money comes back."
      sections={REFUND_SECTIONS}
    />
  );
}
