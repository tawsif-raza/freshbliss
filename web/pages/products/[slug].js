// One fruit box: /products/<id>
// A photo gallery, a size choice with the price following it, a quantity that stops at what we can
// actually sell, a delivery estimate for the visitor's pincode, and expandable details (ingredients,
// packaging), plus a "Harvest & Health" row (origin, calories, key benefits). Everything about the box is live: if the last one sells, the page says so.
//
// Origin, calories, benefits, packaging and storage text appear only if the shop owner has added them to the product
// in Firestore (see lib/catalog.js). A missing fact is left out, never made up.
//
// Below that: "Chef's Notes & Pairings" (a serving idea, lib/pairings.js), and search-engine structured data
// (JSON-LD, lib/seo.js) in the page head, built from the same live product.

import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import Accordion from '@/components/Accordion';
import Callout from '@/components/Callout';
import ChefsNotes from '@/components/ChefsNotes';
import HarvestHealth from '@/components/HarvestHealth';
import ProductGallery from '@/components/ProductGallery';
import RelatedProducts from '@/components/RelatedProducts';
import { ProductDetailSkeleton } from '@/components/ProductSkeleton';
import QuantityStepper from '@/components/QuantityStepper';
import SizeSelector from '@/components/SizeSelector';
import StockBadge from '@/components/StockBadge';
import StorageBadge from '@/components/StorageBadge';
import ZoneStatus from '@/components/ZoneStatus';
import { MAX_QTY_PER_LINE, useCart } from '@/context/CartContext';
import { useWishlist } from '@/context/WishlistContext';
import { useProducts } from '@/lib/catalog';
import { unitPrice } from '@/lib/pricing';
import { buildProductJsonLd, jsonLdString } from '@/lib/seo';
import { PINCODE, useSavedPincode, useZones } from '@/lib/zones';

const DEFAULT_PACKAGING = 'Freshly cut and packed hygienically, with zero preservatives.';

function PageShell({ children, title = 'Fruit box' }) {
  return (
    <>
      <Head>
        <title>{`${title} | FreshBliss`}</title>
      </Head>
      <div className="fb-container py-14.5">
        <Link href="/products" className="inline-flex min-h-11 items-center text-nav-link text-brand-text hover:underline">
          ← All fruit boxes
        </Link>
        <div className="mt-4">{children}</div>
      </div>
    </>
  );
}

