// Whether the slide-out cart is open. Just that one fact, shared, so the header's cart button, a toast's
// "View cart" and the drawer itself can all agree. The drawer's contents live in components/CartDrawer.js.

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const CartDrawerContext = createContext(null);

export function CartDrawerProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const value = useMemo(() => ({ isOpen, open, close }), [isOpen, open, close]);
  return <CartDrawerContext.Provider value={value}>{children}</CartDrawerContext.Provider>;
}

export function useCartDrawer() {
  const ctx = useContext(CartDrawerContext);
  if (!ctx) throw new Error('useCartDrawer must be used inside <CartDrawerProvider>.');
  return ctx;
}
