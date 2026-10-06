// Sign in: /login
// A split screen. On a desktop the left half is a full-height photo with the brand's promise over it; on a phone the
// photo is not drawn at all and the form has the whole screen. The right half holds the form (components/auth/LoginForm.js).
//
// After a successful sign-in, by ANY method, the customer goes to /account, or to wherever they came from when the link
// carried ?next= (the cart sends people on to /checkout this way). `next` is checked to be a path on this site
// (lib/authHelpers.js) so the link cannot be used to send someone to another website.
//
// Someone who is already signed in (not just a guest) does not need this page and is sent straight on.

import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useRef, useState } from 'react';
import LoginForm from '@/components/auth/LoginForm';
import OptimizedImage from '@/components/OptimizedImage';
import { useToast } from '@/components/ToastProvider';
import { auth } from '@/lib/firebaseClient';
import { allowGuestCheckout, isGatedTarget, safeNextPath } from '@/lib/authHelpers';

const HERO_PHOTO = 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=80';

export default function LoginPage() {
  const router = useRouter();
  const toast = useToast();
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);
  const [ready, setReady] = useState(false); // the saved session has been looked at
  const leaving = useRef(false);

  // Sent here because checkout asks for sign-in: a guest checkout is still allowed, so offer it.
  const guestOption = router.isReady && isGatedTarget(router.query.next);

  // `result` is { user, claimed } from a sign-in just now. Said once, on the way out, so the customer knows their
  // earlier orders came with them. (Absent when the page finds an existing session.)
  const goOn = useCallback(
    (result) => {
      if (leaving.current) return;
      leaving.current = true;
      if (result?.claimed > 0) {
        toastRef.current.success(`We added your ${result.claimed === 1 ? 'earlier order' : `${result.claimed} earlier orders`} to your account.`);
      }
      router.replace(safeNextPath(router.query.next));
    },
    [router],
  );

  function continueAsGuest() {
    if (leaving.current) return;
    leaving.current = true;
    allowGuestCheckout();
    router.replace(safeNextPath(router.query.next));
  }

  // Look at any saved session once, before the buttons are usable (a pop-up must open straight from a tap, so the
  // sign-in code cannot wait for this itself). A customer who is already signed in skips the page. A guest
  // (anonymous) account is not a customer: they stay, and signing in links the two together (lib/auth.js).
  useEffect(() => {
    if (!router.isReady) return undefined;
    let cancelled = false;
    auth.authStateReady().then(() => {
      if (cancelled) return;
      if (auth.currentUser && !auth.currentUser.isAnonymous) goOn();
      else setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [router.isReady, goOn]);

  return (
    <>
      <Head>
        <title>Sign in | FreshBliss</title>
        <meta name="robots" content="noindex" />
        <meta name="description" content="Sign in to FreshBliss with Google, Microsoft or your mobile number." />
      </Head>

      <div className="grid min-h-screen lg:grid-cols-2">
        {/* Left: the photo. Hidden below lg. It is loaded lazily (no `priority`, which would preload it), and a browser
            does not fetch a lazy image inside a hidden box, so phones and tablets never download it. */}
        <aside className="relative hidden overflow-hidden bg-hero-deep lg:block" aria-label="About FreshBliss">
          <OptimizedImage src={HERO_PHOTO} alt="" fill sizes="50vw" className="object-cover" />
          <div className="absolute inset-0 bg-linear-to-t from-brand/80 to-transparent" />
          {/* a soft shade at the top as well, so the wordmark reads over a bright part of the photo */}
          <div className="absolute inset-x-0 top-0 h-40 bg-linear-to-b from-brand/60 to-transparent" />
          <div className="relative flex h-full flex-col justify-between p-12 xl:p-16">
            <Link href="/" className="w-fit font-serif text-[28px] leading-none font-bold text-on-hero drop-shadow">
              FreshBliss
            </Link>
            <figure className="max-w-md">
              <p className="text-label text-gold-bright">Our promise</p>
              <blockquote className="mt-3 font-serif text-[34px] leading-[1.2] font-bold text-on-hero drop-shadow xl:text-[40px]">
                Picked at its peak, packed with care, and at your door while it is still bursting with life.
              </blockquote>
              <figcaption className="mt-4 text-body text-on-hero/90">Fresh, honest fruit from the farm to your table.</figcaption>
            </figure>
          </div>
        </aside>

        {/* Right: the form, on cream. */}
        <section className="flex flex-col bg-surface-page px-5 py-8 sm:px-10">
          <Link href="/" className="w-fit font-serif text-[26px] leading-none font-bold text-brand-text lg:hidden">
            FreshBliss
          </Link>
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
            <p className="text-label text-gold">Sign in or create an account</p>
            <h1 className="mt-2 text-heading-2 text-brand-text">Welcome to FreshBliss</h1>
            <p className="mt-2 mb-8 text-body text-ink-muted">Track your orders, reorder your favourites and check out faster.</p>

            {ready ? (
              <LoginForm onSuccess={goOn} />
            ) : (
              <p role="status" className="text-small text-ink-muted">
                Loading…
              </p>
            )}

            {ready && guestOption && (
              <div className="mt-6 rounded-lg border border-line bg-surface-card p-4">
                <p className="text-small text-ink-muted">Just want to order? You can check out without an account. Your orders are then kept in this browser only.</p>
                <button
                  type="button"
                  onClick={continueAsGuest}
                  className="mt-2 inline-flex min-h-11 items-center rounded-pill border border-green-accent px-5 text-nav-link text-brand-text hover:bg-surface-cream"
                >
                  Continue as guest
                </button>
              </div>
            )}

            <p className="mt-8 text-small text-ink-muted">
              By continuing, you also agree to our{' '}
              <Link href="/terms" className="font-bold text-brand-text underline">
                Terms of Service
              </Link>
              . Your consent to how we use your personal data is the box above; you can read the{' '}
              <Link href="/privacy" className="font-bold text-brand-text underline">
                Privacy Policy
              </Link>{' '}
              first and take it back whenever you like.
            </p>
            {!guestOption && (
              <p className="mt-2 text-small text-ink-muted">
                <Link href="/products" className="font-bold text-brand-text underline">
                  Keep browsing
                </Link>{' '}
                without signing in.
              </p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

// Tells pages/_app.js to leave out the site header and footer: this screen is a full-page layout of its own.
LoginPage.bare = true;