// The page for a box that has loaded. It is rendered with key={product.id}, so opening a different
// box starts with a fresh size, quantity and message, with no reset code.
function ProductDetail({ product, products, status }) {
  const { lines, addToCart } = useCart();
  const wishlist = useWishlist();
  const { zones, status: zonesStatus } = useZones();
  const { pincode: savedPincode, setPincode } = useSavedPincode();

  const [chosenSize, setChosenSize] = useState(product.sizes[0].id);
  const [qty, setQty] = useState(1);
  const [typedPincode, setTypedPincode] = useState(null); // null until they type: then the remembered one shows

  // If staff remove the chosen size while the page is open, fall back to the first one.
  const size = product.sizes.some((s) => s.id === chosenSize) ? chosenSize : product.sizes[0].id;

  // The pincode box starts with the one remembered in this browser, until they type their own.
  const pincodeInput = typedPincode ?? savedPincode;

  // How many more can be added: stock is shared by every size of the box, and one line holds at most 20.
  const inCartForBox = lines.filter((l) => l.productId === product.id).reduce((n, l) => n + l.qty, 0);
  const inCartForLine = lines.find((l) => l.productId === product.id && l.size === size)?.qty ?? 0;
  const room = Math.max(0, Math.min(product.stock - inCartForBox, MAX_QTY_PER_LINE - inCartForLine));

  // Never show (or add) more than can be added, even if stock drops while the page is open.
  const quantity = room > 0 ? Math.min(qty, room) : 0;

  const soldOut = product.stock <= 0;
  const price = unitPrice(product, size) ?? product.price;
  const wishlisted = wishlist.isWishlisted(product.id);

  function handleAdd() {
    const result = addToCart(product, { size, qty: quantity }); // shows a toast either way
    if (result.ok) setQty(1);
  }

  function handlePincode(value) {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    setTypedPincode(digits);
    if (PINCODE.test(digits)) setPincode(digits); // remember it for the cart and checkout
  }

  const accordionItems = [
    product.ingredients.length > 0 && {
      id: 'ingredients',
      title: 'Ingredients',
      content: (
        <ul className="flex flex-wrap gap-2">
          {product.ingredients.map((ingredient) => (
            <li key={ingredient} className="rounded-pill border border-line bg-surface-tag px-3 py-1 text-small text-brand-text">
              {ingredient}
            </li>
          ))}
        </ul>
      ),
    },
    { id: 'packaging', title: 'Packaging', content: <p>{product.packaging || DEFAULT_PACKAGING}</p> },
  ].filter(Boolean);

  let limitMessage = '';
  if (soldOut) limitMessage = 'This box is out of stock.';
  else if (room === 0) limitMessage = inCartForBox >= product.stock ? `All ${product.stock} of this box are already in your cart.` : `You can order at most ${MAX_QTY_PER_LINE} of one size.`;
  else if (room <= 5) limitMessage = `${room} more available.`;

  return (
    <PageShell title={product.name}>
      <Head>
        <meta name="description" content={product.description || `${product.name} from FreshBliss`} />
        {/* Structured data for search engines. The text is escaped (lib/seo.js), so it cannot close the tag early. */}
        <script key="product-jsonld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(buildProductJsonLd(product)) }} />
      </Head>

      <div className="grid items-start gap-8.5 md:grid-cols-2">
        <ProductGallery images={product.images} name={product.name} illustrative={product.placeholderImages} />

        <div>
          <div className="flex flex-wrap items-center gap-3">
            {product.badge && <span className="rounded-pill bg-gold-bright px-3 py-1 text-[12px] leading-none font-bold text-on-gold">{product.badge}</span>}
            <StockBadge stock={product.stock} />
          </div>

          <h1 className="mt-3 text-heading-2 text-brand-text">{product.name}</h1>
          {product.description && <p className="mt-2 text-lead text-ink-muted">{product.description}</p>}

          <p className="mt-4 text-kpi text-brand-text" aria-live="polite">
            ₹{price}
          </p>

          {/* How to keep it (chilled and frozen products only; nothing is drawn without a storage note) */}
          <StorageBadge storage={product.storage} className="mt-3" />

          <div className="mt-5">
            <SizeSelector sizes={product.sizes} basePrice={product.price} value={size} onChange={setChosenSize} disabled={soldOut} />
          </div>

          <div className="mt-5">
            <p className="text-nav-link text-ink">Quantity</p>
            <div className="mt-2">
              <QuantityStepper value={quantity} max={room} onChange={setQty} label={product.name} disabled={soldOut} />
            </div>
            <p role="status" className="mt-2 min-h-[1.5em] text-small text-ink-muted">
              {limitMessage}
            </p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {/* The buy bar. On a phone it is fixed to the bottom of the screen (frosted glass), so Add to Cart is
                always one tap away however far the visitor has scrolled; from tablet width up it is an ordinary
                button in the page. (fb-sticky-cta makes the footer leave room for it: styles/globals.css.) */}
            <div className="fb-no-print fb-sticky-cta fixed bottom-0 left-0 z-50 w-full border-t border-line/70 bg-surface-card/90 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md md:relative md:z-auto md:w-auto md:border-none md:bg-transparent md:p-0 md:backdrop-blur-none">
              <div className="mx-auto flex max-w-xl items-center gap-4 md:mx-0 md:max-w-none">
                <div className="shrink-0 md:hidden" aria-live="polite">
                  <p className="text-small text-ink-muted">{quantity > 1 ? `Total for ${quantity}` : 'Price'}</p>
                  <p className="font-serif text-[26px] leading-none font-bold text-brand-text">₹{price * Math.max(1, quantity)}</p>
                </div>
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={room === 0}
                  className="min-h-12 flex-1 rounded-full bg-gold-bright px-7 text-nav-link text-on-gold motion-safe:transition-all motion-safe:duration-200 hover:brightness-95 motion-safe:md:hover:scale-[1.03] disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-muted disabled:hover:brightness-100 md:flex-none"
                >
                  {soldOut ? 'Out of stock' : room === 0 ? 'Cannot add more' : (
                    <>
                      Add to Cart<span className="hidden md:inline"> · ₹{price * quantity}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => wishlist.toggleWishlist(product.id)}
              aria-pressed={wishlisted}
              className="min-h-12 rounded-full border border-green-accent px-5 text-nav-link text-brand-text hover:bg-surface-cream aria-pressed:bg-brand aria-pressed:text-on-brand"
            >
              {wishlisted ? 'Saved to wishlist' : 'Save to wishlist'}
            </button>
          </div>

          {/* Delivery estimate */}
          <section aria-labelledby="delivery-title" className="mt-6 rounded-xl border border-line bg-surface-card p-5 shadow-card">
            <h2 id="delivery-title" className="text-heading-3 text-ink">
              Delivery
            </h2>
            {product.deliveryTime && <p className="mt-1 text-small text-ink-muted">Usually delivered: {product.deliveryTime.toLowerCase()}.</p>}
            <label htmlFor="pdp-pincode" className="mt-3 block text-nav-link text-ink">
              Check your pincode
            </label>
            <input
              id="pdp-pincode"
              value={pincodeInput}
              onChange={(e) => handlePincode(e.target.value)}
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={6}
              placeholder="560001"
              className="mt-1 min-h-11 w-full max-w-[12rem] rounded-md border border-green-accent bg-surface-card px-3 text-body text-ink placeholder:text-ink-muted"
            />
            <ZoneStatus className="mt-3" pincode={pincodeInput} zones={zones} zonesStatus={zonesStatus} subtotal={price * Math.max(1, quantity)} />
          </section>
        </div>
      </div>

      {/* Where it grew, its energy and its benefits (only the facts the shop has added) */}
      <HarvestHealth product={product} />

      <ChefsNotes slug={product.id} category={product.category} />

      <section aria-labelledby="details-title" className="mt-10 max-w-3xl">
        <h2 id="details-title" className="text-heading-3 text-ink">
          About this box
        </h2>
        <div className="mt-3">
          <Accordion items={accordionItems} defaultOpenId={accordionItems[0].id} />
        </div>
      </section>

      {/* Cross-selling: other boxes that go with this one, each with a quick "+ Add" */}
      <RelatedProducts product={product} products={products} status={status} onAdd={addToCart} />
    </PageShell>
  );
}

export default function ProductPage() {
  const router = useRouter();
  const slug = router.isReady && typeof router.query.slug === 'string' ? router.query.slug : null;
  const { products, status, reload } = useProducts();
  const product = slug ? products.find((p) => p.id === slug) : null;

  if (status === 'loading' || !slug) {
    return (
      <PageShell>
        <ProductDetailSkeleton />
      </PageShell>
    );
  }

  if (status === 'error') {
    return (
      <PageShell>
        <Callout tone="danger" title="We could not load this fruit box.">
          Check your connection and try again.
          <div>
            <button type="button" onClick={reload} className="mt-3 min-h-11 rounded-pill bg-brand px-5 text-nav-link text-on-brand hover:brightness-110">
              Try again
            </button>
          </div>
        </Callout>
      </PageShell>
    );
  }

  if (!product) {
    return (
      <PageShell>
        <Callout title="We could not find this fruit box.">It may have sold out for good, or the link may be wrong.</Callout>
        <Link href="/products" className="mt-6 inline-grid min-h-11 place-items-center rounded-pill bg-gold-bright px-6 text-nav-link text-on-gold hover:brightness-95">
          See all fruit boxes
        </Link>
      </PageShell>
    );
  }

  return <ProductDetail key={product.id} product={product} products={products} status={status} />;
}
