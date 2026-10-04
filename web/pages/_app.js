import '@/styles/globals.css';
import { Playfair_Display, Plus_Jakarta_Sans } from 'next/font/google';
import { useRouter } from 'next/router';
import SignInGate from '@/components/auth/SignInGate';
import CartDrawer from '@/components/CartDrawer';
import CommandPalette from '@/components/CommandPalette';
import ErrorBoundary from '@/components/ErrorBoundary';
import Footer from '@/components/Footer';
import RouteProgress from '@/components/RouteProgress';
import SiteHeader from '@/components/SiteHeader';
import { ToastProvider } from '@/components/ToastProvider';
import { AuthProvider } from '@/context/AuthContext';
import { CartDrawerProvider } from '@/context/CartDrawerContext';
import { CommandPaletteProvider } from '@/context/CommandPaletteContext';
import { CartProvider } from '@/context/CartContext';
import { WishlistProvider } from '@/context/WishlistContext';

// The two brand typefaces. next/font downloads them at build time and serves them from this site, so there is no
// request to Google when a visitor loads a page (faster, no flash of unstyled text, and no change needed to the
// Content Security Policy). Playfair Display is for headings, Plus Jakarta Sans for everything else; styles/globals.css
// makes them the font-serif and font-sans families.
const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-playfair', display: 'swap' });
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta', display: 'swap' });

// next/font puts its font-family on the wrapper below, but the theme's font-serif and font-sans are declared on
// :root (styles/globals.css), where that variable would not exist. So the two names are also declared on :root,
// here, and every use of them (the heading rule, the display text styles) resolves.
const fontRoot = `:root { --font-playfair: ${playfair.style.fontFamily}; --font-jakarta: ${jakarta.style.fontFamily}; }`;

// Order matters: the cart shows toasts and opens the slide-out cart, so both of those wrap it. Who is signed in
// (AuthProvider) is needed by the header, the checkout gate and the pages, and raises no toasts itself. The error boundary
// sits INSIDE all the providers and wraps only the page, so a crash in a page leaves the header, footer and cart
// working, and the cart is untouched. A page can set `Page.bare = true` (the sign-in screen) to be drawn without the
// site header and footer.
export default function App({ Component, pageProps }) {
  const router = useRouter();

  return (
    <div className={`${playfair.variable} ${jakarta.variable} flex min-h-screen flex-col bg-surface-page font-sans text-ink`}>
      <style jsx global>{fontRoot}</style>
      <ToastProvider>
        <AuthProvider>
          <CartDrawerProvider>
            <CommandPaletteProvider>
              <CartProvider>
                <WishlistProvider>
                  {/* Skip link: first thing a keyboard user tabs to. */}
                  <a
                    href="#fbs-main"
                    className="fb-no-print sr-only rounded-pill bg-brand px-4 py-2 text-nav-link text-on-brand focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
                  >
                    Skip to content
                  </a>
                  <RouteProgress />
                  {!Component.bare && <SiteHeader />}
                  <main id="fbs-main" className="flex-1">
                    <ErrorBoundary resetKey={router.asPath}>
                      <SignInGate>
                        <Component {...pageProps} />
                      </SignInGate>
                    </ErrorBoundary>
                  </main>
                  {!Component.bare && <Footer />}
                  <CartDrawer />
                  <CommandPalette />
                </WishlistProvider>
              </CartProvider>
            </CommandPaletteProvider>
          </CartDrawerProvider>
        </AuthProvider>
      </ToastProvider>
    </div>
  );
}
