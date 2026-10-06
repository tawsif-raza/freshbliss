// The closing call to action at the bottom of the home page, before the footer: one short line and two buttons, so a
// visitor who has read the whole page is never left without a next step. Always dark (like the hero), so its cream and gold
// are fixed colours that do not change with the page theme. The words are in content/storefront.js (FINAL_CTA).

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import Reveal from '@/components/Reveal';
import { FINAL_CTA } from '@/content/storefront';

export default function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="fb-container pb-6 md:pb-10">
      <Reveal>
        <div className="relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-[#173f2a] to-[#214c34] px-6 py-14 text-center text-[#f5f1e9] shadow-2xl md:px-14 md:py-20">
          <div aria-hidden="true" className="absolute -top-24 -left-24 -z-10 size-72 rounded-full bg-[#c99b3b]/15 blur-2xl" />
          <div aria-hidden="true" className="absolute -right-20 -bottom-28 -z-10 size-80 rounded-full bg-[#f5f1e9]/10 blur-2xl" />

          <p className="text-label text-gold-bright">{FINAL_CTA.eyebrow}</p>
          <h2 id="cta-title" className="mx-auto mt-3 max-w-2xl text-heading-2 text-[#f5f1e9] md:text-[44px] md:leading-[1.12]">
            {FINAL_CTA.title}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lead text-[#f5f1e9]/90">{FINAL_CTA.text}</p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/products"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-gold-bright px-8 text-base font-bold text-[#173f2a] shadow-2xl motion-safe:transition-transform motion-safe:duration-300 motion-safe:hover:scale-105 hover:brightness-105"
            >
              Shop all boxes
              <ArrowRight size={18} strokeWidth={2.5} aria-hidden="true" />
            </Link>
            <a
              href="#delivery"
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#f5f1e9]/70 px-7 text-base font-bold text-[#f5f1e9] motion-safe:transition-colors hover:bg-[#f5f1e9]/15"
            >
              Check my pincode
            </a>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
