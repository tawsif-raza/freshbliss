// The shop: every active fruit box from Firestore, in a responsive grid, with the same category tabs as the home page
// (the phone tab bar's "Categories" button lands here).

import { useMemo, useState } from 'react';
import CategoryTabs from '@/components/CategoryTabs';
import ProductGrid from '@/components/ProductGrid';
import Seo from '@/components/Seo';
import ShopToolbar from '@/components/ShopToolbar';
import { CATEGORIES } from '@/content/storefront';
import { useCart } from '@/context/CartContext';
import { useWishlist } from '@/context/WishlistContext';
import { useCatalog } from '@/lib/catalog';
import { countByTab, productsInTab } from '@/lib/categories';
import { fetchActiveProducts } from '@/lib/serverCatalog';
import { filterInStock, sortProducts } from '@/lib/sort';

// Built on the server and refreshed at most once a minute, like the home page (pages/index.js).
export async function getStaticProps() {
  const initialProducts = await fetchActiveProducts();
  return { props: { initialProducts }, revalidate: initialProducts ? 60 : 10 };
}

export default function ProductsPage({ initialProducts }) {
  const { products, status, reload } = useCatalog(initialProducts);
  const { addToCart } = useCart();
  const wishlist = useWishlist();

  // Boxes you can buy first; sold-out ones last (lib/sort.js keeps that true for every sort order).
  const ordered = useMemo(() => sortProducts(products, 'featured'), [products]);

  const [categoryId, setCategoryId] = useState('all');
  const [sort, setSort] = useState('featured');
  const [inStockOnly, setInStockOnly] = useState(false);
  const category = CATEGORIES.find((c) => c.id === categoryId) ?? CATEGORIES[0];
  // The tab's boxes, narrowed and ordered as the visitor asked. The tab counts stay the full counts, so a tab is never a surprise.
  const shown = useMemo(() => sortProducts(filterInStock(productsInTab(ordered, category), inStockOnly), sort), [ordered, category, inStockOnly, sort]);
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
          {/* The box names below are h3s; this keeps the outline h1 > h2 > h3 for screen-reader users. */}
          <h2 className="sr-only">{category.label}</h2>
          {status === 'ready' && productsInTab(ordered, category).length > 0 && (
            <ShopToolbar count={shown.length} sort={sort} onSort={setSort} inStockOnly={inStockOnly} onInStockOnly={setInStockOnly} />
          )}
          <ProductGrid
            products={shown}
            status={status}
            onRetry={reload}
            wishlist={wishlist}
            onAdd={addToCart}
            empty={
              inStockOnly && productsInTab(ordered, category).length > 0
                ? { title: 'Everything here is sold out right now.', text: 'Turn off "In stock only" to see the sold-out boxes.' }
                : categoryId === 'all'
                  ? { title: 'No fruit boxes are available right now.', text: 'Please check back soon.' }
                  : { title: `No ${category.label.toLowerCase()} right now.`, text: 'Try another category.' }
            }
          />
        </div>
      </div>
    </>
  );
}
