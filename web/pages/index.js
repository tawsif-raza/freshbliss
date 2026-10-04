// The home page: banner, quick category tabs, a showcase of boxes, why FreshBliss, reviews and questions.
// Products and their stock come live from the shared catalogue; the zones (for the delivery answer
// in the questions) come live from Firestore too. The words are in content/storefront.js.

import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useMemo, useState } from 'react';
import CategoryTabs from '@/components/CategoryTabs';
import Hero from '@/components/Hero';
import CustomerReviews from '@/components/CustomerReviews';
import FeaturedPromo from '@/components/FeaturedPromo';
import { Faq } from '@/components/HomeSections';
import Marquee from '@/components/Marquee';
import OurRoots from '@/components/OurRoots';
import ProductGrid from '@/components/ProductGrid';
import TrustStory from '@/components/TrustStory';
import { CATEGORIES, FEATURED_LIMIT } from '@/content/storefront';
import { useCart } from '@/context/CartContext';
import { useWishlist } from '@/context/WishlistContext';
import { useProducts } from '@/lib/catalog';
import { countByTab, productsInTab } from '@/lib/categories';
import { useZones } from '@/lib/zones';

const PANEL_ID = 'shop-panel';

export default function HomePage() {
  const { products, status, reload } = useProducts();
  const { addToCart } = useCart();
  const wishlist = useWishlist();
  const { zones } = useZones();
  // Which tab is showing: what the visitor picked, else the one in the address (the footer links use
  // /?category=fitness#shop), else All.
  const router = useRouter();
  const fromAddress = router.isReady && typeof router.query.category === 'string' && CATEGORIES.some((c) => c.id === router.query.category) ? router.query.category : null;
  // A tab the visitor clicked counts only for the address it was clicked under, so following a footer
  // link (a new address) always wins over an earlier click.
  const [pick, setPick] = useState({ id: null, forAddress: null });
  const picked = pick.forAddress === fromAddress ? pick.id : null;
  const categoryId = picked ?? fromAddress ?? 'all';
  const setCategoryId = (id) => setPick({ id, forAddress: fromAddress });

  // Buyable boxes first, sold-out last (stable, so each group keeps its order).
  const ordered = useMemo(() => [...products].sort((a, b) => Number(a.stock <= 0) - Number(b.stock <= 0)), [products]);

  const category = CATEGORIES.find((c) => c.id === categoryId) ?? CATEGORIES[0];
  const inCategory = useMemo(() => productsInTab(ordered, category), [ordered, category]);
  const shown = inCategory.slice(0, FEATURED_LIMIT);

  // How many boxes each tab holds, so a tab is never a surprise.
  const counts = useMemo(() => countByTab(ordered, CATEGORIES), [ordered]);

  return (
    <>
      <Head>
        <title>FreshBliss | Fresh fruit boxes delivered in Bengaluru</title>
        <meta name="description" content="Freshly sliced. Perfectly packed. Always. Fruit boxes delivered across Bengaluru within the hour." />
      </Head>

      <Hero onPickCategory={setCategoryId} />
      <Marquee />

      <section id="shop" aria-labelledby="shop-title" className="fb-container scroll-mt-24 py-14.5">
        <p className="text-label text-gold">Fresh today</p>
        <h2 id="shop-title" className="mt-2 text-heading-2 text-brand-text">
          Pick your box
        </h2>

        <div className="mt-6">
          <CategoryTabs tabs={CATEGORIES} value={categoryId} onChange={setCategoryId} counts={status === 'ready' ? counts : {}} panelId={PANEL_ID} label="Box categories" />
        </div>

        <div id={PANEL_ID} role="tabpanel" aria-labelledby={`tab-${categoryId}`} className="mt-8.5">
          <ProductGrid
            products={shown}
            status={status}
            onRetry={reload}
            wishlist={wishlist}
            onAdd={addToCart}
            empty={
              categoryId === 'all'
                ? { title: 'No fruit boxes are available right now.', text: 'Please check back soon.' }
                : { title: `No ${category.label.toLowerCase()} right now.`, text: 'Try another category, or see everything.' }
            }
          />
          {status === 'ready' && (
            <div className="mt-6">
              <Link
                href="/products"
                className="inline-grid min-h-11 place-items-center rounded-pill border border-brand px-6 text-nav-link text-brand-text hover:bg-surface-cream"
              >
                {inCategory.length > shown.length ? `See all ${inCategory.length} boxes` : 'See the full shop'}
              </Link>
            </div>
          )}
        </div>
      </section>

      <FeaturedPromo />
      <TrustStory />
      <CustomerReviews />
      <Faq zones={zones} />
      <OurRoots />
    </>
  );
}
