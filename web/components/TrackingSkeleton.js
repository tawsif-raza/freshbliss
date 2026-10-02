// The loading screen for /orders/<id>: the same shape as the real tracking page (the order label and
// the "Live" pill, the headline, the status timeline and the order summary).

import Bone from '@/components/Bone';

export default function TrackingSkeleton({ label = 'Loading your order' }) {
  return (
    <>
      <p role="status" className="sr-only">
        {label}
      </p>
      <div aria-hidden="true">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Bone className="h-4 w-48 rounded-sm" /> {/* "Order <id>" */}
          <Bone className="h-8 w-20 rounded-pill" /> {/* Live */}
        </div>
        <div className="mt-2 flex min-h-[5.5rem] flex-col gap-3">
          <Bone className="h-9 w-3/4 rounded-sm" /> {/* headline */}
          <Bone className="h-5 w-48 rounded-sm" /> {/* expected by */}
        </div>

        <div className="mt-8.5 grid items-start gap-6 lg:grid-cols-2">
          {/* the status timeline: five steps */}
          <div className="rounded-xl border border-line bg-surface-card p-6 shadow-card">
            <Bone className="h-6 w-36 rounded-sm" />
            <div className="mt-5 flex flex-col gap-5">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Bone className="size-8 shrink-0 rounded-full" />
                  <Bone className="h-5 w-40 rounded-sm" />
                </div>
              ))}
            </div>
          </div>

          {/* the order summary */}
          <div className="rounded-xl border border-line bg-surface-card p-6 shadow-card">
            <Bone className="h-6 w-36 rounded-sm" />
            <div className="mt-5 flex flex-col gap-3">
              {Array.from({ length: 2 }, (_, i) => (
                <div key={i} className="flex justify-between gap-4">
                  <Bone className="h-5 w-2/3 rounded-sm" />
                  <Bone className="h-5 w-14 rounded-sm" />
                </div>
              ))}
            </div>
            <div className="mt-5 flex flex-col gap-3 border-t border-line pt-4">
              <Bone className="h-5 w-full rounded-sm" />
              <Bone className="h-5 w-full rounded-sm" />
              <Bone className="h-8 w-40 rounded-sm" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
