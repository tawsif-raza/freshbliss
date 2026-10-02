import '@/styles/globals.css';
import { Inter } from 'next/font/google';
import CartDrawer from '@/components/CartDrawer';
import Footer from '@/components/Footer';
import SiteHeader from '@/components/SiteHeader';
import { ToastProvider } from '@/components/ToastProvider';
import { CartDrawerProvider } from '@/context/CartDrawerContext';
import { CartProvider } from '@/context/CartContext';
import { WishlistProvider } from '@/context/WishlistContext';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

// Order matters: the cart shows toasts and opens the slide-out cart, so both of those wrap it.
export default function App({ Component, pageProps }) {
  return (
    <div className={`${inter.variable} flex min-h-screen flex-col bg-surface-page font-sans text-ink`}>
      <ToastProvider>
        <CartDrawerProvider>
          <CartProvider>
            <WishlistProvider>
              {/* Skip link: first thing a keyboard user tabs to. */}
              <a
                href="#fbs-main"
                className="fb-no-print sr-only rounded-pill bg-brand px-4 py-2 text-nav-link text-on-brand focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
              >
                Skip to content
              </a>
              <SiteHeader />
              <main id="fbs-main" className="flex-1">
                <Component {...pageProps} />
              </main>
              <Footer />
              <CartDrawer />
            </WishlistProvider>
          </CartProvider>
        </CartDrawerProvider>
      </ToastProvider>
    </div>
  );
}
