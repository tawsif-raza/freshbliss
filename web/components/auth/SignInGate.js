// Asks a visitor to sign in before a gated page (checkout; see GATED_PATHS in lib/authHelpers.js). Wrap the page with it.
//
//   - signed in (Google, Microsoft or phone): the page is shown;
//   - a guest or nobody: sent to /login?next=<this page>, where "Continue as guest" is offered, so signing in is encouraged
//     but never forced. Once they have chosen guest for this tab, the page is shown.
//
// While Firebase works out who the visitor is (a moment on every full page load), and while the redirect happens, a quiet
// line is shown instead of the page, so a checkout form never flashes up and vanishes. Pages that are not gated pass
// straight through.

import { useRouter } from 'next/router';
import { useEffect } from 'react';
import { useAuthUser } from '@/context/AuthContext';
import { guestCheckoutAllowed, loginHref, needsSignIn } from '@/lib/authHelpers';

export default function SignInGate({ children }) {
  const router = useRouter();
  const { status } = useAuthUser();
  const gated = needsSignIn(router.pathname);

  // Only meaningful once the status is known. (Not read while loading, so the server-rendered page and the first browser
  // render are the same.)
  const allowed = !gated || status === 'user' || (status !== 'loading' && guestCheckoutAllowed());
  const redirecting = gated && status !== 'loading' && !allowed;

  useEffect(() => {
    if (redirecting) router.replace(loginHref(router.asPath));
  }, [redirecting, router]);

  if (allowed) return children;
  return (
    <div className="fb-container py-14.5">
      <p role="status" className="text-small text-ink-muted">
        {redirecting ? 'Taking you to sign in…' : 'One moment…'}
      </p>
    </div>
  );
}
