// The "who you are" card at the top of the account page (/account).
//
//   signed in   name, email and/or mobile number (whatever Google, Microsoft or the phone sign-in gave us), how they signed
//               in, and a Sign out button;
//   guest       a plain note that the orders below live in this browser only, with a button to sign in and keep them.
//
// Nothing is shown about someone until Firebase has said who they are, so a signed-in customer never sees the guest note
// flash up first.

import Link from 'next/link';
import { LogOut } from 'lucide-react';
import OptimizedImage from '@/components/OptimizedImage';
import { useAuthUser, useSignOut } from '@/context/AuthContext';
import { describeAccount } from '@/lib/authHelpers';

export default function AccountCard() {
  const { status, user } = useAuthUser();
  const { signOut, busy } = useSignOut();

  if (status === 'loading') {
    return <div aria-hidden="true" className="mt-6 h-24 max-w-2xl rounded-xl border border-line bg-surface-sunken motion-safe:animate-pulse" />;
  }

  if (status !== 'user') {
    return (
      <section aria-labelledby="guest-note" className="mt-6 max-w-2xl rounded-xl border border-line border-l-[5px] border-l-gold bg-surface-callout p-5">
        <h2 id="guest-note" className="text-heading-3 text-ink">
          You are shopping as a guest
        </h2>
        <p className="mt-1 text-body text-ink-muted">
          The orders below were placed from this browser. Sign in to keep them on every device, even if you clear your browser data.
        </p>
        <Link
          href="/login"
          className="mt-3 inline-grid min-h-11 place-items-center rounded-pill bg-brand px-6 text-nav-link text-on-brand hover:brightness-110"
        >
          Sign in
        </Link>
      </section>
    );
  }

  const me = describeAccount(user);
  return (
    <section aria-label="Your details" className="mt-6 flex max-w-2xl flex-wrap items-center gap-4 rounded-xl border border-line bg-surface-card p-5 shadow-card">
      {me.photoURL ? (
        <OptimizedImage src={me.photoURL} alt="" width={56} height={56} referrerPolicy="no-referrer" className="size-14 shrink-0 rounded-full object-cover" />
      ) : (
        <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-full bg-brand font-serif text-[24px] font-bold text-on-brand">
          {me.initial}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-heading-3 text-ink">{me.title}</p>
        <dl className="mt-1 text-small text-ink-muted">
          {me.email && me.email !== me.title && (
            <div className="flex gap-2">
              <dt className="sr-only">Email</dt>
              <dd className="truncate">{me.email}</dd>
            </div>
          )}
          {me.phone && me.phone !== me.title && (
            <div className="flex gap-2">
              <dt className="sr-only">Mobile number</dt>
              <dd>{me.phone}</dd>
            </div>
          )}
          {me.provider && (
            <div className="flex gap-2">
              <dt>Signed in with</dt>
              <dd className="font-bold text-ink">{me.provider}</dd>
            </div>
          )}
        </dl>
      </div>
      <button
        type="button"
        onClick={signOut}
        disabled={busy}
        className="inline-flex min-h-11 items-center gap-2 rounded-pill border border-green-accent px-5 text-nav-link text-brand-text hover:bg-surface-cream disabled:opacity-60"
      >
        <LogOut size={18} aria-hidden="true" />
        Sign out
      </button>
    </section>
  );
}
