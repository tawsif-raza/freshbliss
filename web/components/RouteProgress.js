// The thin gold bar across the very top of the screen while a page loads (Next.js router events, no extra package).
//
// It starts on routeChangeStart, creeps toward 90% (slower the closer it gets, so it never looks finished before
// the page is), then jumps to 100% and fades out on routeChangeComplete or routeChangeError. A short delay before
// it appears keeps instant navigations from flashing it. It is decorative (aria-hidden) and not printed.

import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';

const SHOW_AFTER_MS = 120;
const TICK_MS = 200;

export default function RouteProgress() {
  const router = useRouter();
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const shown = useRef(false);

  useEffect(() => {
    let showTimer = null;
    let tick = null;
    let hideTimer = null;
    const clearAll = () => {
      clearTimeout(showTimer);
      clearInterval(tick);
      clearTimeout(hideTimer);
    };

    const start = (url, { shallow }) => {
      if (shallow) return;
      clearAll();
      showTimer = setTimeout(() => {
        shown.current = true;
        setWidth(8);
        setVisible(true);
        tick = setInterval(() => setWidth((w) => w + (90 - w) * 0.1), TICK_MS);
      }, SHOW_AFTER_MS);
    };

    // Only finish the bar if it was ever shown (a fast navigation never showed it).
    const done = () => {
      clearAll();
      if (!shown.current) return;
      shown.current = false;
      setWidth(100);
      hideTimer = setTimeout(() => {
        setVisible(false);
        setWidth(0);
      }, 300);
    };

    router.events.on('routeChangeStart', start);
    router.events.on('routeChangeComplete', done);
    router.events.on('routeChangeError', done);
    return () => {
      router.events.off('routeChangeStart', start);
      router.events.off('routeChangeComplete', done);
      router.events.off('routeChangeError', done);
      clearAll();
    };
  }, [router.events]);

  return (
    <div
      aria-hidden="true"
      style={{ width: `${width}%`, opacity: visible ? 1 : 0 }}
      className="fb-no-print pointer-events-none fixed top-0 left-0 z-50 h-1 bg-gold-bright shadow-[0_0_8px_var(--fb-gold-bright)] transition-[width,opacity] duration-200 ease-out"
    />
  );
}
