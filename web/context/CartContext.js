// Shopping cart state.
//
// What is stored: only the customer's CHOICES, as lines of
//   { productId, size, qty }
// That is exactly what the server reads at checkout (createCheckout), and it is
// the only shape the Firestore rules let a cart hold. Names, prices and stock
// are NOT stored. They are looked up live from the catalogue, so a price change
// in Firestore shows up in the cart straight away and a stale price can never
// be saved. The server still recalculates everything when the customer pays.

import { createContext, useCallback, useContext, useMemo } from 'react';
import { useToast } from '@/components/ToastProvider';
import { useCartDrawer } from '@/context/CartDrawerContext';
import { useProducts } from '@/lib/catalog';
import { usePersistedList } from '@/lib/usePersistedList';

const STORAGE_KEY = 'freshbliss:cart:v1';

// Same limits the server enforces in createCheckout.
const MAX_LINES = 30;
export const MAX_QTY_PER_LINE = 20;

const SAFE_ID = /^[A-Za-z0-9_-]{1,100}$/;

// Clean whatever is in localStorage: keep valid lines, merge duplicates, cap sizes.
function sanitizeLines(value) {
  if (!Array.isArray(value)) return [];
  const merged = new Map();
  for (const raw of value) {
    const { productId, size, qty } = raw ?? {};
    if (typeof productId !== 'string' || !SAFE_ID.test(productId)) continue;
    if (typeof size !== 'string' || !SAFE_ID.test(size)) continue;
    if (!Number.isInteger(qty) || qty < 1) continue;
    const key = `${productId}|${size}`;
    const prev = merged.get(key);
    merged.set(key, { productId, size, qty: Math.min(MAX_QTY_PER_LINE, (prev?.qty ?? 0) + qty) });
  }
  return [...merged.values()].slice(0, MAX_LINES);
}

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const { list: lines, commit, current, hydrated } = usePersistedList(STORAGE_KEY, sanitizeLines);
  const { products, status: catalogStatus } = useProducts();
  const toast = useToast();
  const drawer = useCartDrawer();

  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  // ---- WHEN LOGIN ARRIVES (Phase 3: Firebase Auth) ----
  // Guests: this localStorage cart is the source of truth.
  // After sign-in, merge it into Firestore once:
  //   1. read carts/{uid} (the server-side cart)
  //   2. for every guest line, add its qty to the matching productId + size
  //      line (cap at stock and MAX_QTY_PER_LINE), or add it as a new line
  //   3. write the result to carts/{uid} as
  //        { items: [{ productId, size, qty }], updatedAt: serverTimestamp() }
  //      (plus note / tip / promoCode / pincode later). Our `lines` already have
  //      this exact shape, and the security rules reject any other fields.
  //   4. from then on, listen to carts/{uid} and keep localStorage only as an
  //      offline cache. On sign-out, clear it so the next guest starts empty.

  // Lines joined with live product data. This is what the UI should render.
  // The field names (id, name, price, detail, qty, stock, image) match the
  // design system's Cart component, so it can take `items` directly.
  const items = useMemo(
    () =>
      lines.map((line) => {
        const product = productsById.get(line.productId);
        const size = product?.sizes.find((s) => s.id === line.size);
        const available = Boolean(product && size);
        const unitPrice = available ? product.price + size.extra : 0; // same sum the server does
        return {
          id: `${line.productId}:${line.size}`,
          productId: line.productId,
          size: line.size,
          sizeLabel: size?.label ?? line.size,
          name: product?.name ?? 'Unavailable item',
          detail: size?.label ?? line.size,
          image: product?.images[0] ?? null,
          qty: line.qty,
          stock: product?.stock ?? 0,
          price: unitPrice,
          lineTotal: unitPrice * line.qty,
          available, // false if the box was removed from the catalogue
          inStock: available && product.stock >= line.qty,
        };
      }),
    [lines, productsById],
  );

  // Preview only. The server recomputes this (fees, promo and tip come later).
  const subtotal = useMemo(() => items.reduce((sum, i) => sum + (i.available ? i.lineTotal : 0), 0), [items]);
  const itemCount = useMemo(() => lines.reduce((sum, l) => sum + l.qty, 0), [lines]);

  // Add a box, with no message shown. `product` comes from useProducts(). Returns { ok, message }.
  const tryAdd = useCallback(
    (product, { size, qty = 1 } = {}) => {
      const sizeId = size ?? product.sizes[0].id;
      if (!product.sizes.some((s) => s.id === sizeId)) {
        return { ok: false, message: 'That size is not available.' };
      }
      if (product.stock <= 0) {
        return { ok: false, message: `${product.name} is out of stock.` };
      }

      const lines = current();
      const want = Math.max(1, Math.floor(qty));
      const existing = lines.find((l) => l.productId === product.id && l.size === sizeId);
      // Stock is shared by every size of the same box, like the server counts it.
      const inCartForProduct = lines.filter((l) => l.productId === product.id).reduce((n, l) => n + l.qty, 0);

      const stockLeft = product.stock - inCartForProduct;
      const room = Math.min(stockLeft, MAX_QTY_PER_LINE - (existing?.qty ?? 0));
      if (room <= 0) {
        return {
          ok: false,
          message:
            stockLeft <= 0
              ? `All ${product.stock} of this box are already in your cart.`
              : `You can order at most ${MAX_QTY_PER_LINE} of one box.`,
        };
      }
      if (!existing && lines.length >= MAX_LINES) {
        return { ok: false, message: 'Your cart is full.' };
      }

      const add = Math.min(want, room);
      commit(
        existing
          ? lines.map((l) => (l === existing ? { ...l, qty: l.qty + add } : l))
          : [...lines, { productId: product.id, size: sizeId, qty: add }],
      );
      return { ok: true, message: add < want ? `Added ${add}. That is the most we can add.` : 'Added to cart.' };
    },
    [commit, current],
  );

  // Add a box and tell the customer what happened with a toast (a success with a "View cart" button, or
  // the reason it could not be added). Pass { silent: true } to add without a toast: the Reorder button does
  // that and shows ONE summary instead of a toast per box. Returns { ok, message } either way.
  const addToCart = useCallback(
    (product, options = {}) => {
      const result = tryAdd(product, options);
      if (!options.silent) {
        if (result.ok) {
          const plain = result.message === 'Added to cart.';
          toast.success(plain ? `${product.name} added to your cart.` : `${product.name}: ${result.message}`, {
            action: { label: 'View cart', onClick: drawer.open },
          });
        } else {
          toast.error(result.message);
        }
      }
      return result;
    },
    [tryAdd, toast, drawer.open],
  );

  // Remove one line. Leave `size` out to remove every size of that box.
  const removeFromCart = useCallback(
    (productId, size) => {
      commit(current().filter((l) => !(l.productId === productId && (size === undefined || l.size === size))));
    },
    [commit, current],
  );

  // The most a line can hold: the box's stock minus what the OTHER sizes of the
  // same box already use, and never more than MAX_QTY_PER_LINE. The "+" button
  // is disabled at this number. Unknown product: only the per-line limit applies.
  const getMaxQuantity = useCallback(
    (productId, size) => {
      const product = productsById.get(productId);
      if (!product) return MAX_QTY_PER_LINE;
      const otherSizes = current()
        .filter((l) => l.productId === productId && l.size !== size)
        .reduce((n, l) => n + l.qty, 0);
      return Math.min(MAX_QTY_PER_LINE, Math.max(1, product.stock - otherSizes));
    },
    [current, productsById],
  );

  // Set a line's quantity. Below 1 removes it. Above stock or the limit is
  // clamped. Returns the quantity that was actually saved.
  const updateQuantity = useCallback(
    (productId, size, qty) => {
      if (!Number.isFinite(qty)) return null;
      const lines = current();
      const line = lines.find((l) => l.productId === productId && l.size === size);
      if (!line) return null;

      const wanted = Math.floor(qty);
      if (wanted < 1) {
        commit(lines.filter((l) => l !== line));
        return 0;
      }

      const next = Math.min(wanted, getMaxQuantity(productId, size));
      commit(lines.map((l) => (l === line ? { ...l, qty: next } : l)));
      return next;
    },
    [commit, current, getMaxQuantity],
  );

  const clearCart = useCallback(() => commit([]), [commit]);

  const value = useMemo(
    () => ({
      lines,
      items,
      itemCount,
      subtotal,
      hydrated, // false until saved data is loaded (avoid flashing "empty cart")
      catalogStatus, // 'loading' | 'ready' | 'error': prices appear once this is 'ready'
      addToCart,
      removeFromCart,
      updateQuantity,
      getMaxQuantity,
      clearCart,
    }),
    [lines, items, itemCount, subtotal, hydrated, catalogStatus, addToCart, removeFromCart, updateQuantity, getMaxQuantity, clearCart],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>.');
  return ctx;
}
