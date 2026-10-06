// A round "back to top" button that appears once the visitor has scrolled a good way down a long page (the home page,
// the shop and the FAQ are long). It sits in the bottom-right corner; on a phone it floats above the tab bar
// (components/MobileBottomNav.js), and above the product page's buy bar when that is on screen (styles/globals.css).
// It scrolls smoothly, or instantly for visitors who asked their device for less motion, and moves focus to the top of the
// page so keyboard and screen-reader users land where the view is. Hidden when printing.

import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

const SHOW_AFTER_PX = 900;

export default function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_AFTER_PX);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function goTop() {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    document.getElementById('fbs-main')?.focus({ preventScroll: true });
  }

  return (
    <button
      type="button"
      onClick={goTop}
      aria-label="Back to top"
      tabIndex={visible ? 0 : -1}
      aria-hidden={visible ? undefined : true}
      className={`fb-back-to-top fb-no-print fixed right-4 z-40 grid size-12 place-items-center rounded-full bg-brand text-on-brand shadow-xl ring-1 ring-gold-bright/60 motion-safe:transition-all motion-safe:duration-300 hover:brightness-110 md:right-6 md:bottom-6 ${
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
      }`}
    >
      <ArrowUp size={22} strokeWidth={2.25} aria-hidden="true" />
    </button>
  );
}
