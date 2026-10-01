import '@/styles/globals.css';
import { Inter } from 'next/font/google';
import { CartProvider } from '@/context/CartContext';
import { WishlistProvider } from '@/context/WishlistContext';
import SiteHeader from '@/components/SiteHeader';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export default function App({ Component, pageProps }) {
  return (
    <div className={`${inter.variable} min-h-screen bg-surface-page font-sans text-ink`}>
      <CartProvider>
        <WishlistProvider>
          {/* Skip link: first thing a keyboard user tabs to. */}
          <a
            href="#fbs-main"
            className="sr-only rounded-pill bg-brand px-4 py-2 text-nav-link text-on-brand focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
          >
            Skip to content
          </a>
          <SiteHeader />
          <main id="fbs-main">
            <Component {...pageProps} />
          </main>
        </WishlistProvider>
      </CartProvider>
    </div>
  );
}
