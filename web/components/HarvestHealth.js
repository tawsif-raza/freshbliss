// "Harvest & Health": where a box was grown, its energy, and what is good about it, as a row of small cards.
// Each card appears only if the product has that fact, and the whole section is left out for a product with
// none (an older product, say). See lib/harvest.js.
//
//   product  a normalised product ({ origin, calories, nutritionNote, keyBenefits })

import { Flame, Leaf, MapPin, Sparkles } from 'lucide-react';
import { hasHarvestFacts } from '@/lib/harvest';

function FactCard({ icon: Icon, label, children }) {
  return (
    <div className="rounded-xl border border-line/60 bg-surface-card p-5 shadow-card">
      <span className="grid size-10 place-items-center rounded-full bg-gold-bright text-on-gold">
        <Icon size={20} strokeWidth={2} aria-hidden="true" />
      </span>
      <p className="mt-3 text-label text-gold">{label}</p>
      <div className="mt-1 text-body text-ink">{children}</div>
    </div>
  );
}

export default function HarvestHealth({ product }) {
  const { origin, calories, nutritionNote, keyBenefits } = product;
  if (!hasHarvestFacts(product)) return null;

  return (
    <section aria-labelledby="harvest-title" className="mt-10">
      <h2 id="harvest-title" className="text-heading-3 text-ink">
        Harvest &amp; Health
      </h2>
      <div className="mt-4 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(15rem,1fr))]">
        {origin && (
          <FactCard icon={MapPin} label="Origin">
            <p className="font-bold">{origin}</p>
          </FactCard>
        )}
        {calories && (
          <FactCard icon={Flame} label="Energy">
            <p className="font-bold">{calories}</p>
            {nutritionNote && <p className="mt-1 text-small text-ink-muted">{nutritionNote}</p>}
          </FactCard>
        )}
        {keyBenefits.length > 0 && (
          <FactCard icon={Sparkles} label="Key benefits">
            <ul className="mt-1 flex flex-wrap gap-2">
              {keyBenefits.map((benefit) => (
                <li key={benefit} className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface-tag px-3 py-1 text-small text-brand-text">
                  <Leaf size={13} strokeWidth={2.25} aria-hidden="true" />
                  {benefit}
                </li>
              ))}
            </ul>
          </FactCard>
        )}
      </div>
    </section>
  );
}
