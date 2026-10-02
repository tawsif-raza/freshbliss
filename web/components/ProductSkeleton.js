// Skeleton screens for fruit boxes: grey shapes in the exact layout of the real thing while the live data
// loads, so the page does not jump when it arrives.
//
//   ProductSkeleton        one card in the product grid (same layout as ProductCard)
//   ProductGridSkeleton    a grid of them
//   ProductDetailSkeleton  a whole product page (same layout as /products/[slug])
//   MiniProductSkeleton    a small "You may also like" card

import Bone from '@/components/Bone';

export default function ProductSkeleton() {
  return (
    <div aria-hidden="true" className="flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface-card shadow-card">
      <Bone className="aspect-[4/3]" /> {/* photo */}
      <div className="flex flex-1 flex-col gap-3 px-4.5 pt-4 pb-4.5">
        <Bone className="h-6 w-2/3 rounded-sm" /> {/* name */}
        <Bone className="h-4 w-full rounded-sm" /> {/* description */}
        <Bone className="h-4 w-4/5 rounded-sm" />
        <Bone className="h-7 w-24 rounded-pill" /> {/* stock badge */}
        <div className="flex gap-3">
          <Bone className="h-14 w-24 rounded-md" /> {/* size chips */}
          <Bone className="h-14 w-24 rounded-md" />
        </div>
        <div className="mt-auto flex items-center justify-between gap-3 pt-2">
          <Bone className="h-9 w-20 rounded-sm" /> {/* price */}
          <Bone className="h-11 w-32 rounded-pill" /> {/* Add to Cart */}
        </div>
      </div>
    </div>
  );
}

export function ProductGridSkeleton({ count = 4, label = 'Loading fruit boxes' }) {
  return (
    <>
      <p role="status" className="sr-only">
        {label}
      </p>
      <div className="grid grid-cols-1 gap-4.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: count }, (_, i) => (
          <ProductSkeleton key={i} />
        ))}
      </div>
    </>
  );
}

export function MiniProductSkeleton() {
  return (
    <div aria-hidden="true" className="w-44 shrink-0 overflow-hidden rounded-xl border border-line bg-surface-card shadow-card sm:w-52">
      <Bone className="aspect-[4/3]" />
      <div className="flex flex-col gap-2 p-3">
        <Bone className="h-4 w-4/5 rounded-sm" />
        <div className="flex items-center justify-between gap-2">
          <Bone className="h-6 w-14 rounded-sm" />
          <Bone className="h-9 w-16 rounded-pill" />
        </div>
      </div>
    </div>
  );
}

export function ProductDetailSkeleton({ label = 'Loading this fruit box' }) {
  return (
    <>
      <p role="status" className="sr-only">
        {label}
      </p>
      <div aria-hidden="true" className="grid items-start gap-8.5 md:grid-cols-2">
        {/* gallery: big photo and four thumbnails */}
        <div>
          <Bone className="aspect-[4/3] rounded-xl" />
          <div className="mt-3 grid grid-cols-4 gap-3">
            {Array.from({ length: 4 }, (_, i) => (
              <Bone key={i} className="aspect-[4/3] rounded-md" />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex gap-3">
            <Bone className="h-6 w-20 rounded-pill" /> {/* badge */}
            <Bone className="h-7 w-24 rounded-pill" /> {/* stock */}
          </div>
          <Bone className="h-10 w-3/4 rounded-sm" /> {/* title */}
          <Bone className="h-5 w-full rounded-sm" />
          <Bone className="h-5 w-5/6 rounded-sm" />
          <Bone className="h-9 w-24 rounded-sm" /> {/* price */}
          <div className="flex gap-3">
            <Bone className="h-14 w-28 rounded-md" /> {/* sizes */}
            <Bone className="h-14 w-28 rounded-md" />
          </div>
          <Bone className="h-11 w-40 rounded-pill" /> {/* quantity */}
          <div className="flex gap-3">
            <Bone className="h-12 w-44 rounded-pill" /> {/* Add to Cart */}
            <Bone className="h-12 w-32 rounded-pill" /> {/* wishlist (the two together fit a 390px phone) */}
          </div>
          <Bone className="mt-2 h-36 w-full rounded-xl" /> {/* delivery card */}
        </div>
      </div>
      <div aria-hidden="true" className="mt-10 max-w-3xl">
        <Bone className="mb-3 h-6 w-40 rounded-sm" />
        <Bone className="h-14 w-full rounded-xl" /> {/* accordion */}
      </div>
    </>
  );
}
