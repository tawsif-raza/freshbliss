// Whether the search palette (components/CommandPalette.js) is open, shared so the header's Search button and
// the keyboard shortcut agree. Ctrl+K (Windows, Linux) or Cmd+K (Mac) toggles it from any page.
//
// The key listener is added once when the app starts and removed when it goes away, so it never piles up.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const CommandPaletteContext = createContext(null);

export function CommandPaletteProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    function onKeyDown(event) {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
        event.preventDefault(); // the browser would otherwise focus its own search or address bar
        setIsOpen((wasOpen) => !wasOpen);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const value = useMemo(() => ({ isOpen, open, close }), [isOpen, open, close]);
  return <CommandPaletteContext.Provider value={value}>{children}</CommandPaletteContext.Provider>;
}

export function useCommandPalette() {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) throw new Error('useCommandPalette must be used inside <CommandPaletteProvider>.');
  return ctx;
}
