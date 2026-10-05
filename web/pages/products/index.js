// The shop: every active fruit box from Firestore, in a responsive grid, with the same category tabs as the home page
// (the phone tab bar's "Categories" button lands here).

import { useMemo, useState } from 'react';
import CategoryTabs from '@/components/CategoryTabs';
import ProductGrid from '@/components/ProductGrid';
import Seo from '@/components/Seo';
import { CATEGORIES } from '@/content/storefront';
import { useCart } from '@/context/CartContext';
import { useWishlist } from '@/context/WishlistContext';
import { useCatalog } from '@/lib/catalog';
import { countByTab, productsInTab } from '@/lib/categories';
import { fetchActiveProducts } from '@/lib/serverCatalog';

// Built on the server and refreshed at most once a minute, like the home page (pages/index.js).
export async function getStaticProps() {
  const initialProducts = await fetchActiveProducts();
  return { props: { initialProducts }, revalidate: initialProducts ? 60 : 10 };
}

export default function ProductsPage({ initialProducts }) {
  const { products, status, reload } = useCatalog(initialProducts);
  const { addToCart } = useCart();
  const wishlist = useWishlist();

  // Boxes you can buy first; sold-out ones last. Array.sort is stable, so each
  // group keeps Firestore's order.
  const ordered = useMemo(() => [...products].sort((a, b) => Number(a.stock <= 0) - Number(b.stock <= 0)), [products]);

  const [categoryId, setCategoryId] = useState('all');
  const category = CATEGORIES.find((c) => c.id === categoryId) ?? CATEGORIES[0];
  const shown = useMemo(() => productsInTab(ordered, category), [ordered, category]);
  const counts = useMemo(() => countByTab(ordered, CATEGORIES), [ordered]);

  return (
    <>
      <Seo
        title="Our Fruit Boxes | FreshBliss"
        description="Freshly sliced. Perfectly packed. Always. Premium fruit boxes delivered in Bengaluru."
        path="/products"
        image={ordered[0]?.images[0]}
      />

      <div className="fb-container py-14.5">
        <p className="text-label text-gold">Freshness delivered</p>
        <h1 className="mt-2 text-heading-2 text-brand-text">Our Fruit Boxes</h1>
        <p className="mt-2 max-w-xl text-lead text-ink-muted">Freshly sliced. Perfectly packed. Always.</p>

        <div className="mt-6">
          <CategoryTabs tabs={CATEGORIES} value={categoryId} onChange={setCategoryId} counts={status === 'ready' ? counts : {}} panelId="shop-panel" label="Box categories" />
        </div>

        <div id="shop-panel" role="tabpanel" aria-labelledby={`tab-${categoryId}`} className="mt-8.5">
          {status === 'ready' && shown.length > 0 && (
            <p className="mb-4.5 text-small text-ink-muted">
              {shown.length} {shown.length === 1 ? 'box' : 'boxes'}
            </p>
          )}
          <ProductGrid
            products={shown}
            status={status}
            onRetry={reload}
            wishlist={wishlist}
            onAdd={addToCart}
            empty={
              categoryId === 'all'
                ? { title: 'No fruit boxes are available right now.', text: 'Please check back soon.' }
                : { title: `No ${category.label.toLowerCase()} right now.`, text: 'Try another category.' }
            }
          />
        </div>
      </div>
    </>
  );
}
