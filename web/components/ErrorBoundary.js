// The safety net around every page. If something in a page crashes while it is drawn, React would otherwise leave
// a blank screen. This catches the crash and shows a calm, branded message instead: "Something went wrong, but
// your cart is safe." The header and footer stay in place, because the net wraps only the page itself.
//
//   resetKey  when this changes (the visitor goes to another page) the net lets go and tries drawing again
//
// Why the cart really is safe: it is kept by the cart provider (saved in this browser and in Firestore), which
// sits OUTSIDE this boundary, so a crash in a page cannot touch it.
//
// It must be a class: React only supports catching render errors in class components. The fallback uses no
// hooks and no providers, so it still works even if the thing that crashed was one of those.

import { Component } from 'react';

export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    // Leave a trace for developers (and for any error reporting added later). Visitors never see it.
    console.error('FreshBliss page crashed:', error, info?.componentStack);
  }

  componentDidUpdate(previous) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <div role="alert" className="fb-container py-14.5">
        <div className="mx-auto max-w-xl overflow-hidden rounded-2xl border border-gold-bright/50 bg-surface-card text-center shadow-xl">
          <div aria-hidden="true" className="h-1.5 bg-gradient-to-r from-hero-deep via-gold-bright to-hero-deep" />
          <div className="p-8 md:p-10">
            <p className="text-label text-gold">Oops</p>
            <h1 className="mt-2 text-heading-2 text-brand-text">Something went wrong, but your cart is safe.</h1>
            <p className="mt-3 text-body text-ink-muted">Nothing you added has been lost. Please try again, or head back to the shop.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => this.setState({ failed: false })}
                className="min-h-11 rounded-pill bg-brand px-6 text-nav-link text-on-brand hover:brightness-110"
              >
                Try again
              </button>
              {/* A plain link (not next/link) on purpose: a full page load is the most reliable way out of a crash. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/" className="inline-grid min-h-11 place-items-center rounded-pill bg-gold-bright px-6 text-nav-link text-on-gold hover:brightness-95">
                Back to the shop
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
