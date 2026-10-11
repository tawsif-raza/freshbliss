// The price of a box, and, while it is on offer, its regular price crossed out with the saving beside it:
//   ₹127  ₹149  14% off
// Used by the product card and the product page. `regular` comes from regularUnitPrice() (lib/pricing.js) and is null
// when the product is not on offer, in which case only the price is drawn.
//
// A screen reader hears "₹127, regular price ₹149, 14% off" rather than two bare numbers.
//
//   price      the price now, whole rupees
//   regular    the regular price, or null
//   size       'card' (product grids) or 'page' (the product page's headline price)
//   muted      grey instead of green (an out-of-stock card)

import { percentOff } from '@/lib/pricing';

const PRICE_CLASS = {
  card: 'font-serif text-[30px] leading-none font-bold',
  page: 'text-kpi',
};

export default function PriceTag({ price, regular = null, size = 'card', muted = false, className = '' }) {
  const off = regular ? percentOff(regular, price) : 0;
  const onOffer = off > 0;

  return (
    <p className={`flex flex-wrap items-baseline gap-x-2 gap-y-1 ${className}`}>
      <span className={`${PRICE_CLASS[size]} ${muted ? 'text-ink-muted' : 'text-brand-text'}`}>₹{price}</span>
      {onOffer && (
        <>
          <span className="sr-only">, regular price ₹{regular}, {off}% off</span>
          <s aria-hidden="true" className={`text-ink-muted ${size === 'page' ? 'text-lead' : 'text-small'}`}>
            ₹{regular}
          </s>
          <span aria-hidden="true" className="rounded-pill bg-surface-tag px-2 py-0.5 text-[12px] leading-snug font-bold text-green-accent">
            {off}% off
          </span>
        </>
      )}
    </p>
  );
}
