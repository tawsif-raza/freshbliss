// The search palette: press Ctrl+K (Cmd+K on a Mac) or the Search button in the header, type, and pick a fruit box.
// It filters the products already loaded in the browser (lib/search.js), so results appear as you type.
//
// It is a real <dialog>, like the slide-out cart: the browser traps the keyboard inside it, Esc closes it, the
// page behind is not reachable, and focus goes back to whatever had it before (the Search button, say).
// It is frosted glass: the page colour at 80% over a blurred, dimmed page.
//
// Keyboard: type to search, Up/Down to move through the results, Enter to open the highlighted one.
// For screen readers it is a combobox with a listbox of options; the highlighted option is announced.
// Choosing a result goes to that box's page and closes the palette.

import { useRouter } from 'next/router';
import { useEffect, useId, useRef, useState } from 'react';
import { CornerDownLeft, Search } from 'lucide-react';
import { useCommandPalette } from '@/context/CommandPaletteContext';
import { useProducts } from '@/lib/catalog';
import { searchProducts } from '@/lib/search';

// The inside of the palette. It exists only while the palette is open, so the typed text and the highlighted
// row start fresh every time, with no reset code.
function PaletteBody({ onChoose }) {
  const { products, status } = useProducts();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState(0);
  const listId = useId();
  const optionId = (i) => `${listId}-option-${i}`;

  const results = searchProducts(products, query);
  const active = Math.min(picked, Math.max(0, results.length - 1));

  function onKeyDown(event) {
    if (results.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setPicked((active + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setPicked((active - 1 + results.length) % results.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      onChoose(results[active]);
    }
  }

  let message = '';
  if (status === 'loading') message = 'Loading the fruit boxes...';
  else if (status === 'error') message = 'We could not load the fruit boxes. Check your connection and try again.';
  else if (results.length === 0) message = `No fruit boxes match "${query.trim()}".`;

  return (
    <>
      <div className="flex items-center gap-3 border-b border-line px-5">
        <Search size={22} className="shrink-0 text-ink-muted" aria-hidden="true" />
        <input
          type="text"
          role="combobox"
          aria-label="Search fruit boxes"
          aria-expanded={results.length > 0}
          aria-controls={listId}
          aria-activedescendant={results.length > 0 ? optionId(active) : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPicked(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search fruit boxes..."
          className="min-h-16 w-full border-0 bg-transparent text-lead text-ink outline-none placeholder:text-ink-muted focus-visible:outline-none"
        />
        <kbd className="hidden shrink-0 rounded-md border border-line px-2 py-1 text-[12px] leading-none text-ink-muted sm:block">Esc</kbd>
      </div>

      <div className="max-h-[50vh] overflow-y-auto p-2">
        {message ? (
          <p role="status" className="px-3 py-6 text-center text-body text-ink-muted">
            {message}
          </p>
        ) : (
          <>
            <p className="px-3 pt-2 pb-1 text-label text-gold">{query.trim() ? 'Results' : 'Popular boxes'}</p>
            <ul id={listId} role="listbox" aria-label="Fruit boxes">
              {results.map((product, i) => (
                <li
                  key={product.id}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === active}
                  onMouseMove={() => setPicked(i)}
                  onClick={() => onChoose(product)}
                  className={`flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 ${i === active ? 'bg-brand text-on-brand' : 'text-ink'}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-body font-bold">{product.name}</span>
                    <span className={`block truncate text-small ${i === active ? 'text-on-brand/80' : 'text-ink-muted'}`}>
                      {[product.category, product.stock <= 0 ? 'Out of stock' : null].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-body font-bold">
                    ₹{product.price}
                    {i === active && <CornerDownLeft size={16} aria-hidden="true" />}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <p className="hidden border-t border-line px-5 py-3 text-small text-ink-muted sm:block">↑ ↓ to move · Enter to open · Esc to close</p>
    </>
  );
}

export default function CommandPalette() {
  const { isOpen, close } = useCommandPalette();
  const router = useRouter();
  const dialogRef = useRef(null);

  // Open or close the real dialog to match.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
      dialog.querySelector('input')?.focus();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // The page behind must not scroll while the palette is open.
  useEffect(() => {
    if (!isOpen) return undefined;
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = before;
    };
  }, [isOpen]);

  function choose(product) {
    close();
    router.push(`/products/${product.id}`);
  }

  return (
    <dialog
      ref={dialogRef}
      aria-label="Search"
      onClose={close} // Esc (the browser closes the dialog itself) and our own close both end up here
      onClick={(event) => {
        if (event.target === dialogRef.current) close(); // a click on the dimmed area
      }}
      className="fb-no-print m-0 h-full max-h-none w-full max-w-none bg-transparent p-0 backdrop:bg-black/40 backdrop:backdrop-blur-md"
    >
      <div className="mx-auto mt-[12vh] w-[calc(100%-2rem)] max-w-xl overflow-hidden rounded-2xl border border-line/60 bg-surface-page/80 text-ink shadow-2xl backdrop-blur-xl">
        {isOpen && <PaletteBody onChoose={choose} />}
      </div>
    </dialog>
  );
}
