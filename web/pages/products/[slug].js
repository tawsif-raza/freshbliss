// One fruit box: /products/<id>
// A photo gallery, a size choice with the price following it, a quantity that stops at what we can
// actually sell, a delivery estimate for the visitor's pincode, and expandable details (ingredients,
// calories, packaging). Everything about the box is live: if the last one sells, the page says so.
//
// Calories and packaging text appear only if the shop owner has added them to the product in
// Firestore (see lib/catalog.js). A missing figure is left out, never made up.

import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import Accordion from '@/components/Accordion';
import Callout from '@/components/Callout';
import ProductGallery from '@/components/ProductGallery';
import QuantityStepper from '@/components/QuantityStepper';
import SizeSelector from '@/components/SizeSelector';
import StockBadge from '@/components/StockBadge';
import ZoneStatus from '@/components/ZoneStatus';
import { MAX_QTY_PER_LINE, useCart } from '@/context/CartContext';
import { useWishlist } from '@/context/WishlistContext';
import { useProducts } from '@/lib/catalog';
import { unitPrice } from '@/lib/pricing';
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

function Skeleton() {
  return (
    <div aria-hidden="true" className="grid gap-8.5 md:grid-cols-2">
      <div className="aspect-[4/3] rounded-xl bg-surface-sunken motion-safe:animate-pulse" />
      <div className="flex flex-col gap-4">
        <div className="h-8 w-2/3 rounded-sm bg-surface-sunken motion-safe:animate-pulse" />
        <div className="h-5 w-full rounded-sm bg-surface-sunken motion-safe:animate-pulse" />
        <div className="h-12 w-1/2 rounded-sm bg-surface-sunken motion-safe:animate-pulse" />
      </div>
    </div>
  );
}

// The page for a box that has loaded. It is rendered with key={product.id}, so opening a different
// box starts with a fresh size, quantity and message, with no reset code.
function ProductDetail({ product }) {
  const { lines, addToCart } = useCart();
  const wishlist = useWishlist();
  const { zones, status: zonesStatus } = useZones();
  const { pincode: savedPincode, setPincode } = useSavedPincode();

  const [chosenSize, setChosenSize] = useState(product.sizes[0].id);
  const [qty, setQty] = useState(1);
  const [feedback, setFeedback] = useState(null);
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
    const result = addToCart(product, { size, qty: quantity });
    setFeedback(result);
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
    product.calories !== null && {
      id: 'nutrition',
      title: 'Nutrition',
      content: (
        <p>
          About <span className="font-bold">{product.calories} kcal</span> per box.
          {product.nutritionNote && <span className="text-ink-muted"> {product.nutritionNote}</span>}
        </p>
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
      </Head>

      <div className="grid items-start gap-8.5 md:grid-cols-2">
        <ProductGallery images={product.images} name={product.name} />

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
            <button
              type="button"
              onClick={handleAdd}
              disabled={room === 0}
              className="min-h-12 rounded-pill bg-gold-bright px-7 text-nav-link text-on-gold motion-safe:transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-muted disabled:hover:brightness-100"
            >
              {soldOut ? 'Out of stock' : room === 0 ? 'Cannot add more' : `Add to Cart · ₹${price * quantity}`}
            </button>
            <button
              type="button"
              onClick={() => wishlist.toggleWishlist(product.id)}
              aria-pressed={wishlisted}
              className="min-h-12 rounded-pill border border-green-accent px-5 text-nav-link text-brand-text hover:bg-surface-cream aria-pressed:bg-brand aria-pressed:text-on-brand"
            >
              {wishlisted ? 'Saved to wishlist' : 'Save to wishlist'}
            </button>
          </div>

          <div role="status" className="mt-3 min-h-[1.5em] text-small">
            {feedback && (
              <p className={feedback.ok ? 'text-brand-text' : 'text-danger'}>
                {feedback.message}{' '}
                {feedback.ok && (
                  <Link href="/cart" className="font-bold underline">
                    View cart
                  </Link>
                )}
              </p>
            )}
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

      <section aria-labelledby="details-title" className="mt-10 max-w-3xl">
        <h2 id="details-title" className="text-heading-3 text-ink">
          About this box
        </h2>
        <div className="mt-3">
          <Accordion items={accordionItems} defaultOpenId={accordionItems[0].id} />
        </div>
      </section>
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
        <Skeleton />
        <p role="status" className="sr-only">
          Loading this fruit box
        </p>
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

  return <ProductDetail key={product.id} product={product} />;
}
