// Skeleton screens for the cart and for lists of orders: grey shapes in the layout of the real content.
//
//   CartSkeleton         the cart page and the checkout page: item lines and the summary box
//   CartLinesSkeleton    just the item lines (used inside the slide-out cart)
//   OrderListSkeleton    the "My orders" list

import Bone from '@/components/Bone';

function LineSkeleton() {
  return (
    <div aria-hidden="true" className="flex gap-4 rounded-xl border border-line bg-surface-card p-4 shadow-card">
      <Bone className="size-24 shrink-0 rounded-md" /> {/* photo */}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <Bone className="h-5 w-2/3 rounded-sm" /> {/* name */}
          <Bone className="h-5 w-14 rounded-sm" /> {/* price */}
        </div>
        <Bone className="h-4 w-20 rounded-sm" /> {/* size */}
        <div className="mt-auto flex items-center gap-3">
          <Bone className="size-11 rounded-full" /> {/* - */}
          <Bone className="h-6 w-8 rounded-sm" />
          <Bone className="size-11 rounded-full" /> {/* + */}
        </div>
      </div>
    </div>
  );
}

export function CartLinesSkeleton({ count = 2, label = 'Loading your cart' }) {
  return (
    <>
      <p role="status" className="sr-only">
        {label}
      </p>
      <div className="flex flex-col gap-4.5">
        {Array.from({ length: count }, (_, i) => (
          <LineSkeleton key={i} />
        ))}
      </div>
    </>
  );
}

export default function CartSkeleton({ label = 'Loading your cart' }) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <CartLinesSkeleton count={2} label={label} />
      {/* the summary box */}
      <div aria-hidden="true" className="rounded-xl border border-line bg-surface-card p-6 shadow-card">
        <Bone className="h-6 w-40 rounded-sm" />
        <div className="mt-5 flex flex-col gap-3">
          <div className="flex justify-between gap-4">
            <Bone className="h-5 w-20 rounded-sm" />
            <Bone className="h-5 w-16 rounded-sm" />
          </div>
          <div className="flex justify-between gap-4">
            <Bone className="h-5 w-24 rounded-sm" />
            <Bone className="h-5 w-32 rounded-sm" />
          </div>
        </div>
        <Bone className="mt-6 h-13 w-full rounded-pill" /> {/* the button */}
      </div>
    </div>
  );
}

export function OrderListSkeleton({ count = 2, label = 'Loading your orders' }) {
  return (
    <>
      <p role="status" className="sr-only">
        {label}
      </p>
      <div className="flex flex-col gap-4.5">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} aria-hidden="true" className="rounded-xl border border-line bg-surface-card p-5 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-2">
                <Bone className="h-4 w-24 rounded-sm" /> {/* order number */}
                <Bone className="h-4 w-36 rounded-sm" /> {/* date */}
              </div>
              <Bone className="h-8 w-32 rounded-pill" /> {/* status */}
            </div>
            <div className="mt-4 flex flex-col gap-3">
              <Bone className="h-5 w-full rounded-sm" />
              <Bone className="h-5 w-3/4 rounded-sm" />
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <Bone className="h-8 w-28 rounded-sm" /> {/* total */}
              <div className="flex gap-3">
                <Bone className="h-11 w-28 rounded-pill" />
                <Bone className="h-11 w-24 rounded-pill" />
                <Bone className="h-11 w-24 rounded-pill" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
